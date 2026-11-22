# 手机端真题子系统移植方案（PWA / 浏览器）

> 目标：在手机浏览器 PWA 中复刻桌面端"批量导入 PDF → 自动识别真题/解析/听力 → 入库归类 → 真题阅读器（片段浏览、PDF 渲染、批注、A/B 听力）"。
> 文件来源：仅 PDF（听力为 mp3/wav/m4a 等音频）。老 `.doc`、扫描件 OCR 不在范围内。

## 1. 桌面端现状（要被移植的部分）

### 1.1 数据层（sql.js，Node 文件系统）
- 数据库：`electron/database/connection.ts`，sql.js 内存库 + 落盘 `cet4-coach.db`，迁移建表。
- 真题相关表：`exam_papers`、`exam_questions`、`exam_paper_resources`、`exam_import_batches`、`exam_audio`、`collection_paper`、`collection_audio`、`collection_analysis`、`pending_analysis_import`、`content_segment`、`exam_wrong_answers`、`exam_annotations`。
- 仓储：`electron/database/repositories/exam-collection.repository.ts`（合集/卷子/片段/音频/待绑定/批注等约 30 个方法）。
- 文件存储：PDF/音频以**本机路径**保存，入库记 `file_path` / `file_hash` / `file_size`；读取时 `readFileSync` 取字节。

### 1.2 解析层
- `electron/lib/exam-semantic-parser.ts`：pdf.js 抽文字 → 切片段 → 判定 `paper/analysis/listening_script/answer`，识别类型/年份/场次/套号。
- Node 专属依赖：`node:fs`（readFileSync/statSync）、`node:crypto`（sha256）、`node:path`、`createRequire`/`pathToFileURL`（worker 定位）。
- 纯可复用部分：pdf.js 文本抽取、行/块构建、角色判定、元信息推断逻辑。

### 1.3 IPC 与桥接
- `electron/ipc/exam-collection.handler.ts`：选文件对话框、解析、保存合集/音频、待绑定、批注、音频字节读取。
- `electron/preload.ts` 暴露约 40 个 `exam*` / `collection*` 方法。

### 1.4 阅读器
- `src/components/exam/ExamCollectionReader.vue`：合集/卷子/片段组织、A/B 听力播放器、批注工具条。
- `src/components/exam/ExamSegmentPdfPane.vue`：按片段坐标框在 PDF 上定位渲染、文字层、圈画。
- 批注：`exam_annotations` 表 + `PdfInkToolRail` / `pdf-ink`。

## 2. 浏览器 PWA 约束（硬限制）

| 项 | 桌面端 | 浏览器 PWA | 改造方式 |
|---|---|---|---|
| 文件访问 | 本机路径 + readFileSync | 无路径，只能 `<input type=file>` 拿字节 | 选文件后字节入 IndexedDB，按 id 取字节 |
| 数据库 | sql.js 落盘文件 | sql.js wasm 可在浏览器跑；持久化需把导出的 db 字节存 IndexedDB | 引入 sql.js browser wasm，启动时从 IndexedDB 载入，变更后回写 |
| 哈希 | node:crypto sha256 | 用 Web Crypto `crypto.subtle.digest('SHA-256')` | 解析器去 Node 化 |
| 文件路径 | 字符串路径 | 不存在 | 全部改为资源 id + IndexedDB 字节引用 |
| 音频 | 读文件路径喂 `<audio>` | 选音频后存字节，用 `URL.createObjectURL(blob)` 播放 | 音频字节入 IndexedDB，播放时生成 ObjectURL |
| 批注/圈画 | 存坐标几何 + 本地文件 | 同样存 IndexedDB，坐标体系沿用 normalized-0-1 | 批注记录改存浏览器库 |
| wasm 体积 | 本地加载 | 需打进 PWA 静态资源 | sql-wasm-browser.wasm（约 660KB）随包发布 |

## 3. 分阶段实施拆解

### 阶段 A：浏览器数据层（IndexedDB + sql.js 适配）✅ 已落地
1. 引入 `sql.js` browser 构建，`locateFile` 指向打包后的 wasm。
2. 新建 `src/mobile/exam/db.ts`：初始化内存库 → 跑与桌面一致的建表/迁移 SQL；启动从 IndexedDB 载入上次 db 字节，脏标记后回写。
3. 浏览器版仓储层：把 `exam-collection.repository.ts` 的 SQL 逻辑平移到前端，`DbWrapper` 改为浏览器 sql.js 实例；去掉文件系统调用。
4. 资源存储：IndexedDB 分库存 PDF 字节、音频字节；表内只存资源 id/哈希/大小/文件名，不再存路径。

