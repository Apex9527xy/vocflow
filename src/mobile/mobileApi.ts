import packageJson from '../../package.json'
import cet4Core from '../../resources/wordbooks/cet4-core.json'
import { stageExamFiles } from './exam/stage'
import * as examImport from './exam/importService'

type RawWord = {
  word: string
  phonetic_us?: string
  meaning_cn?: string
  pos?: string
  example_sentence?: string
  level?: string
  frequency?: number
  tags?: string | string[]
}

type MobileWord = {
  id: number
  word: string
  phonetic_us: string
  phonetic_uk: string
  meaning_cn: string
  pos: string
  example_sentence: string
  level: string
  frequency: number
  tags: string
}

type WordProgress = {
  wordId: number
  familiarity: number
  interval_days: number
  ease_factor: number
  status: 'new' | 'learning' | 'review' | 'mastered'
  correct_count: number
  wrong_count: number
  last_review_at: string
  next_review_at: string
}

type CustomBook = {
  slug: string
  name: string
  stage: string
  description: string
  enabled: number
  sort_order: number
  words: MobileWord[]
}

const APP_VERSION = String(packageJson.version || '2.9.14')
const STORAGE = {
  progress: 'vocflow.mobile.progress.v1',
  settings: 'vocflow.mobile.settings.v1',
  bookState: 'vocflow.mobile.book-state.v1',
  customBooks: 'vocflow.mobile.custom-books.v1',
  lookupHistory: 'vocflow.mobile.lookups.v1',
  reminders: 'vocflow.mobile.reminders.v1',
  planDone: 'vocflow.mobile.plan-done.v1',
  sessions: 'vocflow.mobile.sessions.v1',
  literature: 'vocflow.mobile.literature.v1'
} as const

// Local PDFs / DOCX imported on the mobile/PWA build are kept in IndexedDB: the
// file bytes are too large for localStorage, and the browser has no direct access
// to the desktop file system. PDFs open in the in-app pdf.js view; DOCX text is
// extracted in-browser and rendered by the article view. We only swap the source
// of the bytes from the Electron main process to an in-browser file picker.
const LITERATURE_DB_NAME = 'vocflow-mobile-literature'
const LITERATURE_STORE = 'files'

type MobileLiteratureMeta = {
  id: number
  title: string
  authors: string
  year: string
  source: string
  abstract: string
  content_text: string
  file_path: string
  file_type: string
  created_at: string
  size: number
}

function openLiteratureDb(): Promise<IDBDatabase> {
  return new Promise((resolveDb, rejectDb) => {
    if (typeof indexedDB === 'undefined') {
      rejectDb(new Error('当前浏览器不支持本地存储'))
      return
    }
    const request = indexedDB.open(LITERATURE_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LITERATURE_STORE)) {
        db.createObjectStore(LITERATURE_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolveDb(request.result)
    request.onerror = () => rejectDb(request.error || new Error('本地文献库打开失败'))
  })
}

async function literatureMetaList(): Promise<MobileLiteratureMeta[]> {
  return readStorage<MobileLiteratureMeta[]>(STORAGE.literature, [])
}

async function saveLiteratureMetaList(rows: MobileLiteratureMeta[]): Promise<void> {
  writeStorage(STORAGE.literature, rows)
}

async function putLiteratureBytes(id: number, bytes: ArrayBuffer): Promise<void> {
  const db = await openLiteratureDb()
  await new Promise<void>((resolvePut, rejectPut) => {
    const tx = db.transaction(LITERATURE_STORE, 'readwrite')
    tx.objectStore(LITERATURE_STORE).put({ id, bytes })
    tx.oncomplete = () => { db.close(); resolvePut() }
    tx.onerror = () => { db.close(); rejectPut(tx.error || new Error('保存文献失败')) }
  })
}

async function getLiteratureBytes(id: number): Promise<ArrayBuffer | null> {
  const db = await openLiteratureDb()
  return new Promise((resolveGet, rejectGet) => {
    const tx = db.transaction(LITERATURE_STORE, 'readonly')
    const request = tx.objectStore(LITERATURE_STORE).get(id)
    request.onsuccess = () => {
      db.close()
      resolveGet(request.result ? (request.result.bytes as ArrayBuffer) : null)
    }
    request.onerror = () => { db.close(); rejectGet(request.error || new Error('读取文献失败')) }
  })
}

async function deleteLiteratureBytes(id: number): Promise<void> {
  const db = await openLiteratureDb()
  await new Promise<void>((resolveDel, rejectDel) => {
    const tx = db.transaction(LITERATURE_STORE, 'readwrite')
    tx.objectStore(LITERATURE_STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolveDel() }
    tx.onerror = () => { db.close(); rejectDel(tx.error || new Error('删除文献失败')) }
  })
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

async function inflateRawAsync(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压 Word 文档，请使用桌面版导入该文件')
  }
  const sliced = compressed.slice()
  const stream = new Blob([sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength)]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

interface MobileDocxEntry { name: string; data: Uint8Array }

async function readDocxEntries(buffer: Uint8Array): Promise<MobileDocxEntry[]> {
  const entries: MobileDocxEntry[] = []
  let p = 0
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  while (p + 4 <= buffer.length && view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true)
    const compSize = view.getUint32(p + 18, true)
    const nameLen = view.getUint16(p + 26, true)
    const extraLen = view.getUint16(p + 28, true)
    const name = new TextDecoder().decode(buffer.subarray(p + 30, p + 30 + nameLen))
    const dataStart = p + 30 + nameLen + extraLen
    const payload = buffer.subarray(dataStart, dataStart + compSize)
    const data = method === 0 ? payload : await inflateRawAsync(payload)
    entries.push({ name, data })
    p = dataStart + compSize
  }
  return entries
}

async function extractDocxTextFromBytes(bytes: ArrayBuffer): Promise<string> {
  const entries = await readDocxEntries(new Uint8Array(bytes))
  const documentEntry = entries.find(entry => /^word\/document\.xml$/i.test(entry.name))
  if (!documentEntry) throw new Error('DOCX 中缺少正文文件，可能不是有效的 Word 文档')
  const xml = new TextDecoder('utf-8').decode(documentEntry.data)
  const paragraphs: string[] = []
  const paragraphMatches = xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)
  for (const paragraphMatch of paragraphMatches) {
    const paragraphXml = paragraphMatch[0]
    const texts: string[] = []
    for (const runMatch of paragraphXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)) {
      texts.push(decodeXmlEntities(runMatch[1]))
    }
    const line = texts.join('').replace(/\s+/g, ' ').trim()
    if (line) paragraphs.push(line)
  }
  const contentText = paragraphs.join('\n\n').replace(/\u0000/g, '').trim()
  if (!contentText) throw new Error('DOCX 中没有可读取的文字内容')
  return contentText
}

