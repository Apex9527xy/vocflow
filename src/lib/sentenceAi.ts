import { SENTENCE_TREE_JSON_SCHEMA, SENTENCE_TREE_SYSTEM_PROMPT, validateSentenceTreePayload, type SentenceTreeAnalysis } from '../data/sentenceTree'

export type LocalSentenceAiProvider = 'deepseek-r1:8b' | 'qwen2.5:7b' | 'qwen2.5:14b'
export type PaidSentenceAiProvider = 'qwen' | 'deepseek' | 'glm'
export type SentenceAiProvider = LocalSentenceAiProvider | PaidSentenceAiProvider

export interface SentenceAiModelConfig {
  id: SentenceAiProvider
  label: string
  description: string
  keyUrl: string
  local: boolean
}

export const LOCAL_SENTENCE_AI_MODELS: SentenceAiModelConfig[] = [
  {
    id: 'deepseek-r1:8b',
    label: 'deepseek-r1:8b',
    description: '通过本地 Ollama 运行，模型分析不消耗在线余额',
    keyUrl: 'https://ollama.com/download',
    local: true
  },
  {
    id: 'qwen2.5:7b',
    label: 'qwen2.5:7b',
    description: '轻量本地 Qwen 模型，适合普通电脑',
    keyUrl: 'https://ollama.com/download',
    local: true
  },
  {
    id: 'qwen2.5:14b',
    label: 'qwen2.5:14b',
    description: '更大本地 Qwen 模型，句法分析更稳定但需要更多内存',
    keyUrl: 'https://ollama.com/download',
    local: true
  }
]

export const PAID_SENTENCE_AI_MODELS: SentenceAiModelConfig[] = [
  {
    id: 'qwen',
    label: 'Qwen',
    description: '阿里云百炼 Qwen 兼容接口',
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    local: false
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 开放平台',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    local: false
  },
  {
    id: 'glm',
    label: 'GLM',
    description: '智谱开放平台 GLM',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    local: false
  }
]

export const SENTENCE_AI_MODELS: SentenceAiModelConfig[] = [
  ...LOCAL_SENTENCE_AI_MODELS,
  ...PAID_SENTENCE_AI_MODELS
]

export function isLocalSentenceAiProvider(provider: SentenceAiProvider): boolean {
  return LOCAL_SENTENCE_AI_MODELS.some(item => item.id === provider)
}

const MODEL_STORAGE_KEY = 'vocflow.sentence.ai.model'
const API_KEY_PREFIX = 'vocflow.sentence.ai.api-key.'
const CACHE_STORAGE_KEY = 'vocflow.sentence.ai.cache.v1'
const OLLAMA_INSTALL_PATH_KEY = 'vocflow.sentence.ai.ollama-install-path'
const OLLAMA_MODEL_PATH_KEY = 'vocflow.sentence.ai.ollama-model-path'
const MAX_AI_CACHE = 120

export class SentenceAiError extends Error {
  code: 'missing_key' | 'request_failed' | 'invalid_response'

  constructor(code: SentenceAiError['code'], message: string) {
    super(message)
    this.name = 'SentenceAiError'
    this.code = code
  }
}

export function getSentenceAiModelConfig(provider: SentenceAiProvider): SentenceAiModelConfig {
  return SENTENCE_AI_MODELS.find(item => item.id === provider) || SENTENCE_AI_MODELS[0]
}

export function readSentenceAiProvider(): SentenceAiProvider {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE_KEY)
    if (SENTENCE_AI_MODELS.some(item => item.id === saved)) return saved as SentenceAiProvider
  } catch {}
  return 'qwen2.5:7b'
}

export function saveSentenceAiProvider(provider: SentenceAiProvider): void {
  try { localStorage.setItem(MODEL_STORAGE_KEY, provider) } catch {}
}

export function readSentenceAiApiKey(provider: SentenceAiProvider): string {
  try { return localStorage.getItem(API_KEY_PREFIX + provider) || '' } catch { return '' }
}

export function readOllamaInstallPath(): string {
  try { return localStorage.getItem(OLLAMA_INSTALL_PATH_KEY) || '' } catch { return '' }
}

export function saveOllamaInstallPath(value: string): void {
  try { localStorage.setItem(OLLAMA_INSTALL_PATH_KEY, String(value || '').trim()) } catch {}
}

export function readOllamaModelPath(): string {
  try { return localStorage.getItem(OLLAMA_MODEL_PATH_KEY) || '' } catch { return '' }
}

export function saveOllamaModelPath(value: string): void {
  try { localStorage.setItem(OLLAMA_MODEL_PATH_KEY, String(value || '').trim()) } catch {}
}

export function saveSentenceAiApiKey(provider: SentenceAiProvider, apiKey: string): void {
  try { localStorage.setItem(API_KEY_PREFIX + provider, String(apiKey || '').trim()) } catch {}
}

interface AiCacheEntry {
  provider: SentenceAiProvider
  sentence: string
  tree: SentenceTreeAnalysis
  savedAt: number
}

function readAiCache(): AiCacheEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeAiCache(entries: AiCacheEntry[]): void {
  try { localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_AI_CACHE))) } catch {}
}

export function getCachedSentenceAiTree(provider: SentenceAiProvider, sentence: string): SentenceTreeAnalysis | null {
  const entry = readAiCache().find(item => item.provider === provider && item.sentence === sentence)
  return entry?.tree || null
}

export function cacheSentenceAiTree(provider: SentenceAiProvider, sentence: string, tree: SentenceTreeAnalysis): void {
  const entries = readAiCache().filter(item => !(item.provider === provider && item.sentence === sentence))
  entries.push({ provider, sentence, tree, savedAt: Date.now() })
  writeAiCache(entries)
}

function extractJsonText(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return (fenced?.[1] || text).trim()
}

export async function requestSentenceTreeWithAi(sentence: string, provider: SentenceAiProvider, apiKey: string, modelPath = ''): Promise<SentenceTreeAnalysis> {
  const key = apiKey.trim()
  if (!isLocalSentenceAiProvider(provider) && !key) throw new SentenceAiError('missing_key', 'API密钥未填写')
  let lastError: unknown = null
  let lastTree: SentenceTreeAnalysis | null = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await window.cet4Api.requestSentenceAi({
        provider,
        apiKey: key,
        sentence,
        systemPrompt: SENTENCE_TREE_SYSTEM_PROMPT,
        schema: SENTENCE_TREE_JSON_SCHEMA,
        modelPath: modelPath || undefined
      })
      if (!result.success || !result.content) {
        throw new SentenceAiError('request_failed', result.message || '接口请求失败')
      }
      let payload: unknown
      try { payload = JSON.parse(extractJsonText(result.content)) } catch {
        throw new SentenceAiError('invalid_response', '模型返回内容不是有效 JSON')
      }
      const tree = validateSentenceTreePayload(payload, sentence)
      lastTree = tree
      if (tree.valid) return tree
    } catch (error) {
      lastError = error
    }
  }
  if (lastTree) return lastTree
  if (lastError instanceof SentenceAiError) throw lastError
  throw new SentenceAiError('request_failed', lastError instanceof Error ? lastError.message : '接口请求失败')
}