**已落地文件（本地未提交）**
- `src/mobile/exam/idb.ts`：IndexedDB 库 `vocflow-mobile-exam`，store `db-snapshot`（整库字节快照）与 `files`（按资源 id 存 PDF/音频字节、文件名、mime）。
- `src/mobile/exam/schema.ts`：与桌面对齐的合集/卷子/音频/解析/待绑定/片段/批注建表 SQL。
- `src/mobile/exam/db.ts`：sql.js 浏览器单例；`initExamDb()` 载入快照或空库 → 跑迁移；`prepare/exec/run/transaction` 对齐桌面 `DbWrapper`；写操作置脏，`persist()` 整库 export 回写 IndexedDB。
- `src/mobile/exam/repository.ts`：`ExamCollectionRepository` 平移桌面仓储全部方法，`getExamRepository()` 单例。
- `vite.mobile.config.ts`：closeBundle 拷贝 `sql-wasm-browser.wasm` 到 `dist-mobile/assets`；注入 `__VOCFLOW_SQLJS_WASM_URL__`。
- `src/main.ts`：移动端启动时预热 `initExamDb()`。
- 待阶段 C 接入：文件字节仍按资源 id 存 `files` store；表内 `source_file_path` 暂沿用相对引用，后续改为资源 id。

### 阶段 B：解析器去 Node 化移植 ✅ 已落地
1. 抽离 `exam-semantic-parser.ts` 中与 fs/crypto/path 无关的纯逻辑为共享模块。
2. 浏览器版入口：接收 `ArrayBuffer`（PDF 字节）而非路径；哈希用 Web Crypto；workerSrc 指向 PWA 静态资源。
3. 复用现有片段/角色/元信息推断，输出与桌面一致的 `ExamPdfSemanticAnalysis`。

**已落地文件（本地未提交）**
- `src/mobile/exam/metadata.ts`：平移 `detectMetadata/detectSeason/detectPaperType/detectYear` 纯正则推断，无 Node 依赖。
- `src/mobile/exam/parser.ts`：浏览器版语义解析；入参 `{bytes, fileName, filePath?}`；pdf.js worker 指向 `./assets/pdf.worker.min.mjs`；行块构建/角色判定/片段切分/元信息推断与桌面一致；另含 `extractTextInPdfRects` 浏览器版。
- `src/mobile/exam/sha256.ts`：优先 `crypto.subtle.digest`，非安全上下文（局域网 HTTP）自动降级纯 JS SHA-256；三个标准向量已与 Node crypto 比对一致。
- 注意：浏览器 `filePath` 仅作不透明资源引用键，不再是磁盘路径；阶段 C 入库时按资源 id 关联 IndexedDB 字节。

### 阶段 C：移动端导入流程 ✅ 已落地
1. 多选 PDF（`<input type=file multiple accept=application/pdf>`）+ 多选音频。
2. 逐文件：解析 → 生成片段 → 仓储建合集/卷子/片段；解析自动绑定到对应卷子，绑不上进待绑定列表。
3. 音频按合集 A/B 槽位绑定，字节入 IndexedDB。
4. 复用桌面导入对话框的元信息确认 UI（类型/年份/场次/套号/角色），改调浏览器桥接。

**已落地文件（本地未提交）**
- `src/mobile/exam/stage.ts`：浏览器选文件内存暂存；`stageExamFiles` 生成含真实文件名/后缀的不透明资源 id；首读字节后释放 File 引用；`unstageFile` 在落库成功后清除暂存。
- `src/mobile/exam/importService.ts`：平移桌面 `exam-collection.handler.ts` 的选文件解析、哈希去重、合集/卷子/片段建绑、待绑定、A/B 音频入库、合集元信息更新/合并、合集删除、待绑定绑定/丢弃、音频字节读取、片段手动增改删、批注增改删查。文件字节先入内存暂存，保存时落 `files` store。
- `src/mobile/mobileApi.ts`：把 `pickCollectionPdfs/pickCollectionAudio/pickCollectionAudioFiles/analyzeCollectionPdf/analyzeCollectionAudio/saveCollectionPdfImport/saveCollectionAudioImport/importCollectionAudio/getExamCollections/getExamCollection/getPendingAnalyses/reorderExamCollections/bindPendingAnalysis/discardPendingAnalysis/updateExamCollectionMetadata/deleteExamCollection/getCollectionAudioData/removeCollectionAudio/readCollectionSourcePdf/extractExamSegmentText/createManualExamSegment/updateExamSegment/deleteExamSegment/getExamAnnotations/addExamAnnotation/updateExamAnnotationGeometry/deleteExamAnnotation` 接到浏览器服务；`pickCollectionPdfFolder` 浏览器无文件夹选择能力，返回兜底提示。
- 校验：`vue-tsc --noEmit` 通过；`vite build --config vite.mobile.config.ts` 通过。
- 待阶段 D 实测：阅读器取合集详情/片段/PDF 字节/批注/音频 ObjectURL 的真机流程；整库快照回写体积与性能待合集增多后实测。

