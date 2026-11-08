import { SentenceAiError, isLocalSentenceAiProvider, type SentenceAiProvider } from './sentenceAi'
import type { Morpheme } from '../data/morphology'

interface MorphologyAiCacheEntry {
  provider: SentenceAiProvider
  word: string
  parts: Morpheme[]
  note: string
  savedAt: number
}

interface MorphologyAiPayload {
  word?: unknown
  parts?: unknown
  note?: unknown
}

const CACHE_STORAGE_KEY = 'vocflow.morphology.ai.cache.v1'
const MAX_CACHE_ENTRIES = 300

const MORPHOLOGY_AI_SYSTEM_PROMPT = `你是严谨的英语构词法与词源分析专家。请分析用户给出的英文单词，补全其前缀、词根和后缀拆分。
只返回 JSON，不要返回 Markdown、解释性前后缀或额外文字。
要求：
1. parts 按单词从左到右排列，type 只能是 prefix、root、suffix。
2. form 保留构词形式，前缀写作 pre-，后缀写作 -tion，词根直接写词根形式。
3. meaning 使用简明中文，说明该构件的核心含义；不要编造不存在的词根。
4. 优先给出能解释当前单词现代拼写的完整拆分；若某部分发生拼写同化或音变，可在 note 中简短说明。
5. 基础词、借词或无法可靠拆分时，parts 可以为空数组，不要强行拆分。
6. 最多返回 8 个构件。`

const MORPHOLOGY_AI_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    word: { type: 'string' },
    parts: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['prefix', 'root', 'suffix'] },
          form: { type: 'string' },
          meaning: { type: 'string' }
        },
        required: ['type', 'form', 'meaning']
      }
    },
    note: { type: 'string' }
  },
  required: ['word', 'parts', 'note']
}

function readCache(): MorphologyAiCacheEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCache(entries: MorphologyAiCacheEntry[]): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_CACHE_ENTRIES)))
  } catch {}
}

export function getCachedMorphologyAi(provider: SentenceAiProvider, word: string): { parts: Morpheme[]; note: string } | null {
  const normalized = String(word || '').trim().toLowerCase()
  const entry = readCache().find(item => item.provider === provider && item.word === normalized)
  return entry ? { parts: entry.parts, note: entry.note } : null
}

export function cacheMorphologyAi(provider: SentenceAiProvider, word: string, parts: Morpheme[], note: string): void {
  const normalized = String(word || '').trim().toLowerCase()
  const entries = readCache().filter(item => !(item.provider === provider && item.word === normalized))
  entries.push({ provider, word: normalized, parts, note, savedAt: Date.now() })
  writeCache(entries)
}

function extractJsonText(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] || text).trim()
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function cleanForm(value: unknown, type: Morpheme['type']): string {
  let form = cleanText(value, 40)
    .replace(/^[\s"'`([{•·*]+/, '')
    .replace(/[\s"'`)\]}。，,;；:：]+$/, '')
    .trim()
  if (!form || !/^[A-Za-z][A-Za-z'’/-]*$/.test(form)) return ''
  if (/^(?:prefix|suffix|root|affix|word|form|词根|词缀|前缀|后缀)$/i.test(form)) return ''
  if (type === 'prefix' && !form.endsWith('-')) form += '-'
  if (type === 'suffix' && !form.startsWith('-')) form = '-' + form
  return form
}

export function normalizeMorphologyAiPayload(payload: unknown, word: string): { parts: Morpheme[]; note: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SentenceAiError('invalid_response', '模型返回的词根词缀结果格式无效')
  }
  const data = payload as MorphologyAiPayload
  if (!Array.isArray(data.parts)) {
    throw new SentenceAiError('invalid_response', '模型返回结果缺少 parts 数组')
  }

  const seen = new Set<string>()
  const parts: Morpheme[] = []
  for (const rawPart of data.parts.slice(0, 8)) {
    if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) continue
    const part = rawPart as Record<string, unknown>
    const type = part.type === 'prefix' || part.type === 'suffix' || part.type === 'root' ? part.type : null
    if (!type) continue
    const form = cleanForm(part.form, type)
    const meaning = cleanText(part.meaning, 180)
    if (!form || !meaning) continue
    const key = `${type}:${form.toLowerCase().replace(/^-+|-+$/g, '')}`
    if (seen.has(key)) continue
    seen.add(key)
    parts.push({ type, form, meaning, text: form.replace(/^-+|-+$/g, '') || form })
  }

  const note = cleanText(data.note, 240)
  if (!parts.length) {
    throw new SentenceAiError('invalid_response', `模型未返回 ${word} 的可靠词根词缀拆分，已保留本地分析`)
  }
  return { parts, note }
}

export async function requestMorphologyWithAi(
  word: string,
  provider: SentenceAiProvider,
  apiKey: string,
  modelPath = ''
): Promise<{ parts: Morpheme[]; note: string }> {
  const normalizedWord = String(word || '').trim().toLowerCase()
  const key = String(apiKey || '').trim()
  if (!normalizedWord || !/^[a-z][a-z'’-]{0,48}$/.test(normalizedWord)) {
    throw new SentenceAiError('invalid_response', '请输入有效的英文单词')
  }
  if (!isLocalSentenceAiProvider(provider) && !key) {
    throw new SentenceAiError('missing_key', 'API密钥未填写，已保留内置词根词缀分析')
  }

  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await window.cet4Api.requestSentenceAi({
        provider,
        apiKey: key,
        sentence: normalizedWord,
        systemPrompt: MORPHOLOGY_AI_SYSTEM_PROMPT,
        schema: MORPHOLOGY_AI_JSON_SCHEMA,
        modelPath: modelPath || undefined
      })
      if (!result.success || !result.content) {
        throw new SentenceAiError('request_failed', result.message || '大模型请求失败')
      }
      let payload: unknown
      try {
        payload = JSON.parse(extractJsonText(result.content))
      } catch {
        throw new SentenceAiError('invalid_response', '模型返回内容不是有效 JSON')
      }
      return normalizeMorphologyAiPayload(payload, normalizedWord)
    } catch (error) {
      lastError = error
    }
  }
  if (lastError instanceof SentenceAiError) throw lastError
  throw new SentenceAiError('request_failed', lastError instanceof Error ? lastError.message : '大模型请求失败')
}