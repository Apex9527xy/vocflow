import type { IpcMain } from 'electron'

interface DictionaryResult {
  word: string
  query: string
  phonetic_us: string
  phonetic_uk: string
  meaning_cn: string
  pos: string
  example_sentence: string
  lemma: string
  exam_types: string[]
  etymology: string
  source: string
}

const cache = new Map<string, DictionaryResult>()
const MAX_CACHE_SIZE = 300

function cleanText(value: unknown): string {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join('；')
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function formatPhone(value: unknown): string {
  const phone = cleanText(value).replace(/^\/|\/$/g, '')
  return phone ? `/${phone}/` : ''
}

function collectEcMeanings(wordInfo: any): string[] {
  const meanings: string[] = []
  for (const group of Array.isArray(wordInfo?.trs) ? wordInfo.trs : []) {
    for (const item of Array.isArray(group?.tr) ? group.tr : []) {
      const text = cleanText(item?.l?.i)
      if (text) meanings.push(text)
    }
  }
  return [...new Set(meanings)]
}

function collectWebMeanings(payload: any): string[] {
  const groups = payload?.web_trans?.['web-translation']
  if (!Array.isArray(groups)) return []
  const values: string[] = []
  for (const group of groups.slice(0, 2)) {
    for (const item of Array.isArray(group?.trans) ? group.trans : []) {
      const text = cleanText(item?.value)
      if (text) values.push(text)
    }
  }
  return [...new Set(values)].slice(0, 6)
}

function collectEtymology(payload: any): string {
  const groups = payload?.etym?.etyms
  const zh = Array.isArray(groups?.zh) ? groups.zh[0]?.value : ''
  const en = Array.isArray(groups?.en) ? groups.en[0]?.value : ''
  const text = cleanText(zh || en)
  return text.length > 900 ? `${text.slice(0, 900).trimEnd()}…` : text
}

function normalizeYoudao(payload: any, query: string): DictionaryResult | null {
  const ec = payload?.ec
  const wordInfo = Array.isArray(ec?.word) ? ec.word[0] : null
  const simpleInfo = Array.isArray(payload?.simple?.word) ? payload.simple.word[0] : null
  const meaningParts = collectEcMeanings(wordInfo)
  const fallbackMeanings = meaningParts.length ? meaningParts : collectWebMeanings(payload)
  if (!fallbackMeanings.length) return null

  const sentencePair = payload?.blng_sents_part?.['sentence-pair']
  const firstPair = Array.isArray(sentencePair) ? sentencePair[0] : null
  const exampleEn = cleanText(firstPair?.sentence)
  const exampleCn = cleanText(firstPair?.['sentence-translation'])
  const example = exampleEn
    ? exampleCn ? `${exampleEn}\n${exampleCn}` : exampleEn
    : ''

  const headword = cleanText(wordInfo?.["return-phrase"]?.l?.i) || query
  const firstMeaning = fallbackMeanings[0] || ''
  const posMatch = firstMeaning.match(/^((?:n|v|vt|vi|adj|adv|prep|pron|conj|num|art|int)\.)\s*/i)

  return {
    word: headword,
    query,
    phonetic_us: formatPhone(wordInfo?.usphone || simpleInfo?.usphone),
    phonetic_uk: formatPhone(wordInfo?.ukphone || simpleInfo?.ukphone),
    meaning_cn: fallbackMeanings.join('\n'),
    pos: posMatch?.[1] || '',
    example_sentence: example,
    lemma: cleanText(wordInfo?.prototype),
    exam_types: Array.isArray(ec?.exam_type) ? ec.exam_type.map(cleanText).filter(Boolean) : [],
    etymology: collectEtymology(payload),
    source: '有道词典'
  }
}

export function registerDictionaryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('dictionary:lookup', async (_event, rawWord: string) => {
    const query = String(rawWord || '').trim().toLowerCase()
    if (!/^[a-z][a-z'’-]{0,48}$/.test(query)) return null
    if (cache.has(query)) return cache.get(query)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6500)
    try {
      const url = `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(query)}&doctype=json`
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 CET4-Coach/0.2'
        },
        signal: controller.signal
      })
      if (!response.ok) return null
      const payload = await response.json()
      const result = normalizeYoudao(payload, query)
      if (!result) return null

      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value
        if (oldestKey) cache.delete(oldestKey)
      }
      cache.set(query, result)
      return result
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })
}
