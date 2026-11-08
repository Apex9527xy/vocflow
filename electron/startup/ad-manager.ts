import { BrowserWindow, ipcMain, shell } from 'electron'

export interface StartupAdvertisingConfig {
  enabled: boolean
  imageUrl: string
  targetUrl: string
  updatedAt: string | null
  updatedBy: string
}

interface AdManagerCallbacks {
  onDismissed: () => void
  onWaitForMain: () => void
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function adHtml(config: StartupAdvertisingConfig): string {
  const imageUrl = escapeAttribute(config.imageUrl)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: http: data:; script-src 'unsafe-inline';" />
<style>
  * { box-sizing: border-box; }
  html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#f4efe7; }
  body { font-family:"Segoe UI","Microsoft YaHei",sans-serif; }
  .ad-shell { position:relative; width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#f8f3eb,#eee5d7); }
  .ad-image { width:100%; height:100%; object-fit:contain; object-position:center; display:block; }
  .ad-fallback { display:none; padding:32px; color:#6b4d2d; text-align:center; font-size:18px; }
  .skip-zone { position:absolute; top:18px; right:20px; min-width:108px; height:38px; display:flex; align-items:center; justify-content:center; padding:0 14px; border-radius:999px; color:#fff; background:rgba(28,24,20,.62); border:1px solid rgba(255,255,255,.24); box-shadow:0 8px 24px rgba(0,0,0,.18); backdrop-filter:blur(8px); font-size:12px; font-weight:600; letter-spacing:.3px; user-select:none; }
  .skip-button { cursor:pointer; color:#fff; background:rgba(217,119,6,.92); border-color:rgba(255,255,255,.4); transition:transform .15s ease,background .15s ease; }
  .skip-button:hover { transform:translateY(-1px); background:#b45309; }
  .skip-button:active { transform:translateY(0); }
  .loading-dot { width:6px; height:6px; margin-left:6px; border-radius:50%; background:#fbbf24; animation:pulse .8s ease-in-out infinite alternate; }
  @keyframes pulse { to { opacity:.35; transform:scale(.72); } }
</style>
</head>
<body>
  <main class="ad-shell">
    <img class="ad-image" id="adImage" src="${imageUrl}" alt="VocFlow 启动广告" />
    <div class="ad-fallback" id="fallback">广告图片加载失败</div>
    <div class="skip-zone" id="skipZone">5s后可跳过<span class="loading-dot"></span></div>
  </main>
  <script>
    const image = document.getElementById('adImage')
    const fallback = document.getElementById('fallback')
    const skipZone = document.getElementById('skipZone')
    image.addEventListener('error', () => {
      image.style.display = 'none'
      fallback.style.display = 'block'
    })
    let remaining = 5
    const timer = setInterval(() => {
      remaining -= 1
      if (remaining > 0) {
        skipZone.textContent = remaining + 's后可跳过'
        const dot = document.createElement('span')
        dot.className = 'loading-dot'
        skipZone.appendChild(dot)
        return
      }
      clearInterval(timer)
      skipZone.textContent = '跳过'
      skipZone.classList.add('skip-button')
      skipZone.addEventListener('click', () => window.vocflowAd.skip(), { once: true })
    }, 1000)
  </script>
</body>
</html>`
}

export class StartupAdManager {
  private window: BrowserWindow | null = null
  private targetUrl = ''
  private mainReady = false
  private dismissed = false

  constructor(private preloadPath: string, private callbacks: AdManagerCallbacks) {
    ipcMain.removeAllListeners('startup-ad:skip')
    ipcMain.on('startup-ad:skip', () => { void this.handleSkip() })
  }

  get blocking(): boolean {
    return Boolean(this.window && !this.dismissed)
  }

  async show(config: StartupAdvertisingConfig): Promise<void> {
    if (!config.enabled || !config.imageUrl || !config.targetUrl) return
    this.targetUrl = config.targetUrl
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      backgroundColor: '#f4efe7',
      title: 'VocFlow',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.window = window
    window.setMenu(null)
    window.center()
    window.on('closed', () => {
      if (this.window === window) this.window = null
    })
    await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(adHtml(config))}`)
    if (!window.isDestroyed()) window.show()
  }

  markMainReady(): void {
    this.mainReady = true
  }

  private closeWindow(): void {
    this.dismissed = true
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }

  private async handleSkip(): Promise<void> {
    if (this.dismissed || !this.window) return
    if (this.mainReady) {
      this.closeWindow()
      this.callbacks.onDismissed()
      return
    }
    this.callbacks.onWaitForMain()
    const target = this.targetUrl
    this.closeWindow()
    if (target) await shell.openExternal(target).catch(error => console.warn('打开广告链接失败:', error))
  }
}