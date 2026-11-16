import packageJson from '../../package.json'
import cet4Core from '../../resources/wordbooks/cet4-core.json'

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
  sessions: 'vocflow.mobile.sessions.v1'
} as const

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
  api.fetchTtsAudio = async () => ({ success: false, message: '请使用浏览器在线发音' })
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
