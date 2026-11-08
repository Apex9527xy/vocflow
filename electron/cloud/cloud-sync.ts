import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'

const ENDPOINT_LOCKED = __VOCFLOW_USER_BUILD__
const COMPILED_ENDPOINT = __VOCFLOW_CLOUD_ENDPOINT_JSON__
const DEFAULT_ENDPOINT = ENDPOINT_LOCKED
  ? COMPILED_ENDPOINT
  : (process.env.VOCFLOW_CLOUD_URL || COMPILED_ENDPOINT)

let localCloudProcess: ChildProcess | null = null

app.on('before-quit', () => {
  if (localCloudProcess && !localCloudProcess.killed) localCloudProcess.kill()
  localCloudProcess = null
})

function normalizeEndpoint(value: string): string {
  const endpoint = String(value || '').trim().replace(/\/+$/, '')
  if (!endpoint) throw new Error('\u8bf7\u914d\u7f6e\u4e91\u7aef\u670d\u52a1\u5730\u5740')
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('\u4e91\u7aef\u670d\u52a1\u5730\u5740\u683c\u5f0f\u65e0\u6548')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('\u4e91\u7aef\u670d\u52a1\u5730\u5740\u5fc5\u987b\u4f7f\u7528 http \u6216 https')
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('\u4e91\u7aef\u670d\u52a1\u5730\u5740\u4e0d\u80fd\u5305\u542b\u8d26\u53f7\u5bc6\u7801\u3001\u67e5\u8be2\u53c2\u6570\u6216\u951a\u70b9')
  }
  if (ENDPOINT_LOCKED) {
    if (url.protocol !== 'https:') throw new Error('\u6b63\u5f0f\u7248\u7684\u4e91\u7aef\u670d\u52a1\u5730\u5740\u5fc5\u987b\u4f7f\u7528 HTTPS')
    if (isLoopbackHost(url.hostname)) throw new Error('\u6b63\u5f0f\u7248\u4e0d\u80fd\u8fde\u63a5\u672c\u673a\u4e91\u7aef\u670d\u52a1')
  }
  return endpoint
}

function currentEndpoint(): string {
  return normalizeEndpoint(DEFAULT_ENDPOINT)
}

function isLoopbackHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    return isLoopbackHost(new URL(endpoint).hostname)
  } catch {
    return false
  }
}

function localCloudScriptPath(): string {
  const candidates = [
    join(app.getAppPath(), 'server', 'cloud-server.cjs'),
    join(process.resourcesPath, 'app', 'server', 'cloud-server.cjs'),
    join(process.cwd(), 'server', 'cloud-server.cjs')
  ]
  return candidates.find(candidate => existsSync(candidate)) || ''
}

async function canReachLocalCloud(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint.replace(/\/+$/, '') + '/health', { signal: AbortSignal.timeout(900) })
    return response.ok
  } catch {
    return false
  }
}

async function ensureLocalCloudServer(endpoint: string): Promise<void> {
  if (ENDPOINT_LOCKED) return
  if (!isLocalEndpoint(endpoint) || await canReachLocalCloud(endpoint)) return
  const script = localCloudScriptPath()
  if (!script) throw new Error('\u672c\u5730\u4e91\u670d\u52a1\u7ec4\u4ef6\u7f3a\u5931\uff0c\u8bf7\u91cd\u65b0\u5b89\u88c5\u5b8c\u6574\u7248 VocFlow')
  const url = new URL(endpoint)
  const port = url.port || '8787'
  const dataDir = join(app.getPath('userData'), 'local-cloud')
  mkdirSync(dataDir, { recursive: true })
  const child = spawn(process.execPath, [script], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      VOCFLOW_CLOUD_HOST: '127.0.0.1',
      PORT: port,
      VOCFLOW_CLOUD_DATA_FILE: join(dataDir, 'vocflow-service.json'),
      VOCFLOW_UPDATE_DIR: join(dirname(process.execPath), 'updates')
    }
  })
  localCloudProcess = child
  child.once('exit', () => {
    if (localCloudProcess === child) localCloudProcess = null
  })
  child.once('error', error => console.warn('\u672c\u5730\u4e91\u670d\u52a1\u542f\u52a8\u5931\u8d25:', error))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 250))
    if (await canReachLocalCloud(endpoint)) return
    if (child.exitCode !== null) break
  }
  throw new Error('\u672c\u5730\u4e91\u670d\u52a1\u542f\u52a8\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 8787 \u7aef\u53e3\u662f\u5426\u88ab\u5176\u4ed6\u7a0b\u5e8f\u5360\u7528')
}

