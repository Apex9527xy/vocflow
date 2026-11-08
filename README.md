# VocFlow

VocFlow 是面向 Windows 的英语词汇、真题阅读与句式学习工具。桌面端使用 Electron + Vue，官网与安装包分发采用 GitHub 免费能力，在线更新和启动广告配置由自有 HTTPS 云服务提供，学习数据仅保存在本机。

## 在线架构

- 官网：GitHub Pages 发布 `docs/` 静态站点。
- 后端 API：自有云服务器运行 Node.js 服务。
- HTTPS：Nginx + Let's Encrypt，证书自动续期。
- 安装包：GitHub Releases 托管 EXE、覆盖式更新包与 SHA256。
- 客户端：Electron + Vue，不提供账号、云同步、远程课堂或内置留言入口；学习数据默认保存在本机。

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
pnpm run verify:site
```

本地启动云服务：

```powershell
pnpm run cloud:serve
```

默认监听 `http://127.0.0.1:8787`。

## 生成正式安装包

正式用户构建必须指向真实 HTTPS API 域名：

```powershell
$env:VOCFLOW_CLOUD_URL = 'https://api.example.com'
pnpm run dist:user:nsis
pnpm run package:update
```

构建脚本会拒绝空值、HTTP、IP 地址和示例占位域名。正式版本会生成安装包、覆盖式更新包、SHA256 与 `release/update.json`。

## 部署顺序

1. 按 [`server/deploy/README.md`](server/deploy/README.md) 配置 DNS、云服务、Nginx 和 HTTPS。
2. 在 GitHub 仓库的 Actions Variables 中设置 `VOCFLOW_CLOUD_URL`。
3. 修改 `docs/CNAME.example` 后另存为 `docs/CNAME`，或直接在 GitHub Pages 中绑定域名。
4. 更新 `package.json` 与 `src/data/release-notes.json` 中的版本信息。
5. 推送 `v<版本号>` 标签，例如 `v2.9.12`。
6. 发布工作流会构建并上传安装包、更新包和校验文件到 GitHub Release。
7. 官网工作流会自动发布 `docs/` 到 GitHub Pages。

GitHub Release 中的 Windows 安装包名称格式为 `VocFlow-<版本号>-Setup.exe`。

## 安全要求

- 云服务管理凭证只保存在服务器环境文件中，不写入客户端或公开仓库。
- 数据库备份、管理员密码和服务器私钥不得提交到 GitHub。
- `VOCFLOW_CLOUD_URL` 必须是真实可用的 HTTPS 域名。
- 发布前应检查 SHA256、版本号以及服务器 `/health` 返回状态。