const DEFAULT_SETTINGS = {
  newWordsTarget: 20,
  reviewWordsTarget: 30,
  listeningMinutes: 10,
  readingMinutes: 10
}

const builtInWords: MobileWord[] = (cet4Core as RawWord[]).map((item, index) => ({
  id: index + 1,
  word: String(item.word || '').trim().toLowerCase(),
  phonetic_us: String(item.phonetic_us || ''),
  phonetic_uk: '',
  meaning_cn: String(item.meaning_cn || ''),
  pos: String(item.pos || ''),
  example_sentence: String(item.example_sentence || ''),
  level: String(item.level || 'cet4'),
  frequency: Number(item.frequency || 0),
  tags: Array.isArray(item.tags) ? JSON.stringify(item.tags) : String(item.tags || '[]')
})).filter(item => item.word && item.meaning_cn)

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // IndexedDB is not used here because localStorage keeps the mobile build simple and synchronous.
  }
}

function todayKey(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function customBooks(): CustomBook[] {
  const books = readStorage<CustomBook[]>(STORAGE.customBooks, [])
  return Array.isArray(books) ? books : []
}

function allWords(): MobileWord[] {
  return [...builtInWords, ...customBooks().flatMap(book => Array.isArray(book.words) ? book.words : [])]
}

function bookState(): Record<string, boolean> {
  return readStorage<Record<string, boolean>>(STORAGE.bookState, { cet4: true })
}

function enabledBookSlugs(): Set<string> {
  const state = bookState()
  const slugs = new Set<string>()
  if (state.cet4 !== false) slugs.add('cet4')
  for (const book of customBooks()) {
    if (state[book.slug] !== false) slugs.add(book.slug)
  }
  return slugs
}

function enabledWords(): MobileWord[] {
  const enabled = enabledBookSlugs()
  const custom = new Set<string>()
  for (const book of customBooks()) {
    if (enabled.has(book.slug)) book.words.forEach(word => custom.add(word.word))
  }
  return allWords().filter(word => enabled.has('cet4') || custom.has(word.word))
}

function progressMap(): Record<string, WordProgress> {
  return readStorage<Record<string, WordProgress>>(STORAGE.progress, {})
}

function saveProgress(map: Record<string, WordProgress>): void {
  writeStorage(STORAGE.progress, map)
}

function settings(): typeof DEFAULT_SETTINGS {
  return { ...DEFAULT_SETTINGS, ...readStorage<Partial<typeof DEFAULT_SETTINGS>>(STORAGE.settings, {}) }
}

function result(message = '该功能在移动版中暂不可用，请使用 Windows 桌面版'): { success: false; canceled: true; message: string } {
  return { success: false, canceled: true, message }
}

// Open the browser's native file picker. On mobile WebViews this resolves to the
// system file chooser; no Electron main-process dialog is involved.
function pickBrowserFile(accept: string): Promise<{ file: File } | null> {
  return new Promise(resolvePick => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    const cleanup = () => {
      input.removeEventListener('change', onChange)
      input.remove()
    }
    const onChange = () => {
      const file = input.files?.[0]
      cleanup()
      resolvePick(file ? { file } : null)
    }
    input.addEventListener('change', onChange)
    // Some mobile WebViews only honour the picker if the element is briefly in
    // the DOM; attach it, then trigger the click on the next frame.
    document.body.appendChild(input)
    window.setTimeout(() => {
      const opened = input.click()
      void opened
    }, 0)
    // If the user cancels, some browsers fire no change event; resolve null after
    // the picker would have closed so we do not hang the UI indefinitely.
    window.setTimeout(() => {
      if (!input.files?.length) {
        cleanup()
        resolvePick(null)
      }
    }, 30_000)
  })
}

