import { app, dialog, type IpcMain } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'

type SentenceAiProvider =
  | 'qwen' | 'deepseek' | 'glm'
  | 'deepseek-r1:8b' | 'qwen2.5:7b' | 'qwen2.5:14b'

interface SentenceAiRequest {
  provider: SentenceAiProvider
  apiKey: string
  sentence: string
  systemPrompt: string
  schema: unknown
  modelPath?: string
}

interface ProviderConfig {
  endpoint: string
  model: string
  local: boolean
}

const PROVIDERS: Record<SentenceAiProvider, ProviderConfig> = {
  qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo', local: false },
  deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', local: false },
  glm: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', local: false },
  'deepseek-r1:8b': { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'deepseek-r1:8b', local: true },
  'qwen2.5:7b': { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'qwen2.5:7b', local: true },
  'qwen2.5:14b': { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'qwen2.5:14b', local: true }
}

const LOCAL_MODEL_NAMES = new Set(['deepseek-r1:8b', 'qwen2.5:7b', 'qwen2.5:14b'])
const OLLAMA_INSTALLER_URL = 'https://ollama.com/download/OllamaSetup.exe'
const CUSTOM_OLLAMA_PORT = 11435
const customServers = new Map<string, ReturnType<typeof spawn>>()

type InstallProgress = { phase: 'download' | 'verify' | 'install' | 'complete' | 'error'; percent: number; message: string }

function resolveOllamaExecutable(): string {
  const candidates = [
    process.env.OLLAMA_EXE,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe') : '',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Ollama', 'ollama.exe') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Ollama', 'ollama.exe') : ''
  ].filter(Boolean) as string[]
  return candidates.find(candidate => existsSync(candidate)) || 'ollama'
}

async function downloadOllamaInstaller(sendProgress: (progress: InstallProgress) => void): Promise<string> {
  const installerPath = path.join(app.getPath('temp'), 'VocFlow-OllamaSetup.exe')
  const response = await fetch(OLLAMA_INSTALLER_URL, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Ollama 安装包下载失败 (HTTP ${response.status})`)
  const total = Number(response.headers.get('content-length') || 0)
  const reader = response.body.getReader()
  const stream = createWriteStream(installerPath)
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      received += chunk.length
      if (!stream.write(chunk)) await new Promise<void>(resolve => stream.once('drain', resolve))
      const percent = total ? Math.min(95, Math.round(received / total * 95)) : 20
      sendProgress({ phase: 'download', percent, message: `正在下载 Ollama 安装程序 ${percent}%` })
    }
  } finally {
    await new Promise<void>((resolve, reject) => stream.end((error?: Error | null) => error ? reject(error) : resolve()))
  }
  return installerPath
}

function verifyOllamaInstaller(installerPath: string): Promise<{ valid: boolean; subject: string; message: string }> {
  return new Promise(resolve => {
    const script = "$sig=Get-AuthenticodeSignature -LiteralPath $env:VOCFLOW_OLLAMA_INSTALLER; Write-Output ($sig.Status.ToString() + '|' + $sig.SignerCertificate.Subject)"
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: { ...process.env, VOCFLOW_OLLAMA_INSTALLER: installerPath },
      timeout: 30_000
    }, (error, stdout) => {
      if (error) return resolve({ valid: false, subject: '', message: error.message })
      const [status, subject = ''] = String(stdout || '').trim().split('|')
      resolve({ valid: status === 'Valid', subject, message: `数字签名状态：${status || 'Unknown'}` })
    })
  })
}

function runProcess(executable: string, args: string[], timeoutMs: number): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise(resolve => {
    let output = ''
    let settled = false
    const child = spawn(executable, args, { windowsHide: true })
    const finish = (result: { success: boolean; output: string; error?: string }) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => { child.kill(); finish({ success: false, output, error: '安装进程超时' }) }, timeoutMs)
    child.stdout?.on('data', chunk => { output = (output + String(chunk)).slice(-4000) })
    child.stderr?.on('data', chunk => { output = (output + String(chunk)).slice(-4000) })
    child.on('error', error => finish({ success: false, output, error: error.message }))
    child.on('close', code => finish({ success: code === 0, output, error: code === 0 ? undefined : `安装程序退出码 ${code}` }))
  })
}

async function waitForOllama(timeoutMs = 60_000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await runOllama(['list'], 10_000)
    if (!result.needsInstall && result.success) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  return false
}

function responseContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item: any) => typeof item === 'string' ? item : String(item?.text || '')).join('')
  return ''
}

function ollamaEnv(modelPath?: string): NodeJS.ProcessEnv {
  if (!modelPath) return { ...process.env }
  return {
    ...process.env,
    OLLAMA_MODELS: modelPath,
    OLLAMA_HOST: `127.0.0.1:${CUSTOM_OLLAMA_PORT}`
  }
}

async function ollamaApiReady(modelPath?: string): Promise<boolean> {
  const port = modelPath ? CUSTOM_OLLAMA_PORT : 11434
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/tags`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function ensureOllamaServer(modelPath?: string): Promise<boolean> {
  if (!modelPath) return ollamaApiReady()
  if (await ollamaApiReady(modelPath)) return true
  const normalized = path.resolve(modelPath)
  if (!customServers.has(normalized)) {
    try {
      const child = spawn(resolveOllamaExecutable(), ['serve'], {
        env: ollamaEnv(normalized),
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      })
      child.on('error', () => {})
      child.unref()
      customServers.set(normalized, child)
    } catch {
      return false
    }
  }
  const started = Date.now()
  while (Date.now() - started < 10_000) {
    if (await ollamaApiReady(normalized)) return true
    await new Promise(resolve => setTimeout(resolve, 700))
  }
  return false
}

function runOllama(args: string[], timeoutMs?: number, modelPath?: string): Promise<{ success: boolean; output: string; error?: string; needsInstall?: boolean }> {
  return new Promise(resolve => {
    let output = ''
    let settled = false
    const child = spawn(resolveOllamaExecutable(), args, { windowsHide: true, env: ollamaEnv(modelPath) })
    const finish = (result: { success: boolean; output: string; error?: string; needsInstall?: boolean }) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    const timer = timeoutMs ? setTimeout(() => {
      child.kill()
      finish({ success: false, output, error: '本地模型操作超时' })
    }, timeoutMs) : null
    child.stdout.on('data', chunk => { output = (output + String(chunk)).slice(-8000) })
    child.stderr.on('data', chunk => { output = (output + String(chunk)).slice(-8000) })
    child.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code
      finish({ success: false, output, error: code === 'ENOENT' ? '未检测到 Ollama' : error.message, needsInstall: code === 'ENOENT' })
    })
    child.on('close', code => finish({ success: code === 0, output, error: code === 0 ? undefined : `Ollama 进程退出码 ${code}` }))
  })
}

