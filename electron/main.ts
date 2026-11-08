import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join, dirname, resolve } from 'path'
import { existsSync, mkdirSync, copyFileSync, readFileSync, appendFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { initDatabase, saveDatabase } from './database/connection'

const __dirname = dirname(fileURLToPath(import.meta.url))

app.setName('VocFlow')
app.setAppUserModelId('com.vocflow.app')
Menu.setApplicationMenu(null)
const appDataRoot = app.getPath('appData')
const isolatedUserData = process.env.VOCFLOW_USER_DATA?.trim()
const vocflowUserData = isolatedUserData ? resolve(isolatedUserData) : join(appDataRoot, 'VocFlow')
const legacyUserData = join(appDataRoot, '四级备考教练')
const legacyDb = join(legacyUserData, 'cet4-coach.db')
const vocflowDb = join(vocflowUserData, 'cet4-coach.db')
if (!existsSync(vocflowUserData)) mkdirSync(vocflowUserData, { recursive: true })
try {
  if (!existsSync(vocflowDb) && existsSync(legacyDb)) {
    copyFileSync(legacyDb, vocflowDb)
  }
  const legacyPreferences = join(legacyUserData, 'Preferences')
  const vocflowPreferences = join(vocflowUserData, 'Preferences')
  if (!existsSync(vocflowPreferences) && existsSync(legacyPreferences)) {
    copyFileSync(legacyPreferences, vocflowPreferences)
  }
} catch (error) {
  console.warn('旧用户数据迁移失败，将使用新用户目录:', error)
}
app.setPath('userData', vocflowUserData)
// 同一个用户目录只保留一个数据库写入进程；第二次启动时由该进程新开窗口，
// 从而同时满足多窗口使用和 sql.js 单内存快照的一致性要求。
const hasSingleInstanceLock = app.requestSingleInstanceLock()

const preloadPath = join(__dirname, 'preload.cjs')

import { wrapDatabase } from './database/wrapper'
import { registerWordHandlers } from './ipc/word.handler'
import { registerStudyHandlers } from './ipc/study.handler'
import { registerPlanHandlers } from './ipc/plan.handler'
import { registerStatsHandlers } from './ipc/stats.handler'
import { registerExamHandlers } from './ipc/exam.handler'
import { registerExamResourceHandlers } from './ipc/exam-resource.handler'
import { registerExamCollectionHandlers } from './ipc/exam-collection.handler'
import { registerContentHandlers } from './ipc/content.handler'
import { registerWritingHandlers } from './ipc/writing.handler'
import { registerReminderHandlers } from './ipc/reminder.handler'
import { registerDictionaryHandlers } from './ipc/dictionary.handler'
import { registerTranslationHandlers } from './ipc/translation.handler'
import { registerSentenceAiHandlers } from './ipc/sentence-ai.handler'
import { registerTtsHandlers } from './ipc/tts.handler'
import { registerUpdateHandlers } from './ipc/update.handler'
import { registerLiteratureHandlers } from './ipc/literature.handler'
import { recordStartupActivity, registerActivityHandlers } from './ipc/activity.handler'
import { fetchAdvertisingConfig, readCachedAdvertisingConfig } from './cloud/cloud-sync'
import { StartupAdManager, type StartupAdvertisingConfig } from './startup/ad-manager'

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let splashShownAt = 0
let startupAdManager: StartupAdManager | null = null
let handlersReady = false
const SPLASH_MIN_VISIBLE_MS = 650

function logStartupAd(message: string): void {
  try {
    appendFileSync(join(app.getPath('userData'), 'startup-ad.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Diagnostic logging must never block startup.
  }
}

function splashHtml(): string {
  const iconDataUrl = `data:image/png;base64,${readFileSync(join(__dirname, '../resources/icon.png')).toString('base64')}`
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src file: data:;" />
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; background: transparent; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
  .splash {
    width: 100%; height: 100%; padding: 17px 22px 16px; border-radius: 15px;
    border: 1px solid rgba(255,255,255,.7); color: #2c2420;
    background: linear-gradient(145deg, rgba(255,253,249,.98), rgba(248,243,235,.98));
    box-shadow: 0 18px 55px rgba(44,32,22,.25), inset 0 1px 0 rgba(255,255,255,.75);
    display: flex; flex-direction: column; justify-content: center;
  }
  .head { display: flex; align-items: center; gap: 12px; }
  .mark {
    width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
    display: block; object-fit: contain; background: transparent;
    box-shadow: 0 7px 16px rgba(180,83,9,.22);
  }
  .copy { min-width: 0; }
  .brand { color: #b45309; font-size: 10px; font-weight: 800; letter-spacing: 1.8px; }
  .status { margin-top: 4px; font-size: 15px; font-weight: 650; letter-spacing: .2px; }
  .track { height: 5px; margin-top: 15px; overflow: hidden; border-radius: 999px; background: rgba(95,75,60,.1); }
  .fill {
    width: 42%; height: 100%; border-radius: inherit;
    background: linear-gradient(90deg, #f59e0b, #d97706, #fbbf24);
    box-shadow: 0 0 12px rgba(217,119,6,.35);
    animation: loading 1.35s ease-in-out infinite;
  }
  @keyframes loading {
    0% { transform: translateX(-115%); }
    55% { width: 68%; }
    100% { transform: translateX(245%); }
  }
</style>
</head>
<body>
  <div class="splash">
    <div class="head">
      <img class="mark" src="${iconDataUrl}" alt="" />
      <div class="copy"><div class="brand">VOCFLOW</div><div class="status">模块加载中</div></div>
    </div>
    <div class="track"><div class="fill"></div></div>
  </div>
</body>
</html>`
}

async function createSplashWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 372,
    height: 118,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    title: 'VocFlow 启动中',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false
    }
  })
  splashWindow = window
  window.setMenu(null)
  window.setMenuBarVisibility(false)
  window.center()
  window.setAlwaysOnTop(true, 'floating')
  window.on('closed', () => {
    if (splashWindow === window) splashWindow = null
  })

  await new Promise<void>(resolve => {
    let shown = false
    let settled = false
    const showSplash = () => {
      if (shown || window.isDestroyed()) return
      shown = true
      splashShownAt = Date.now()
      window.show()
      window.focus()
    }
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    window.once('ready-to-show', () => {
      showSplash()
      finish()
    })
    window.webContents.once('did-fail-load', finish)
    setTimeout(() => {
      showSplash()
      finish()
    }, 420)
    void window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml())}`).catch(finish)
  })
}

function revealMainWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return
  if (startupAdManager?.blocking) {
    startupAdManager.markMainReady()
    return
  }
  const wait = Math.max(0, SPLASH_MIN_VISIBLE_MS - (Date.now() - splashShownAt))
  setTimeout(() => {
    if (window.isDestroyed()) return
    if (!window.isVisible()) window.show()
    window.focus()
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  }, wait)
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'VocFlow',
    backgroundColor: '#faf8f5',
    icon: join(__dirname, '../resources/icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#faf8f5',
      symbolColor: '#5f554e',
      height: 34
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = window
  window.setMenu(null)
  window.setMenuBarVisibility(false)

  let revealed = false
  const reveal = () => {
    if (revealed) return
    revealed = true
    revealMainWindow(window)
  }
  window.once('ready-to-show', reveal)
  window.webContents.once('did-finish-load', () => {
    setTimeout(reveal, 8500)
  })
  window.webContents.once('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) reveal()
  })
  window.on('closed', () => {
    mainWindow = null
    if (BrowserWindow.getAllWindows().length === 0) app.quit()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
    window.webContents.openDevTools()
  } else {
    void window.loadFile(join(__dirname, '../dist/index.html')).catch(error => {
      console.error('VocFlow 主窗口加载失败:', error)
      reveal()
    })
  }
  return window
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!handlersReady) {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.show()
        splashWindow.focus()
      }
      return
    }
    createWindow()
  })

  app.whenReady().then(async () => {
  await createSplashWindow()

  // 广告配置与数据库初始化并行；广告窗口只负责启动阶段展示，不参与主应用逻辑。
  const databasePromise = initDatabase()
  const adConfigPromise = Promise.race<StartupAdvertisingConfig | null>([
    fetchAdvertisingConfig(1800),
    new Promise<StartupAdvertisingConfig | null>(resolve => setTimeout(() => resolve(null), 2400))
  ]).catch(error => {
    console.warn('读取启动广告配置失败，将使用普通加载页面:', error.message)
    return null
  })
  const [rawDb, fetchedAdConfig] = await Promise.all([databasePromise, adConfigPromise])
  logStartupAd(`远端广告配置: ${JSON.stringify(fetchedAdConfig)}`)
  // 云端暂时不可用时使用最近一次成功获取的配置；开发环境再回退到本地云数据。
  const adConfig = fetchedAdConfig || readCachedAdvertisingConfig()
  logStartupAd(`最终广告配置: ${JSON.stringify(adConfig)}`)
  if (adConfig?.enabled) {
    startupAdManager = new StartupAdManager(join(__dirname, 'ad-preload.cjs'), {
      onDismissed: () => {
        if (mainWindow) revealMainWindow(mainWindow)
      },
      onWaitForMain: () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
          if (!splashWindow.isVisible()) splashWindow.show()
          splashWindow.focus()
        }
      }
    })
    logStartupAd('开始创建启动广告窗口')
    await startupAdManager.show(adConfig).then(() => logStartupAd('启动广告窗口已显示')).catch(error => {
      logStartupAd('启动广告展示失败: ' + (error as Error).message)
      console.warn('启动广告展示失败:', error)
    })
  }
  const db = wrapDatabase(rawDb)
  recordStartupActivity(db)

  registerWordHandlers(ipcMain, db)
  registerStudyHandlers(ipcMain, db)
  registerPlanHandlers(ipcMain, db)
  registerStatsHandlers(ipcMain, db)
  registerExamHandlers(ipcMain, db)
  registerExamResourceHandlers(ipcMain, db)
  registerExamCollectionHandlers(ipcMain, db)
  registerContentHandlers(ipcMain, db)
  registerWritingHandlers(ipcMain, db)
  registerReminderHandlers(ipcMain, db)
  registerDictionaryHandlers(ipcMain)
  registerTranslationHandlers(ipcMain)
  registerSentenceAiHandlers(ipcMain)
  registerTtsHandlers(ipcMain)
  registerUpdateHandlers(ipcMain)
  registerLiteratureHandlers(ipcMain, db)
  registerActivityHandlers(ipcMain, db)
  handlersReady = true

  createWindow()
}).catch(error => {
    console.error('VocFlow 启动失败:', error)
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    app.quit()
  })
}

setInterval(() => {
  saveDatabase()
}, 5 * 60 * 1000)

app.on('window-all-closed', () => {
  saveDatabase()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  saveDatabase()
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
