# VocFlow 云服务部署

适用于 Ubuntu 22.04 / 24.04，使用 Node.js 22、Nginx、systemd 与 Certbot。默认数据目录为 `/var/lib/vocflow-cloud`。

## 1. 配置 DNS

假设主域名是 `example.com`：

| 主机记录 | 类型 | 值 |
| --- | --- | --- |
| `@` | A | `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153` |
| `www` | CNAME | `<GitHub 用户名>.github.io` |
| `api` | A | 云服务器公网 IPv4 |

如果官网使用 `www.example.com`，可以只保留 `www` 的 CNAME，并把根域重定向到 `www`。API 使用 `api.example.com`，并确保该记录已经解析到服务器。配置完成后在 GitHub 仓库 Settings → Pages 中填写官网自定义域名并启用 HTTPS。

## 2. 安装 Node.js 与服务文件

```bash
sudo apt update
sudo apt install -y curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --home /opt/vocflow --shell /usr/sbin/nologin vocflow || true
sudo mkdir -p /opt/vocflow/server /etc/vocflow /var/lib/vocflow-cloud
sudo cp cloud-server.cjs /opt/vocflow/server/
sudo chown -R vocflow:vocflow /opt/vocflow /var/lib/vocflow-cloud
```

将 `vocflow-cloud.env.example` 复制为 `/etc/vocflow/vocflow-cloud.env`，替换域名、管理员邮箱和随机管理员密码。密码至少 16 位，且不要提交到仓库。

```bash
sudo chmod 600 /etc/vocflow/vocflow-cloud.env
sudo cp vocflow-cloud.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vocflow-cloud
curl http://127.0.0.1:8787/health
```

## 3. 配置 Nginx 与 HTTPS

先修改 `nginx-vocflow-api.conf` 中的 `api.example.com`，再启用站点：

```bash
sudo cp nginx-vocflow-api.conf /etc/nginx/sites-available/vocflow-api
sudo ln -sf /etc/nginx/sites-available/vocflow-api /etc/nginx/sites-enabled/vocflow-api
sudo nginx -t
sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com --redirect
sudo certbot renew --dry-run
```

将上面的示例域名全部替换为真实域名。Certbot 会自动安装续期任务，并改写 Nginx 配置以启用 TLS。

如果使用 `acme.sh`，也可以签发证书，但需要手动配置 Nginx 的 `fullchain` 与 `private key` 路径，并确保证书续期后自动重载 Nginx。

## 4. 配置 GitHub Actions

进入 GitHub 仓库的 Settings → Secrets and variables → Actions → Variables，新建：

- `VOCFLOW_CLOUD_URL=https://api.example.com`

这个值会编译进正式客户端。不要把它设为 Secret，因为工作流读取的是 Actions Variable。

服务器管理员密码只放在 VPS 的 `/etc/vocflow/vocflow-cloud.env`，不要写入客户端、GitHub Variables 或仓库。

## 5. 数据与备份

持久化文件包括：

- `/var/lib/vocflow-cloud/vocflow-cloud.json`
- `/var/lib/vocflow-cloud/backups/`
- `/etc/vocflow/vocflow-cloud.env`（包含敏感配置）

建议额外使用云厂商快照或 `rsync` 把数据目录备份到另一台机器。恢复时先停止服务，替换数据文件并恢复文件权限，再启动服务。

## 6. 更新服务与发布客户端

服务端更新：

```bash
cd /opt/vocflow/server
# 上传新的 cloud-server.cjs
sudo systemctl restart vocflow-cloud
curl https://api.example.com/health
```

客户端发布：

1. 创建并推送 `v<版本号>` 标签。
2. GitHub Actions 构建 `VocFlow-<版本号>-Setup.exe`、更新 ZIP、SHA256 和 `update.json`。
3. 将 `update.json` 与更新 ZIP 放入云端更新目录，或在发布流程中同步到 VPS。
4. 用全新 Windows 用户环境执行一次安装和自动更新回归测试。

## 7. 上线检查

- `https://api.example.com/health` 返回正常。
- 主域名通过 HTTPS 打开 GitHub Pages 官网。
- 官网下载按钮指向最新 GitHub Release。
- 安装包中的云服务地址为 `https://api.example.com`。
- 启动广告与在线更新均可用。
- 证书自动续期演练通过：`sudo certbot renew --dry-run`。