// Multi-file picker for the exam batch import. Returns staged opaque ids that
// stand in for desktop file paths; the service pulls bytes back out on save.
function pickBrowserFiles(accept: string): Promise<File[]> {
  return new Promise(resolvePick => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = true
    input.style.display = 'none'
    const cleanup = () => {
      input.removeEventListener('change', onChange)
      input.remove()
    }
    const onChange = () => {
      const files = Array.from(input.files || [])
      cleanup()
      resolvePick(files)
    }
    input.addEventListener('change', onChange)
    document.body.appendChild(input)
    window.setTimeout(() => {
      const opened = input.click()
      void opened
    }, 0)
    window.setTimeout(() => {
      if (!input.files?.length) {
        cleanup()
        resolvePick([])
      }
    }, 30_000)
  })
}

async function onlineLookup(query: string): Promise<any | null> {
  const word = String(query || '').trim()
  if (!word) return null
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    if (!response.ok) return null
    const entries = await response.json() as any[]
    const entry = Array.isArray(entries) ? entries[0] : null
    if (!entry) return null
    const meanings = Array.isArray(entry.meanings) ? entry.meanings : []
    const definitions = meanings.flatMap((meaning: any) => Array.isArray(meaning.definitions) ? meaning.definitions : [])
    const first = definitions[0] || {}
    return {
      word: entry.word || word,
      query: word,
      phonetic_us: entry.phonetic || meanings[0]?.definitions?.[0]?.phonetic || '',
      meaning_cn: definitions.slice(0, 3).map((item: any) => item.definition).filter(Boolean).join('；'),
      pos: meanings[0]?.partOfSpeech || '',
      example_sentence: first.example || '',
      etymology: entry.origin || '',
      source: '在线词典'
    }
  } catch {
    return null
  }
}

