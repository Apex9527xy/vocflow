import { app } from 'electron'
import type { IpcMain } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type TtsAccent = 'us' | 'uk'

interface TtsAudioResult {
  success: boolean
  audioBase64?: string
  mimeType?: string
  provider?: string
  message?: string
}

interface CachedAudio {
  audioBase64: string
  mimeType: string
  provider: string
}

const cache = new Map<string, CachedAudio>()
const DISK_CACHE_LIMIT = 160

function diskCachePath(text: string, accent: TtsAccent): string {
  const hash = createHash('sha256').update(accent + ':' + text).digest('hex')
  return join(app.getPath('userData'), 'TtsAudioCache', hash + '.mp3')
}

function readDiskCache(text: string, accent: TtsAccent): CachedAudio | null {
  try {
    const filePath = diskCachePath(text, accent)
    if (!existsSync(filePath)) return null
    return {
      audioBase64: readFileSync(filePath).toString('base64'),
      mimeType: 'audio/mpeg',
      provider: '本地在线音频缓存'
    }
  } catch {
    return null
  }
}

function writeDiskCache(text: string, accent: TtsAccent, audioBase64: string): void {
  try {
    const dir = join(app.getPath('userData'), 'TtsAudioCache')
    mkdirSync(dir, { recursive: true })
    writeFileSync(diskCachePath(text, accent), Buffer.from(audioBase64, 'base64'))
    const files = readdirSync(dir).filter(name => name.endsWith('.mp3')).map(name => ({ name, time: statSync(join(dir, name)).mtimeMs })).sort((a, b) => b.time - a.time)
    for (const file of files.slice(DISK_CACHE_LIMIT)) unlinkSync(join(dir, file.name))
  } catch {
    // Disk caching is an optimization and must not block playback.
  }
}

const MAX_CACHE_SIZE = 80
const REQUEST_TIMEOUT_MS = 5500

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200)
}

function providerUrls(text: string, accent: TtsAccent): Array<{ name: string; url: string; referer: string }> {
  const type = accent === 'us' ? 2 : 1
  const language = accent === 'us' ? 'en-US' : 'en-GB'
  return [
    {
      name: '有道在线 TTS',
      url: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}&le=eng`,
      referer: 'https://fanyi.youdao.com/'
    },
    {
      name: 'Google 在线 TTS',
      url: `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=${language}&q=${encodeURIComponent(text)}`,
      referer: 'https://translate.google.com/'
    },
    {
      name: 'Google Translate TTS',
      url: `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${language}&q=${encodeURIComponent(text)}`,
      referer: 'https://translate.google.com/'
    }
  ]
}

async function fetchProvider(url: string, referer: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Referer: referer
      },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length < 512 || buffer.length > 8 * 1024 * 1024) throw new Error('音频数据无效')
    const prefix = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8', 0, Math.min(buffer.length, 2048)).toLowerCase()
    if (prefix.includes('<html') || prefix.includes('<!doctype') || prefix.includes('"error"')) throw new Error('接口返回了非音频内容')
    if (mimeType && !mimeType.startsWith('audio/') && mimeType !== 'application/octet-stream' && mimeType !== 'binary/octet-stream') {
      throw new Error(`返回类型无效：${mimeType}`)
    }
    return { buffer, mimeType: mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg' }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchTtsAudio(text: string, accent: TtsAccent): Promise<TtsAudioResult> {
  const value = cleanText(text)
  if (!value) return { success: false, message: '没有可朗读的文本' }
  const key = `${accent}:${value}`
  const memoryCached = cache.get(key)
  if (memoryCached) return { success: true, ...memoryCached }
  const diskCached = readDiskCache(value, accent)
  if (diskCached) {
    cache.set(key, diskCached)
    return { success: true, ...diskCached }
  }

  const providers = providerUrls(value, accent)
  const preferred = providers.filter(provider => provider.name.includes('Google'))
  const fallback = providers.filter(provider => !provider.name.includes('Google'))
  const fetchGroup = async (group: typeof providers) => {
    const attempts = group.map(async provider => {
      try {
        const audio = await fetchProvider(provider.url, provider.referer)
        return { audioBase64: audio.buffer.toString('base64'), mimeType: audio.mimeType, provider: provider.name }
      } catch (error) {
        console.warn(`${provider.name} 获取失败:`, (error as Error).message)
        throw error
      }
    })
    return Promise.any(attempts)
  }
  try {
    let result: CachedAudio
    try {
      // Google Translate TTS 的英语音色更接近女主持人的自然播报，优先用于句子。
      result = await fetchGroup(preferred)
    } catch {
      result = await fetchGroup(fallback)
    }
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    cache.set(key, result)
    writeDiskCache(value, accent, result.audioBase64)
    return { success: true, ...result }
  } catch {
    return { success: false, message: '发音加载失败，请检查网络' }
  }
}

export function registerTtsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('tts:fetch', async (_event, payload: { text: string; accent: TtsAccent }) => {
    try {
      return await fetchTtsAudio(payload?.text, payload?.accent === 'uk' ? 'uk' : 'us')
    } catch (error) {
      console.error('tts:fetch error:', error)
      return { success: false, message: '发音加载失败，请检查网络' }
    }
  })
}