export function registerSentenceAiHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sentence-ai:pick-directory', async (_event, options: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || '选择文件夹',
      defaultPath: options?.defaultPath || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory']
    })
    return { success: !result.canceled && Boolean(result.filePaths[0]), path: result.filePaths[0] || '', canceled: result.canceled }
  })

  ipcMain.handle('sentence-ai:local-models', async (_event, payload?: { modelPath?: string }) => {
    const modelPath = String(payload?.modelPath || '').trim() || undefined
    if (modelPath && !(await ensureOllamaServer(modelPath))) {
      return { success: false, ollamaAvailable: false, installed: [], message: '自定义模型目录的 Ollama 服务启动失败，请确认 Ollama 已安装' }
    }
    const result = await runOllama(['list'], 10_000, modelPath)
    if (result.needsInstall) return { success: true, ollamaAvailable: false, installed: [], message: '未检测到 Ollama，请先安装' }
    if (!result.success) return { success: false, ollamaAvailable: false, installed: [], message: result.error || '无法读取本地模型列表' }
    const installed = result.output.split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)[0]).filter(Boolean)
    return { success: true, ollamaAvailable: true, installed }
  })

  ipcMain.handle('sentence-ai:install-ollama', async (event, payload?: { installPath?: string }) => {
    const sendProgress = (progress: InstallProgress) => {
      if (!event.sender.isDestroyed()) event.sender.send('sentence-ai:ollama-install-progress', progress)
    }
    let installerPath = ''
    try {
      sendProgress({ phase: 'download', percent: 0, message: '正在连接 Ollama 官方下载服务器…' })
      installerPath = await downloadOllamaInstaller(sendProgress)
      sendProgress({ phase: 'verify', percent: 96, message: '正在校验 Ollama 安装包数字签名…' })
      const signature = await verifyOllamaInstaller(installerPath)
      if (!signature.valid) {
        return { success: false, message: `Ollama 安装包签名校验失败：${signature.message}`, installerPath }
      }
      const installPath = String(payload?.installPath || '').trim() || path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Programs', 'Ollama')
      sendProgress({ phase: 'install', percent: 97, message: `正在静默安装 Ollama 到 ${installPath}…` })
      const installed = await runProcess(installerPath, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', `/DIR=${installPath}`], 10 * 60_000)
      sendProgress({ phase: 'install', percent: 99, message: '正在等待 Ollama 服务就绪…' })
      const ready = await waitForOllama()
      if (!ready) {
        return { success: false, message: installed.error || 'Ollama 安装完成但服务未就绪，请重启软件后重试', installerPath }
      }
      sendProgress({ phase: 'complete', percent: 100, message: 'Ollama 自动安装完成' })
      void rm(installerPath, { force: true }).catch(() => {})
      return { success: true, message: 'Ollama 自动安装完成', ollamaAvailable: true }
    } catch (error) {
      const message = (error as Error).message || 'Ollama 自动安装失败'
      sendProgress({ phase: 'error', percent: 0, message })
      return { success: false, message, installerPath }
    }
  })

  ipcMain.handle('sentence-ai:download-local-model', async (_event, payload: { model: string; modelPath?: string }) => {
    const normalized = String(payload?.model || '').trim()
    const modelPath = String(payload?.modelPath || '').trim() || undefined
    if (!LOCAL_MODEL_NAMES.has(normalized)) return { success: false, message: '不支持的本地模型' }
    if (modelPath && !(await ensureOllamaServer(modelPath))) return { success: false, message: '自定义模型目录的 Ollama 服务启动失败' }
    const result = await runOllama(['pull', normalized], undefined, modelPath)
    if (result.needsInstall) return { success: false, needsInstall: true, message: '未检测到 Ollama，无法自动部署，请先安装 Ollama' }
    return { success: result.success, message: result.success ? `本地模型 ${normalized} 已下载完成` : (result.error || '本地模型下载失败'), output: result.output }
  })

  ipcMain.handle('sentence-ai:request', async (_event, request: SentenceAiRequest) => {
    const provider = request?.provider
    const config = PROVIDERS[provider]
    if (!config) return { success: false, message: '不支持的模型服务' }
    const apiKey = String(request?.apiKey || '').trim()
    const sentence = String(request?.sentence || '').trim()
    if (!config.local && !apiKey) return { success: false, message: 'API密钥未填写' }
    if (!sentence) return { success: false, message: '句子内容为空' }
    const modelPath = String(request?.modelPath || '').trim() || undefined
    if (config.local && modelPath && !(await ensureOllamaServer(modelPath))) {
      return { success: false, message: '自定义模型目录的 Ollama 服务启动失败' }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.local ? 180_000 : 45_000)
    try {
      const messages = [
        { role: 'system', content: String(request.systemPrompt || '') },
        { role: 'user', content: `请严格按照下面的 JSON Schema 分析输入内容，并且只返回 JSON。\n\nJSON Schema:\n${JSON.stringify(request.schema)}\n\n待分析内容:\n${sentence}` }
      ]
      const body: Record<string, unknown> = config.local
        ? { model: config.model, stream: false, format: 'json', options: { temperature: 0.1, num_ctx: 8192 }, messages }
        : { model: config.model, temperature: 0.1, max_tokens: 3600, messages }
      if (provider === 'qwen' || provider === 'deepseek') body.response_format = { type: 'json_object' }
      const endpoint = config.local && modelPath ? `http://127.0.0.1:${CUSTOM_OLLAMA_PORT}/api/chat` : config.endpoint
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.local ? {} : { Authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      const raw = await response.text()
      if (!response.ok) {
        let detail = raw.slice(0, 500)
        try { const parsed = JSON.parse(raw); detail = parsed?.error?.message || parsed?.message || detail } catch {}
        return { success: false, message: config.local ? `本地模型请求失败，请确认 Ollama 已启动且模型已下载：${detail}` : `接口请求失败 (HTTP ${response.status})：${detail}` }
      }
      let payload: any = null
      try { payload = JSON.parse(raw) } catch { return { success: false, message: '接口返回内容不是有效 JSON' } }
      const content = responseContent(payload)
      if (!content) return { success: false, message: '接口返回内容为空' }
      return { success: true, content }
    } catch (error) {
      const message = (error as Error).name === 'AbortError' ? '接口请求超时' : (error as Error).message || '接口请求失败'
      return { success: false, message: config.local ? `本地模型请求失败：${message}` : message }
    } finally {
      clearTimeout(timeout)
    }
  })
}