### 阶段 D：移动端真题阅读器适配 ✅ 已落地（待真机实测）
1. 阅读器改为从浏览器仓储按合集 id 取详情（合集/卷子/片段/音频/批注）。
2. PDF 片段面板：从 IndexedDB 取字节喂 pdf.js；坐标定位、文字层沿用；适配手机屏幕缩放与滚动。
3. 批注：圈画工具条 + 批注记录存浏览器库。
4. 听力：ObjectURL 播放，A/B 槽位切换、倍速、进度。

**落地说明**
- 阅读器 `ExamCollectionReader.vue`、片段面板 `ExamSegmentPdfPane.vue`、批注对话框 `ExamAnnotationDialog.vue` 直接复用桌面组件；其数据/字节/批注全部走阶段 C 已接通的浏览器桥接（`getExamCollection` / `readCollectionSourcePdf` / `getCollectionAudioData` / `getExamAnnotations` / `addExamAnnotation` / `deleteExamAnnotation` / `createManualExamSegment` / `updateExamSegment` / `deleteExamSegment`），无需另写浏览器专用视图。
- 阅读器音频：桥接返回 Uint8Array，组件 `slice` 拷贝后 `URL.createObjectURL(blob)` 播放，A/B 切换、倍速、进退步长沿用原逻辑。
- 片段面板：pdf.js worker / cmaps / 标准字体 / sql-wasm 均已打进 `dist-mobile/assets`；笔迹 `PdfInkManager` 用 pointer 事件，手机可画；文字选段/双击查词当前仍绑定鼠标事件，真机长按选词待后续优化。
- `ExamHubView.vue`：移动端头部同时保留"批量导入真题 / 听力"（打开导入对话框，走浏览器多选）与"打开本地文件"（文献库快速阅读兜底）；空态文案同步更新。
- `db.ts`：整库导出时 `export().slice()` 复制一份 ArrayBuffer 再写 IndexedDB，避免 WASM 内存偏移/detach 导致快照损坏。
- 校验：`vue-tsc --noEmit` 通过；`vite build --config vite.mobile.config.ts` 通过；桌面浏览器预览打开大学板块，合集列表/分类卡片/导入对话框正常渲染，无控制台报错。
- 待真机实测：多选 PDF+音频导入 → 自动识别题干/解析/绑定 A/B → 阅读器翻页渲染 → 片段坐标定位 → 笔迹/框选批注保存 → 听力 ObjectURL 播放；整库快照回写体积与性能待合集增多后观察。

### 阶段 E：桥接与兜底 ✅ 已落地
1. `mobileApi.ts` 实现上述 `exam*`/`collection*` 方法，对接浏览器仓储；未实现项保留兜底提示。
2. 移除/替换 ExamHubView 中仍指向桌面 IPC 的调用。

**落地说明**
- 合集主流程桥接方法全部显式接到浏览器服务（见阶段 C 清单）；`showCollectionSource` 浏览器无本地文件夹位置，返回明确兜底提示。
- 旧"真题资源集/试卷库"（`selectExamResourceFiles/Folder`、`scanExamResourceFiles`、`importExamResourceSet`、`getExamSets` 等）与旧"真题文档库"（`openExamDocument` 等）在移动端无入口引用，继续走 Proxy 兜底，不会触达桌面 IPC。
- `ExamBatchImportDialog.vue` 为桌面旧组件，移动端未引用。
- 校验：`vue-tsc --noEmit` 通过；`vite build --config vite.mobile.config.ts` 通过；浏览器预览大学板块渲染正常、无控制台报错。
- 遗留（非阻塞）：文字选段/双击查词绑定鼠标事件，真机长按选词待后续优化；整库快照回写体积/性能待合集增多后实测。

## 4. 风险与注意点
- **sql.js 持久化**：内存库每次变更后整库导出回写 IndexedDB，合集/片段增多后写入体积与性能需实测；必要时改纯 IndexedDB 表结构，不强制 sql.js。
- **PDF 坐标精度**：手机屏幕视口与桌面不同，片段坐标框缩放映射需在面板内重新校准。
- **wasm 加载**：PWA 离线缓存需把 wasm 纳入 Service Worker 缓存清单。
- **体积**：sql.js wasm + pdf.js worker/cmaps/字体叠加，PWA 首包体积需评估代码分割。
- **数据隔离**：手机端浏览器库与桌面端数据库互不相通，不做跨端同步。

## 5. 建议落地顺序
A（数据层跑通建表/读写）→ B（解析器出片段）→ C（导入入库归类）→ D（阅读器 + 批注 + 听力）→ E（桥接收尾）。
每阶段可独立构建验证，避免一次性大改无法回退。
