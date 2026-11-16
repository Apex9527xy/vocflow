# VocFlow

VocFlow 是面向 Windows、Android 和 iPhone 的英语词汇、真题阅读与句式学习工具。桌面端使用 Electron + Vue；移动端使用 Vue + Capacitor；官网与安装包分发采用 GitHub Pages 和 GitHub Release，学习数据默认只保存在设备本地。

## 在线架构

- 官网：GitHub Pages 发布 `docs/` 静态站点。
- PWA：官网构建时把移动版输出到 `docs/app/`，入口为 `https://vocflow.cc.cd/app/`。
- 安装包：GitHub Releases 托管 Windows EXE、Android APK、未签名 iPhone IPA、PWA ZIP 与 SHA256。
- 客户端：不提供账号、云同步、远程课堂或内置留言入口；学习数据默认保存在设备本地。

## 本地开发

```powershell
pnpm install
pnpm dev
```

提交前运行：

```powershell
pnpm run type-check
pnpm run build:main
pnpm run build:renderer
pnpm run build:mobile
pnpm run verify:site
```

## 移动端

移动 Web 构建：

```powershell
pnpm run build:mobile
pnpm run preview:mobile
```

同步 Capacitor 原生工程：

```powershell
pnpm run android:sync
pnpm run ios:sync
```

移动发布由 `.github/workflows/release.yml` 在标签 `v<版本号>` 上自动完成：

- Android：`assembleRelease` 生成可安装 APK。
- iPhone：macOS runner 使用 Xcode 生成未签名 IPA。
- iPhone 备用入口：构建可安装 PWA。
- 所有文件附带 SHA256 校验值。

Android 正式签名建议在仓库 Actions Secrets 中设置：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

未设置时工作流会使用 Android debug 签名回退，APK 可以安装，但后续使用正式密钥签名时需要卸载旧版。iPhone IPA 不包含开发者签名，需由用户通过爱思助手和自己的 Apple ID 在本机完成自签，免费 Apple ID 通常约 7 天需要重新签名。PWA 不需要签名。

## Windows 正式安装包

正式用户构建必须指向真实 HTTPS API 域名：

```powershell
$env:VOCFLOW_CLOUD_URL = 'https://api.example.com'
pnpm run dist:user:nsis
pnpm run package:update
```

构建脚本会拒绝空值、HTTP、IP 地址和示例占位域名。正式版本会生成安装包、覆盖式更新包、SHA256 与 `release/update.json`。

## 发布顺序

1. 更新 `package.json`、Android/iOS 工程版本和 `src/data/release-notes.json`。
2. 可选：在 GitHub Actions Secrets 中配置 Android 正式签名密钥。
3. 推送 `main`，等待官网和 PWA 工作流部署。
4. 推送 `v<版本号>` 标签，例如 `v2.9.14`。
5. 发布工作流会构建 Windows、Android、iPhone 和 PWA 产物，统一上传到 GitHub Release。
6. 打开 `https://vocflow.cc.cd/` 检查下载按钮，打开 `https://vocflow.cc.cd/app/` 检查 PWA。

## 安全要求

- 云服务管理凭证只保存在服务器环境文件中，不写入客户端或公开仓库。
- Android 签名密钥只通过 GitHub Actions Secrets 注入。
- 数据库备份、管理员密码和服务器私钥不得提交到 GitHub。
- 发布前应检查 SHA256、版本号、安装包图标与包内容，确保没有用户导入文件、日志或本地数据库。