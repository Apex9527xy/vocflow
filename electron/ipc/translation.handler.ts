import type { IpcMain } from 'electron'

interface SentenceTranslationResult {
  translations: string[]
  fullTranslation: string
  speakUrl: string
  source: string
}

const cache = new Map<string, SentenceTranslationResult>()
const MAX_CACHE_SIZE = 120

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function normalizeResult(payload: any, sentences: string[]): SentenceTranslationResult | null {
  const translated = Array.isArray(payload?.translation)
    ? payload.translation.map(cleanText).filter(Boolean)
    : []
  if (!translated.length) return null

  const fullTranslation = translated.join('\n').trim()
  const lines = fullTranslation.split(/\n+/).map((line: string) => line.trim()).filter(Boolean)
  const normalizedLines = lines.length === sentences.length
    ? lines
    : lines.length > 0 ? lines : [fullTranslation]

  return {
    translations: normalizedLines,
    fullTranslation,
    speakUrl: cleanText(payload?.speakUrl),
    source: '有道翻译'
  }
}

export function registerTranslationHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('sentence:translate', async (_event, input: string[]) => {
    const sentences = (Array.isArray(input) ? input : [])
      .map(value => cleanText(value).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 8)
    if (!sentences.length) return null
    const text = sentences.join('\n')
    if (text.length > 3000 || !/[A-Za-z]{2}/.test(text)) return null

    const key = `zh-CHS:${text}`
    if (cache.has(key)) return cache.get(key)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const body = new URLSearchParams({ from: 'en', to: 'zh-CHS', q: text })
      const response = await fetch('https://aidemo.youdao.com/trans', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 CET4-Coach/0.2'
        },
        body: body.toString(),
        signal: controller.signal
      })
      if (!response.ok) return null
      const payload = await response.json()
      if (payload?.errorCode && payload.errorCode !== '0') return null
      const result = normalizeResult(payload, sentences)
      if (!result) return null

      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value
        if (oldestKey) cache.delete(oldestKey)
      }
      cache.set(key, result)
      return result
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })
}