async function request<T>(endpoint: string, path: string, timeoutMs = 4000): Promise<T> {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  if (!ENDPOINT_LOCKED) await ensureLocalCloudServer(normalizedEndpoint)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const requestUrl = normalizedEndpoint + path
    const response = await fetch(requestUrl, {
      redirect: ENDPOINT_LOCKED ? 'error' : 'follow',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
    if (ENDPOINT_LOCKED) {
      const expectedOrigin = new URL(requestUrl).origin
      const actualOrigin = new URL(response.url || requestUrl).origin
      if (actualOrigin !== expectedOrigin) throw new Error('\u4e91\u7aef\u8bf7\u6c42\u53d1\u751f\u8de8\u7ad9\u8df3\u8f6c\uff0c\u5df2\u62d2\u7edd\u8fde\u63a5')
    }
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.message || ('\u4e91\u7aef\u8bf7\u6c42\u5931\u8d25 (' + response.status + ')'))
    return payload as T
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('\u8fde\u63a5\u4e91\u7aef\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function prepareCloudUpdateEndpoint(): Promise<string> {
  const endpoint = currentEndpoint()
  if (!ENDPOINT_LOCKED) await ensureLocalCloudServer(endpoint)
  return endpoint
}

export interface AdvertisingConfig {
  enabled: boolean
  imageUrl: string
  targetUrl: string
  updatedAt: string | null
  updatedBy: string
}

const ADVERTISING_CACHE_VERSION = 1

function advertisingCachePath(): string {
  return join(app.getPath('userData'), 'startup-ad-cache.json')
}

function normalizeAdvertisingUrl(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    return url.href
  } catch {
    return ''
  }
}

function normalizeAdvertisingConfig(value: unknown): AdvertisingConfig | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<AdvertisingConfig>
  const enabled = Boolean(input.enabled)
  const imageUrl = normalizeAdvertisingUrl(String(input.imageUrl || ''))
  const targetUrl = normalizeAdvertisingUrl(String(input.targetUrl || ''))
  if (enabled && (!imageUrl || !targetUrl)) return null
  if ((input.imageUrl && !imageUrl) || (input.targetUrl && !targetUrl)) return null
  return {
    enabled,
    imageUrl,
    targetUrl,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
    updatedBy: String(input.updatedBy || '')
  }
}

function writeCachedAdvertisingConfig(config: AdvertisingConfig, endpoint: string): void {
  try {
    mkdirSync(dirname(advertisingCachePath()), { recursive: true })
    writeFileSync(advertisingCachePath(), JSON.stringify({
      version: ADVERTISING_CACHE_VERSION,
      endpoint,
      cachedAt: new Date().toISOString(),
      config
    }, null, 2), 'utf8')
  } catch (error) {
    console.warn('\u4fdd\u5b58\u542f\u52a8\u5e7f\u544a\u7f13\u5b58\u5931\u8d25:', error)
  }
}

export function readCachedAdvertisingConfig(): AdvertisingConfig | null {
  const endpoint = currentEndpoint()
  try {
    if (existsSync(advertisingCachePath())) {
      const cached = JSON.parse(readFileSync(advertisingCachePath(), 'utf8'))
      if (cached?.version === ADVERTISING_CACHE_VERSION && String(cached.endpoint || '') === endpoint) {
        const normalized = normalizeAdvertisingConfig(cached.config)
        if (normalized) return normalized
      }
    }
  } catch {
    // Corrupt or old caches are ignored; the next successful request replaces them.
  }

  if (ENDPOINT_LOCKED || !isLocalEndpoint(endpoint)) return null
  try {
    const dataFile = join(app.getPath('userData'), 'local-cloud', 'vocflow-service.json')
    if (!existsSync(dataFile)) return null
    const parsed = JSON.parse(readFileSync(dataFile, 'utf8'))
    return normalizeAdvertisingConfig(parsed?.adConfig)
  } catch {
    return null
  }
}

export async function fetchAdvertisingConfig(timeoutMs = 4000): Promise<AdvertisingConfig> {
  const endpoint = currentEndpoint()
  const result = await request<{ success: boolean; config: AdvertisingConfig }>(endpoint, '/api/ad-config', timeoutMs)
  const normalized = normalizeAdvertisingConfig(result.config)
  if (!normalized) throw new Error('\u4e91\u7aef\u5e7f\u544a\u914d\u7f6e\u683c\u5f0f\u65e0\u6548')
  writeCachedAdvertisingConfig(normalized, endpoint)
  return normalized
}