async function translateSentences(sentences: string[]): Promise<any> {
  const source = Array.isArray(sentences) ? sentences.map(item => String(item || '').trim()).filter(Boolean) : []
  if (!source.length) return { translations: [], fullTranslation: '', speakUrl: '' }
  try {
    const translations = await Promise.all(source.slice(0, 12).map(async sentence => {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sentence)}&langpair=en%7Czh-CN`
      const response = await fetch(url)
      if (!response.ok) return ''
      const payload = await response.json() as any
      return String(payload?.responseData?.translatedText || '').trim()
    }))
    return {
      translations,
      fullTranslation: translations.filter(Boolean).join('\n'),
      speakUrl: ''
    }
  } catch {
    return { translations: [], fullTranslation: '', speakUrl: '' }
  }
}

function responseContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((item: any) => typeof item === 'string' ? item : String(item?.text || '')).join('')
  return ''
}

async function requestSentenceAi(payload: any): Promise<{ success: boolean; content?: string; message?: string }> {
  const localProviders = new Set(['deepseek-r1:8b', 'qwen2.5:7b', 'qwen2.5:14b'])
  const provider = String(payload?.provider || '')
  const apiKey = String(payload?.apiKey || '').trim()
  const sentence = String(payload?.sentence || '').trim()
  if (localProviders.has(provider)) {
    return { success: false, message: '手机端无法调用电脑本地 Ollama，请在设置中改用在线大模型 API' }
  }
  if (!apiKey) return { success: false, message: 'API 密钥未填写' }
  if (!sentence) return { success: false, message: '句子内容为空' }
  const configs: Record<string, { endpoint: string; model: string }> = {
    qwen: { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-turbo' },
    deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    glm: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' }
  }
  const config = configs[provider]
  if (!config) return { success: false, message: '不支持的大模型服务' }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 45_000)
  try {
    const messages = [
      { role: 'system', content: String(payload?.systemPrompt || '') },
      { role: 'user', content: `请严格按照下面的 JSON Schema 分析输入内容，并且只返回 JSON。\n\nJSON Schema:\n${JSON.stringify(payload?.schema)}\n\n待分析内容：\n${sentence}` }
    ]
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: 0.1,
      max_tokens: 3600,
      messages
    }
    if (provider === 'qwen' || provider === 'deepseek') body.response_format = { type: 'json_object' }
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const raw = await response.text()
    if (!response.ok) {
      let detail = raw.slice(0, 500)
      try {
        const parsed = JSON.parse(raw)
        detail = parsed?.error?.message || parsed?.message || detail
      } catch {}
      return { success: false, message: `接口请求失败 (HTTP ${response.status})：${detail}` }
    }
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { success: false, message: '接口返回内容不是有效 JSON' }
    }
    const content = responseContent(parsed)
    return content ? { success: true, content } : { success: false, message: '接口返回内容为空' }
  } catch (error) {
    const message = (error as Error).name === 'AbortError' ? '接口请求超时' : ((error as Error).message || '接口请求失败')
    return { success: false, message }
  } finally {
    window.clearTimeout(timeout)
  }
}

function normalizeImportedWord(item: any, id: number): MobileWord | null {
  const word = String(item?.word ?? item?.term ?? item?.english ?? '').trim().toLowerCase()
  const meaning = String(item?.meaning_cn ?? item?.meaning ?? item?.translation ?? item?.cn ?? '').trim()
  if (!word || !meaning) return null
  return {
    id,
    word,
    phonetic_us: String(item?.phonetic_us ?? item?.phonetic ?? '').trim(),
    phonetic_uk: '',
    meaning_cn: meaning,
    pos: String(item?.pos ?? '').trim(),
    example_sentence: String(item?.example_sentence ?? item?.example ?? '').trim(),
    level: String(item?.level ?? item?.stage ?? 'custom').trim(),
    frequency: Number(item?.frequency || 0),
    tags: Array.isArray(item?.tags) ? JSON.stringify(item.tags) : String(item?.tags || '[]')
  }
}

function createApi(): Record<string, any> {
  const api: Record<string, any> = {}

  api.getWords = async (params: { limit?: number; offset?: number; level?: string } = {}) => {
    const limit = Math.max(0, Number(params.limit ?? 100))
    const offset = Math.max(0, Number(params.offset ?? 0))
    return enabledWords()
      .filter(word => !params.level || word.level === params.level)
      .slice(offset, offset + limit)
  }
  api.getDictionary = async () => enabledWords().map(word => ({ word: word.word, pos: word.pos, meaning_cn: word.meaning_cn }))
  api.getWordById = async (id: number) => allWords().find(word => word.id === Number(id)) || null
  api.getNewWords = async (limit: number) => {
    const map = progressMap()
    const rows = enabledWords().filter(word => !map[String(word.id)])
    return (rows.length ? rows : enabledWords()).slice(0, Math.max(1, Number(limit) || 20))
  }
  api.getReviewWords = async (limit: number) => {
    const map = progressMap()
    const rows = enabledWords()
      .filter(word => map[String(word.id)] && map[String(word.id)].familiarity < 4)
      .sort((left, right) => (map[String(left.id)]?.familiarity || 0) - (map[String(right.id)]?.familiarity || 0))
    return (rows.length ? rows : enabledWords()).slice(0, Math.max(1, Number(limit) || 30))
  }
  api.getYesterdayWords = async (limit: number) => {
    const map = progressMap()
    return enabledWords().filter(word => map[String(word.id)]).slice(0, Math.max(1, Number(limit) || 10))
  }
  api.searchWords = async (query: string) => {
    const value = String(query || '').trim().toLowerCase()
    if (!value) return []
    return enabledWords().filter(word => word.word.includes(value) || word.meaning_cn.includes(value)).slice(0, 30)
  }
  api.lookupWordOnline = onlineLookup
  api.translateSelection = translateSentences
  api.requestSentenceAi = requestSentenceAi
  // 手机/网页端没有主进程 TTS：返回失败即可，渲染层会自动回退到浏览器直连音频播放。
  api.fetchTtsAudio = async () => ({ success: false, message: '浏览器在线发音' })
  api.listSentenceLocalModels = async () => ({ success: false, ollamaAvailable: false, installed: [], message: '手机端不支持本地 Ollama' })
  api.downloadSentenceLocalModel = async () => ({ success: false, message: '手机端不支持本地 Ollama' })
  api.installSentenceOllama = async () => ({ success: false, message: '手机端不支持本地 Ollama' })
  api.pickSentenceAiDirectory = async () => result()
  api.onSentenceOllamaInstallProgress = () => () => {}
  api.onLiteratureChanged = () => () => {}

  api.getWordCount = async () => allWords().length
  api.getEnabledWordCount = async () => enabledWords().length
  api.getWordBooks = async () => {
    const state = bookState()
    const books = [{
      slug: 'cet4',
      name: '英语四级词汇核心版',
      short_name: '四级',
      stage: 'CET-4',
      description: '随安装包内置的四级核心词库',
      source_file: 'cet4-core.json',
      word_count: builtInWords.length,
      enabled: state.cet4 === false ? 0 : 1,
      sort_order: 10
    }]
    for (const book of customBooks()) {
      books.push({
        slug: book.slug,
        name: book.name,
        short_name: book.name,
        stage: book.stage,
        description: book.description,
        source_file: 'local-import',
        word_count: book.words.length,
        enabled: state[book.slug] === false ? 0 : 1,
        sort_order: book.sort_order
      })
    }
    return books
  }
  api.setWordBookEnabled = async (payload: { slug: string; enabled: boolean }) => {
    const state = bookState()
    state[String(payload.slug)] = Boolean(payload.enabled)
    writeStorage(STORAGE.bookState, state)
    return { success: true }
  }
  api.importWordbook = async (words: any[]) => {
    const nextId = Math.max(100000, ...allWords().map(word => word.id + 1))
    const normalized = (Array.isArray(words) ? words : []).map((item, index) => normalizeImportedWord(item, nextId + index)).filter(Boolean) as MobileWord[]
    if (!normalized.length) return { success: false, message: '没有可导入的单词', added: 0 }
    const books = customBooks()
    const slug = `custom-${Date.now()}`
    books.push({ slug, name: '移动端导入词书', stage: '自定义', description: '', enabled: 1, sort_order: 100, words: normalized })
    writeStorage(STORAGE.customBooks, books)
    return { success: true, message: `已导入 ${normalized.length} 个单词`, added: normalized.length, slug, name: '移动端导入词书' }
  }
  api.importCustomWordbook = async (payload: any) => {
    const books = customBooks()
    const slug = `custom-${Date.now()}`
    const baseId = Math.max(100000, ...allWords().map(word => word.id + 1))
    const normalized = (Array.isArray(payload?.words) ? payload.words : [])
      .map((item: any, index: number) => normalizeImportedWord(item, baseId + index))
      .filter(Boolean) as MobileWord[]
    if (!normalized.length) return { success: false, message: '没有可导入的单词', added: 0 }
    const name = String(payload?.name || '我的自定义词书').trim()
    books.push({
      slug,
      name,
      stage: String(payload?.stage || '自定义').trim(),
      description: String(payload?.description || '').trim(),
      enabled: 1,
      sort_order: 100 + books.length,
      words: normalized
    })
    writeStorage(STORAGE.customBooks, books)
    const state = bookState()
    state[slug] = true
    writeStorage(STORAGE.bookState, state)
    return { success: true, message: `已导入《${name}》，共 ${normalized.length} 个单词`, added: normalized.length, slug, name }
  }
  api.deleteCustomWordbook = async (slug: string) => {
    const books = customBooks()
    const filtered = books.filter(book => book.slug !== String(slug))
    if (filtered.length === books.length) return { success: false, message: '未找到自定义词书' }
    writeStorage(STORAGE.customBooks, filtered)
    return { success: true, message: '自定义词书已删除' }
  }

  api.getLookupHistory = async (limit = 100) => readStorage<any[]>(STORAGE.lookupHistory, []).slice(0, Math.max(1, Number(limit) || 100))
  api.recordLookup = async (entry: any) => {
    const rows = readStorage<any[]>(STORAGE.lookupHistory, [])
    rows.unshift({ id: Date.now(), ...entry, looked_up_at: new Date().toISOString() })
    writeStorage(STORAGE.lookupHistory, rows.slice(0, 300))
    return { success: true }
  }
  api.deleteLookupHistory = async (id: number) => {
    writeStorage(STORAGE.lookupHistory, readStorage<any[]>(STORAGE.lookupHistory, []).filter(item => Number(item.id) !== Number(id)))
    return { success: true }
  }
  api.clearLookupHistory = async () => {
    writeStorage(STORAGE.lookupHistory, [])
    return { success: true }
  }

  api.getAppVersion = async () => APP_VERSION
  api.checkForUpdate = async () => ({ hasUpdate: false, latestVersion: APP_VERSION, source: 'web', releaseNotes: [] })
  api.installUpdate = async () => ({ success: false, message: '移动端请通过应用商店、GitHub Release 或网页刷新更新' })

  api.updateWordProgress = async (payload: { wordId: number; familiarity: number; correct: boolean }) => {
    const map = progressMap()
    const key = String(payload.wordId)
    const previous = map[key]
    const familiarity = Math.max(0, Math.min(4, Number(payload.familiarity) || 0))
    const now = new Date()
    const next = new Date(now)
    const intervalDays = familiarity >= 4 ? Math.max(previous?.interval_days || 1, 3) : familiarity >= 3 ? 1 : 0
    next.setDate(next.getDate() + intervalDays)
    map[key] = {
      wordId: Number(payload.wordId),
      familiarity,
      interval_days: intervalDays,
      ease_factor: previous?.ease_factor || 2.5,
      status: familiarity >= 4 ? 'mastered' : familiarity >= 3 ? 'review' : 'learning',
      correct_count: (previous?.correct_count || 0) + (payload.correct ? 1 : 0),
      wrong_count: (previous?.wrong_count || 0) + (payload.correct ? 0 : 1),
      last_review_at: now.toISOString(),
      next_review_at: next.toISOString()
    }
    saveProgress(map)
    return { success: true }
  }

  api.getTodayPlan = async () => {
    const value = settings()
    return {
      new_words_target: value.newWordsTarget,
      review_words_target: value.reviewWordsTarget,
      listening_minutes: value.listeningMinutes,
      reading_minutes: value.readingMinutes,
      is_completed: readStorage<boolean>(STORAGE.planDone, false) ? 1 : 0
    }
  }
  api.saveSettings = async (value: any) => {
    writeStorage(STORAGE.settings, {
      newWordsTarget: Number(value?.newWordsTarget ?? DEFAULT_SETTINGS.newWordsTarget),
      reviewWordsTarget: Number(value?.reviewWordsTarget ?? DEFAULT_SETTINGS.reviewWordsTarget),
      listeningMinutes: Number(value?.listeningMinutes ?? DEFAULT_SETTINGS.listeningMinutes),
      readingMinutes: Number(value?.readingMinutes ?? DEFAULT_SETTINGS.readingMinutes)
    })
    return { success: true }
  }
  api.completePlan = async () => {
    writeStorage(STORAGE.planDone, true)
    return { success: true }
  }
  api.getDashboardStats = async () => {
    const map = progressMap()
    const values = Object.values(map)
    const today = todayKey()
    const todayRows = values.filter(item => item.last_review_at.slice(0, 10) === today)
    return {
      wordsLearned: values.length,
      wordsMastered: values.filter(item => item.familiarity >= 4).length,
      reviewDue: values.filter(item => item.familiarity < 4).length || Math.min(10, builtInWords.length),
      streakDays: todayRows.length ? 1 : 0,
      todayWordsLearned: todayRows.filter(item => item.correct_count === 1).length,
      todayWordsReviewed: todayRows.length
    }
  }
  api.getStudyHeatmap = async () => {
    const map = progressMap()
    const values = Object.values(map)
    const rows = []
    for (let offset = 29; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const dayRows = values.filter(item => item.last_review_at.slice(0, 10) === key)
      rows.push({
        date: key,
        words_learned: dayRows.length,
        words_reviewed: dayRows.length,
        total_study_minutes: dayRows.length ? Math.max(1, Math.round(dayRows.length * 0.4)) : 0
      })
    }
    return rows
  }
  api.getWeakWords = async (limit: number) => {
    const map = progressMap()
    const ids = Object.values(map).filter(item => item.familiarity <= 2).map(item => item.wordId)
    return allWords().filter(word => ids.includes(word.id)).slice(0, Math.max(1, Number(limit) || 10))
  }
  api.getSkillAnalysis = async () => [
    { key: 'vocabulary', name: '词汇掌握', total: Math.max(1, api.getWordCount ? builtInWords.length : 1), mastered: Object.values(progressMap()).filter(item => item.familiarity >= 4).length, masteryRate: 0 }
  ].map(item => ({ ...item, masteryRate: Math.round(item.mastered / item.total * 100) }))
  api.getEfficiencyTrend = async (days: number) => {
    const rows = []
    for (let offset = Math.max(0, Number(days) || 14) - 1; offset >= 0; offset -= 1) {
      const date = new Date()
      date.setDate(date.getDate() - offset)
      rows.push({ date: date.toISOString().slice(0, 10), efficiency: 0 })
    }
    return rows
  }
  api.getMemoryDistribution = async () => {
    const values = Object.values(progressMap())
    return [
      { status: 'new', count: Math.max(0, allWords().length - values.length) },
      { status: 'learning', count: values.filter(item => item.status === 'learning').length },
      { status: 'review', count: values.filter(item => item.status === 'review').length },
      { status: 'mastered', count: values.filter(item => item.status === 'mastered').length }
    ]
  }
  api.recordPomodoro = async () => ({ success: true })
  api.startSession = async () => {
    const id = Date.now()
    writeStorage(STORAGE.sessions, { id, startedAt: new Date().toISOString() })
    return { sessionId: id }
  }
  api.updateSession = async () => ({ success: true })

  api.exportData = async () => ({
    app: 'VocFlow',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings(),
    progress: progressMap(),
    customBooks: customBooks(),
    lookupHistory: readStorage<any[]>(STORAGE.lookupHistory, [])
  })
  api.resetProgress = async () => {
    writeStorage(STORAGE.progress, {})
    writeStorage(STORAGE.planDone, false)
    return { success: true }
  }

  api.getReminders = async () => readStorage<any[]>(STORAGE.reminders, [])
  api.addReminder = async (payload: { hour: number; minute: number; message?: string }) => {
    const rows = readStorage<any[]>(STORAGE.reminders, [])
    const item = { id: Date.now(), hour: Number(payload.hour), minute: Number(payload.minute), message: String(payload.message || ''), enabled: 1 }
    rows.push(item)
    writeStorage(STORAGE.reminders, rows)
    return { success: true, id: item.id }
  }
  api.updateReminder = async (id: number, payload: any) => {
    const rows = readStorage<any[]>(STORAGE.reminders, []).map(item => Number(item.id) === Number(id) ? { ...item, ...payload } : item)
    writeStorage(STORAGE.reminders, rows)
    return { success: true }
  }
  api.toggleReminder = async (id: number) => {
    const rows = readStorage<any[]>(STORAGE.reminders, []).map(item => Number(item.id) === Number(id) ? { ...item, enabled: item.enabled ? 0 : 1 } : item)
    writeStorage(STORAGE.reminders, rows)
    return { success: true }
  }
  api.deleteReminder = async (id: number) => {
    writeStorage(STORAGE.reminders, readStorage<any[]>(STORAGE.reminders, []).filter(item => Number(item.id) !== Number(id)))
    return { success: true }
  }

  api.getActivitySummary = async () => {
    const values = Object.values(progressMap())
    const activeDays = new Set(values.map(item => item.last_review_at.slice(0, 10)))
    return {
      success: true,
      summary: {
        totalActiveDays: activeDays.size,
        totalLaunches: Math.max(1, activeDays.size),
        last7Days: Array.from({ length: 7 }, (_, index) => {
          const date = new Date()
          date.setDate(date.getDate() - (6 - index))
          const key = date.toISOString().slice(0, 10)
          return { date: key, label: `${date.getMonth() + 1}/${date.getDate()}`, active: activeDays.has(key) ? 1 : 0 }
        })
      }
    }
  }
  api.clearActivityStats = async () => ({ success: true })

  api.openFileDialog = async () => ({ canceled: true, filePaths: [] })
  api.openAudioFileDialog = async () => ({ canceled: true, filePaths: [] })
  api.getFilePath = (file: File) => file?.name || ''
  api.getDefaultLiteraturePath = async () => ''
  api.openLiteratureUrl = async (url: string) => {
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      return { success: true }
    } catch {
      return { success: false, message: '无法打开链接' }
    }
  }

  // --- 移动端本地文献（浏览器选 PDF，字节存入 IndexedDB，应用内阅读器打开） ---
  api.listLiterature = async () => literatureMetaList()

  api.chooseLiteratureFile = async () => {
    const picked = await pickBrowserFile('.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    if (!picked) return { canceled: true, message: '已取消选择文件' }
    try {
      const bytes = await picked.file.arrayBuffer()
      const extension = picked.file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf'
      let contentText = ''
      if (extension === 'docx') {
        contentText = await extractDocxTextFromBytes(bytes)
      }
      const rows = await literatureMetaList()
      const id = Math.max(100000, ...rows.map(item => item.id + 1))
      const title = picked.file.name.replace(/\.(pdf|docx)$/i, '').trim() || '未命名文献'
      const item: MobileLiteratureMeta = {
        id,
        title,
        authors: '',
        year: '',
        source: picked.file.name,
        abstract: contentText.slice(0, 1200),
        content_text: contentText,
        file_path: picked.file.name,
        file_type: extension,
        created_at: new Date().toISOString(),
        size: bytes.byteLength
      }
      await putLiteratureBytes(id, bytes)
      rows.unshift(item)
      await saveLiteratureMetaList(rows)
      return { success: true, item }
    } catch (error) {
      return { success: false, message: (error as Error).message || '文件导入失败' }
    }
  }

  api.readLiteratureFile = async (id: number) => {
    const bytes = await getLiteratureBytes(Number(id))
    if (!bytes) throw new Error('本地文献不存在或已被移除')
    return new Uint8Array(bytes)
  }

  api.deleteLiterature = async (id: number) => {
    const rows = await literatureMetaList()
    const filtered = rows.filter(item => Number(item.id) !== Number(id))
    if (filtered.length === rows.length) return { success: false, message: '未找到文献' }
    await deleteLiteratureBytes(Number(id)).catch(() => undefined)
    await saveLiteratureMetaList(filtered)
    return { success: true }
  }

  api.chooseLiteratureDirectory = async () => result('浏览器版本无法选择文件夹，请直接点击“打开文件”选择本地 PDF。')
  api.setLiteratureAutoImportWatch = async () => ({ success: false, message: '浏览器版本不支持自动扫描文件夹。' })
  api.showLiteratureInFolder = async () => ({ success: false, message: '浏览器版本没有本地文件夹位置。' })
  api.renameLiteratureFile = async () => ({ success: false, message: '浏览器版本不支持重命名本地文件。' })

  // --- 移动端真题合集（浏览器 sql.js 库 + IndexedDB 字节存储） ---
  const EXAM_ACCEPT = '.pdf,application/pdf,.mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*'

  api.pickCollectionPdfs = async () => {
    const files = await pickBrowserFiles(EXAM_ACCEPT)
    if (!files.length) return { success: true, canceled: true, filePaths: [] }
    const filePaths = stageExamFiles(files)
    return { success: true, canceled: false, filePaths }
  }
  api.pickCollectionPdfFolder = async () => ({
    success: true, canceled: true, folderPath: '', filePaths: [], warnings: [], truncated: false,
    message: '浏览器版本无法选择文件夹，请直接选择 PDF 与听力文件。'
  })
  api.pickCollectionAudio = async () => {
    const files = await pickBrowserFiles('.mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*')
    const file = files[0]
    if (!file) return { success: true, canceled: true, filePath: '' }
    return { success: true, canceled: false, filePath: stageExamFiles([file])[0] }
  }
  api.pickCollectionAudioFiles = async () => {
    const files = await pickBrowserFiles('.mp3,.wav,.m4a,.aac,.ogg,.flac,audio/*')
    if (!files.length) return { success: true, canceled: true, filePaths: [] }
    return { success: true, canceled: false, filePaths: stageExamFiles(files) }
  }

  api.analyzeCollectionPdf = (filePath: string) => examImport.analyzePdf(filePath)
  api.analyzeCollectionAudio = (filePath: string) => examImport.analyzeAudio(filePath)
  api.saveCollectionPdfImport = (payload: any) => examImport.savePdfImport(payload)
  api.saveCollectionAudioImport = (payload: any) => examImport.saveAudioImport(payload)
  api.importCollectionAudio = (payload: any) => examImport.importCollectionAudio(payload)

  api.getExamCollections = async () => ({ success: true, collections: await examImport.listCollections() })
  api.getExamCollection = async (id: number) => {
    const collection = await examImport.getCollection(Number(id))
    return collection ? { success: true, collection } : { success: false, message: '真题合集不存在' }
  }
  api.getPendingAnalyses = async () => ({ success: true, pending: await examImport.listPendingAnalyses() })
  api.reorderExamCollections = async (payload: { collectionIds: number[] }) => {
    const collections = await examImport.reorderCollections(payload.collectionIds)
    return { success: true, collections, message: '真题顺序已保存' }
  }
  api.bindPendingAnalysis = (payload: any) => examImport.bindPendingAnalysis(payload)
  api.discardPendingAnalysis = (pendingId: number) => examImport.discardPendingAnalysis(Number(pendingId))
  api.updateExamCollectionMetadata = (payload: any) => examImport.updateCollectionMetadata(payload)
  api.deleteExamCollection = (collectionId: number) => examImport.deleteCollection(Number(collectionId))
  api.showCollectionSource = async () => ({ success: false, message: '浏览器版本没有本地文件位置，无法在文件夹中显示。' })
  api.getCollectionAudioData = (payload: any) => examImport.getCollectionAudioData(payload)
  api.removeCollectionAudio = (payload: any) => examImport.removeCollectionAudio(payload)
  api.readCollectionSourcePdf = async (filePath: string) => {
    const record = await examImport.readExamFileBytes(String(filePath))
    if (!record) return { success: false, message: '原 PDF 文件不存在' }
    return { success: true, data: new Uint8Array(record.bytes) }
  }
  api.extractExamSegmentText = async (payload: any) => {
    try {
      const text = await examImport.extractSegmentText(String(payload.filePath), Number(payload.pageNo), payload.rects || [])
      return { success: true, text }
    } catch (error) {
      return { success: false, message: (error as Error).message }
    }
  }

  api.createManualExamSegment = (payload: any) => examImport.createManualSegment(payload)
  api.updateExamSegment = (payload: any) => examImport.updateSegment(payload)
  api.deleteExamSegment = (segmentId: number) => examImport.deleteSegment(Number(segmentId))

  api.getExamAnnotations = (scopeKey: string) => examImport.listAnnotations(String(scopeKey))
  api.addExamAnnotation = (payload: any) => examImport.addAnnotation(payload)
  api.updateExamAnnotationGeometry = (payload: any) => examImport.updateAnnotationGeometry(payload)
  api.deleteExamAnnotation = (id: number) => examImport.deleteAnnotation(Number(id))

  return api
}

function fallbackFor(name: string): (...args: any[]) => any {
  if (name.startsWith('on')) return () => () => {}
  if (/Count$/i.test(name)) return async () => 0
  if (/^get/i.test(name)) return async () => []
  if (/^(select|pick|choose|read|scan|analyze)/i.test(name)) return async () => result()
  if (/^(install|download)/i.test(name)) return async () => ({ success: false, message: '该功能在移动版中暂不可用' })
  if (/^(delete|remove|save|update|set|add|record|touch|reorder|bind|discard|begin|finish|complete|reset|clear|import)/i.test(name)) {
    return async () => ({ success: true })
  }
  return async () => null
}

export function installMobileBridge(): void {
  if (typeof window === 'undefined' || window.cet4Api) return
  const api = createApi()
  const proxy = new Proxy(api, {
    get(target, property) {
      if (property in target) return target[property as string]
      if (typeof property !== 'string') return undefined
      const fallback = fallbackFor(property)
      target[property] = fallback
      return fallback
    }
  })
  Object.defineProperty(window, 'cet4Api', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: proxy
  })
}
