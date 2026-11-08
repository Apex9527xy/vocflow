import { analyzeClauseTree, type NestedClauseAnalysis } from './clauseAnalysis'
import { getLemmaCandidates } from './morphology'
import { buildSentenceTree, type SentenceTreeAnalysis } from './sentenceTree'

export interface DictionaryEntry {
  pos?: string
  meaning_cn?: string
}

export type WordKind =
  | 'noun' | 'pronoun' | 'verb' | 'auxiliary' | 'modal' | 'adjective'
  | 'adverb' | 'preposition' | 'conjunction' | 'determiner' | 'number'
  | 'punctuation' | 'unknown'

export type SentenceRole = 'subject' | 'predicate' | 'object' | 'complement' | 'adverbial' | 'modifier' | 'other'

export interface SentenceToken {
  text: string
  normalized: string
  kind: WordKind
  role: SentenceRole
  start: number
  end: number
}

export interface SentenceComponent {
  role: SentenceRole
  label: string
  text: string
  head: string
  note: string
}

export interface ModifierLink {
  modifier: string
  target: string
  relation: string
}

export interface SentenceChunk {
  id: string
  text: string
  label: string
  role: SentenceRole
  note: string
}

export interface ChunkDependency {
  fromId: string
  toId: string
  relation: string
}

export interface SentenceAnalysis {
  text: string
  sentenceType: string
  pattern: string
  complexity: string
  tokens: SentenceToken[]
  components: SentenceComponent[]
  modifiers: ModifierLink[]
  chunks: SentenceChunk[]
  dependencies: ChunkDependency[]
  clauses: NestedClauseAnalysis[]
  tree: SentenceTreeAnalysis
  notes: string[]
}

export interface AnalyzeSentenceOptions {
  detectNestedClauses?: boolean
}

const PRONOUNS = new Set([
  'i', 'me', 'you', 'he', 'him', 'she', 'her', 'it', 'we', 'us', 'they', 'them',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what',
  'someone', 'somebody', 'anyone', 'anybody', 'everyone', 'everybody', 'nobody',
  'something', 'anything', 'everything', 'nothing', 'none'
])

const DETERMINERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'some', 'any', 'no', 'every', 'each', 'another', 'either', 'neither',
  'many', 'much', 'few', 'little', 'several', 'all', 'both', 'such'
])

const PREPOSITIONS = new Set([
  'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'as',
  'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'by',
  'despite', 'during', 'except', 'for', 'from', 'in', 'inside', 'into', 'like',
  'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'since',
  'through', 'throughout', 'to', 'toward', 'towards', 'under', 'until', 'up', 'upon',
  'with', 'within', 'without'
])

const CONJUNCTIONS = new Set([
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'although', 'though', 'while',
  'if', 'unless', 'when', 'whenever', 'where', 'whereas', 'whether', 'that', 'than',
  'since', 'as', 'once', 'after', 'before', 'until'
])

const SUBORDINATORS = new Set(['because', 'although', 'though', 'while', 'if', 'unless', 'when', 'whenever', 'whereas', 'whether', 'since', 'once'])

const AUXILIARIES = new Set([
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'done', 'doing'
])

const MODALS = new Set(['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'ought'])
const COMMON_VERBS = new Set([
  'accept', 'achieve', 'add', 'agree', 'allow', 'answer', 'appear', 'ask', 'become',
  'begin', 'believe', 'belong', 'break', 'bring', 'build', 'buy', 'call', 'carry',
  'change', 'choose', 'come', 'continue', 'create', 'decide', 'develop', 'die', 'do',
  'drink', 'drive', 'eat', 'enjoy', 'explain', 'fall', 'feel', 'find', 'finish', 'follow',
  'get', 'give', 'go', 'grow', 'happen', 'have', 'hear', 'help', 'hold', 'hope', 'include',
  'keep', 'know', 'learn', 'leave', 'let', 'like', 'live', 'look', 'love', 'make', 'mean',
  'meet', 'move', 'need', 'offer', 'open', 'pass', 'pay', 'play', 'prefer', 'produce',
  'provide', 'put', 'read', 'remember', 'require', 'run', 'say', 'see', 'seem', 'sell',
  'send', 'show', 'sit', 'sleep', 'speak', 'spend', 'stand', 'start', 'stay', 'study',
  'suggest', 'take', 'talk', 'teach', 'tell', 'think', 'travel', 'try', 'turn', 'understand',
  'use', 'wait', 'walk', 'want', 'watch', 'wear', 'work', 'write', 'fly', 'flies'
])

const IRREGULAR_VERBS = new Set([
  'said', 'made', 'went', 'gone', 'came', 'took', 'taken', 'gave', 'given', 'saw', 'seen',
  'knew', 'known', 'thought', 'bought', 'brought', 'found', 'left', 'felt', 'kept', 'met',
  'paid', 'ran', 'spoke', 'spoken', 'wrote', 'written', 'read', 'heard', 'held', 'stood',
  'taught', 'told', 'understood', 'wore', 'worn', 'chose', 'chosen', 'began', 'begun', 'built', 'spent', 'sent', 'lost', 'won', 'sat', 'slept', 'drawn', 'shown',
  'broke', 'broken', 'grew', 'grown', 'fell', 'fallen', 'drove', 'driven', 'ate', 'eaten',
  'rang', 'sang', 'drank', 'swam', 'rose', 'rode', 'threw', 'flew', 'flown', 'blew', 'knew', 'drew', 'grew', 'flew',
  'hid', 'bit', 'stole', 'shook', 'tore', 'woke', 'forgot', 'forgave', 'mistook', 'overcame'
])

const ADVERBS = new Set([
  'very', 'really', 'quite', 'rather', 'too', 'also', 'often', 'always', 'usually',
  'sometimes', 'never', 'already', 'still', 'just', 'soon', 'later', 'now', 'then',
  'today', 'tomorrow', 'yesterday', 'here', 'there', 'everywhere', 'however',
  'therefore', 'instead', 'finally', 'first', 'last', 'again', 'once', 'twice',
  'carefully', 'quickly', 'slowly', 'clearly', 'probably', 'perhaps', 'almost',
  'nearly', 'hardly', 'only', 'even', 'well', 'badly', 'together', 'alone', 'please'
])

const LINKING_VERBS = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'become', 'became', 'seem', 'seemed', 'remain', 'remained', 'feel', 'felt', 'look', 'looked', 'stay', 'stayed', 'grow', 'grew', 'turn', 'turned'])
const COMMON_NOUNS = new Set([
  'student', 'teacher', 'school', 'book', 'desk', 'table', 'chair', 'room', 'house',
  'home', 'family', 'father', 'mother', 'parent', 'child', 'people', 'person', 'man', 'bird', 'birds',
  'woman', 'boy', 'girl', 'friend', 'city', 'country', 'world', 'time', 'day', 'year',
  'morning', 'evening', 'night', 'hand', 'head', 'eye', 'water', 'food', 'life',
  'problem', 'question', 'idea', 'story', 'language', 'english', 'garden', 'flower',
  'door', 'window', 'car', 'road', 'money', 'business', 'government', 'company',
  'group', 'part', 'place', 'way', 'thing', 'college', 'university', 'history', 'essay', 'challenge', 'minute', 'minutes', 'hour', 'hours', 'month', 'months'
])

const COMMON_ADJECTIVES = new Set([
  'interesting', 'interested', 'important', 'difficult', 'beautiful', 'happy', 'sad',
  'good', 'bad', 'new', 'old', 'young', 'great', 'large', 'small', 'different',
  'similar', 'possible', 'impossible', 'necessary', 'hard', 'easy', 'main', 'certain',
  'able', 'available', 'famous', 'popular', 'serious', 'successful', 'useful', 'helpful',
  'careful', 'clear', 'special', 'common', 'natural', 'social', 'modern', 'public', 'short', 'big', 'small', 'long', 'tall', 'large', 'little'
])
const BE_FORMS = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'])
const PASSIVE_PARTICIPLES = new Set([
  'built', 'made', 'done', 'written', 'spoken', 'taken', 'given', 'seen', 'known',
  'bought', 'brought', 'found', 'left', 'kept', 'sent', 'spent', 'lost', 'won',
  'taught', 'told', 'shown', 'drawn', 'eaten', 'driven', 'chosen', 'broken', 'grown'
])
const REPORTING_VERBS = new Set(['say', 'said', 'tell', 'told', 'think', 'thought', 'know', 'knew', 'believe', 'believed', 'expect', 'expected', 'hope', 'hoped', 'wish', 'wished', 'suggest', 'suggested', 'explain', 'explained', 'wonder', 'wondered', 'ask', 'asked'])
const TERMINAL_PUNCTUATION = new Set(['.', '!', '?'])
const CLAUSE_PUNCTUATION = new Set([',', ';', ':'])

function classifyByPos(pos: string): WordKind | null {
  const value = pos.toLowerCase()
  if (value.includes('pron')) return 'pronoun'
  if (value.includes('prep')) return 'preposition'
  if (value.includes('conj')) return 'conjunction'
  if (value.includes('adj')) return 'adjective'
  if (value.includes('adv')) return 'adverb'
  if (value.includes('num')) return 'number'
  if (value.includes('art') || value.includes('det')) return 'determiner'
  if (/(^|[/\s])v(?:t|i)?\.?(?=$|[/\s])/.test(value) || value === 'v') return 'verb'
  if (/(^|[/\s])n\.?(?=$|[/\s])/.test(value) || value === 'n') return 'noun'
  return null
}

function classifyWord(word: string, dictionary: Map<string, DictionaryEntry>): WordKind {
  const lower = word.toLowerCase().replace(/[’]/g, "'")
  if (MODALS.has(lower)) return 'modal'
  if (AUXILIARIES.has(lower)) return 'auxiliary'
  if (DETERMINERS.has(lower)) return 'determiner'
  if (PREPOSITIONS.has(lower)) return 'preposition'
  if (CONJUNCTIONS.has(lower)) return 'conjunction'
  if (PRONOUNS.has(lower)) return 'pronoun'
  if (ADVERBS.has(lower)) return 'adverb'
  if (COMMON_VERBS.has(lower) || IRREGULAR_VERBS.has(lower) || LINKING_VERBS.has(lower)) return 'verb'
  if (COMMON_ADJECTIVES.has(lower)) return 'adjective'
  if (COMMON_NOUNS.has(lower)) return 'noun'

  for (const candidate of getLemmaCandidates(lower)) {
    const entry = dictionary.get(candidate)
    if (entry?.pos || entry?.meaning_cn) {
      const combinedPos = `${entry.pos || ''} ${entry.meaning_cn || ''}`
      if (/(?:s|ed|ing)$/i.test(lower) && /v\.|(?:^|[/\s])v(?:t|i)?\.?/i.test(combinedPos)) return 'verb'
      const kind = classifyByPos(combinedPos)
      if (kind) return kind
    }
    if (MODALS.has(candidate)) return 'modal'
    if (AUXILIARIES.has(candidate)) return 'auxiliary'
    if (COMMON_ADJECTIVES.has(candidate)) return 'adjective'
    if (COMMON_NOUNS.has(candidate)) return 'noun'
    if (COMMON_VERBS.has(candidate) || IRREGULAR_VERBS.has(candidate) || LINKING_VERBS.has(candidate)) return 'verb'
  }

  if (/^\d+(?:[.,]\d+)?$/.test(lower)) return 'number'
  if (/ly$/.test(lower) && lower.length > 4) return 'adverb'
  if (/(ous|ful|less|able|ible|ive|ical|ic|ary|ory|ant|ent|ish|like)$/.test(lower) && lower.length > 5) return 'adjective'
  if (/(tion|sion|ment|ness|ity|ship|hood|dom|ism|ance|ence|age|er|or|ist|ian|ant|ent|ure|ture)$/.test(lower) && lower.length > 4) return 'noun'
  if (/(ize|ise|ify)$/.test(lower) && lower.length > 5) return 'verb'
  if (/(ed|ing|s)$/.test(lower) && lower.length > 4) return 'verb'
  return 'unknown'
}

function tokenize(text: string): SentenceToken[] {
  const pattern = /[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:[.,]\d+)*|[^\sA-Za-z0-9]/g
  return Array.from(text.matchAll(pattern), match => {
    const token = match[0]
    const isPunctuation = !/[A-Za-z0-9]/.test(token)
    return {
      text: token,
      normalized: token.toLowerCase().replace(/[’]/g, "'"),
      kind: isPunctuation ? 'punctuation' : 'unknown',
      role: 'other',
      start: match.index,
      end: match.index + token.length
    }
  })
}

function fillWordKinds(tokens: SentenceToken[], dictionary: Map<string, DictionaryEntry>): void {
  for (const token of tokens) {
    if (token.kind !== 'punctuation') token.kind = classifyWord(token.text, dictionary)
  }
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].normalized !== 'like') continue
    const previousWord = [...tokens.slice(0, index)].reverse().find(token => token.kind !== 'punctuation')
    const nextWord = tokens.slice(index + 1).find(token => token.kind !== 'punctuation')
    const followsSubject = previousWord && ['noun', 'pronoun', 'determiner', 'adjective'].includes(previousWord.kind)
    tokens[index].kind = followsSubject && nextWord ? 'verb' : 'preposition'
  }
}

function isNominal(kind: WordKind): boolean {
  return ['noun', 'pronoun', 'determiner', 'adjective', 'number', 'unknown'].includes(kind)
}

function joinTokens(tokens: SentenceToken[], indices: number[]): string {
  return indices.map(index => tokens[index].text).join(' ').replace(/\s+([,.;:!?])/g, '$1').trim()
}

function findHead(tokens: SentenceToken[], indices: number[]): number {
  for (let i = indices.length - 1; i >= 0; i -= 1) {
    const kind = tokens[indices[i]].kind
    if (['noun', 'pronoun', 'number', 'adjective'].includes(kind)) return indices[i]
  }
  for (let i = indices.length - 1; i >= 0; i -= 1) {
    if (!['determiner', 'preposition', 'conjunction', 'punctuation'].includes(tokens[indices[i]].kind)) return indices[i]
  }
  return indices[indices.length - 1] ?? -1
}

function prepositionRelation(preposition: string): string {
  const lower = preposition.toLowerCase()
  if (['in', 'on', 'at', 'during', 'before', 'after', 'until', 'since', 'between'].includes(lower)) return '时间/地点状语'
  if (['by', 'with', 'through'].includes(lower)) return '方式状语'
  if (['to', 'for', 'toward', 'towards', 'about'].includes(lower)) return '对象/方向状语'
  if (['because', 'due', 'owing'].includes(lower)) return '原因状语'
  if (['under', 'over', 'above', 'below', 'behind', 'near'].includes(lower)) return '地点状语'
  return '介词短语状语'
}

export function splitEnglishSentences(text: string): string[] {
  const normalized = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim()
  if (!normalized) return []
  const parts = normalized.match(/[^.!?]+[.!?]+(?:["'”’)]*)|[^.!?]+$/g) || []
  const sentences: string[] = []
  for (const part of parts) {
    const value = part.replace(/\s+/g, ' ').trim()
    if (!value) continue
    const previous = sentences[sentences.length - 1]
    if (previous && /\b(?:mr|mrs|ms|dr|prof|etc|e\.g|i\.e)\.$/i.test(previous)) {
      sentences[sentences.length - 1] = `${previous} ${value}`
    } else {
      sentences.push(value)
    }
  }
  return sentences.slice(0, 8)
}

export function isSentenceSelection(text: string): boolean {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length < 8 || value.length > 3000) return false
  const englishWords = value.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []
  return englishWords.length >= 3 && /[A-Za-z]{2}/.test(value)
}

function splitPhraseGroups(tokens: SentenceToken[], indices: number[]): number[][] {
  const groups: number[][] = []
  let cursor = 0
  const nextWord = (position: number) => indices.slice(position + 1).find(index => tokens[index].kind !== 'punctuation')
  while (cursor < indices.length) {
    let index = indices[cursor]
    if (tokens[index].kind === 'punctuation' || CLAUSE_PUNCTUATION.has(tokens[index].text)) {
      cursor += 1
      continue
    }

    const token = tokens[index]
    const following = nextWord(cursor)
    if (token.normalized === 'to' && following !== undefined && ['verb', 'auxiliary'].includes(tokens[following].kind)) {
      groups.push([index, following])
      cursor = indices.indexOf(following) + 1
      continue
    }

    if (token.kind === 'preposition') {
      const group = [index]
      let position = cursor + 1
      while (position < indices.length) {
        const nextIndex = indices[position]
        const nextToken = tokens[nextIndex]
        if (nextToken.kind === 'punctuation' || CLAUSE_PUNCTUATION.has(nextToken.text)) break
        if (nextToken.kind === 'preposition' || nextToken.kind === 'conjunction') break
        group.push(nextIndex)
        position += 1
      }
      groups.push(group)
      cursor = position
      continue
    }

    if (token.kind === 'adverb') {
      const group = [index]
      let position = cursor + 1
      while (position < indices.length && tokens[indices[position]].kind === 'adverb') {
        group.push(indices[position])
        position += 1
      }
      groups.push(group)
      cursor = position
      continue
    }

    const group = [index]
    let position = cursor + 1
    while (position < indices.length) {
      const nextIndex = indices[position]
      const nextToken = tokens[nextIndex]
      if (nextToken.kind === 'punctuation' || CLAUSE_PUNCTUATION.has(nextToken.text)) break
      if (nextToken.kind === 'preposition' || nextToken.kind === 'conjunction' || nextToken.kind === 'adverb') break
      if (nextToken.normalized === 'to') {
        const afterTo = indices.slice(position + 1).find(value => tokens[value].kind !== 'punctuation')
        if (afterTo !== undefined && ['verb', 'auxiliary'].includes(tokens[afterTo].kind)) break
      }
      if (group.length && nextToken.kind === 'determiner') {
        const hasNominal = group.some(value => ['noun', 'pronoun', 'number', 'adjective', 'unknown'].includes(tokens[value].kind))
        if (hasNominal) break
      }
      group.push(nextIndex)
      position += 1
    }
    groups.push(group)
    cursor = position
  }
  return groups
}

function isFinitePredicateToken(tokens: SentenceToken[], index: number): boolean {
  const token = tokens[index]
  if (!token || !['verb', 'auxiliary', 'modal'].includes(token.kind)) return false
  if (/ing$/i.test(token.normalized)) return false
  const previous = [...tokens.slice(0, index)].reverse().find(item => item.kind !== 'punctuation')
  if (/(?:ed|en)$/i.test(token.normalized) && previous && ['auxiliary', 'modal'].includes(previous.kind)) return false
  return true
}

export function analyzeSentence(text: string, dictionary: Map<string, DictionaryEntry>, options: AnalyzeSentenceOptions = {}): SentenceAnalysis {
  const tokens = tokenize(text)
  fillWordKinds(tokens, dictionary)
  const wordIndices = tokens.map((token, index) => ({ token, index })).filter(item => item.token.kind !== 'punctuation').map(item => item.index)
  if (!wordIndices.length) {
    const tree = buildSentenceTree(text, { tokens, components: [], chunks: [], pattern: '—', clauses: [] })
    return { text, sentenceType: '无法判断', pattern: '—', complexity: '—', tokens, components: [], modifiers: [], chunks: [], dependencies: [], clauses: [], tree, notes: [] }
  }

  const firstWordIndex = wordIndices[0]
  const lastWordIndex = wordIndices[wordIndices.length - 1]
  const firstLower = tokens[firstWordIndex].normalized
  const terminalToken = [...tokens].reverse().find(token => TERMINAL_PUNCTUATION.has(token.text))
  const isQuestion = terminalToken?.text === '?'
  const isExclamation = terminalToken?.text === '!' && ['what', 'how'].includes(firstLower)

  let leadingEnd = -1
  let subjectStart = firstWordIndex
  const firstComma = tokens.findIndex((token, index) => index > firstWordIndex && index < lastWordIndex && token.text === ',')
  if (firstComma >= 0 && (SUBORDINATORS.has(firstLower) || PREPOSITIONS.has(firstLower) || ADVERBS.has(firstLower))) {
    leadingEnd = firstComma
    subjectStart = wordIndices.find(index => index > firstComma) ?? firstWordIndex
  } else if (['today', 'tomorrow', 'yesterday', 'now', 'then', 'later', 'usually', 'often', 'sometimes', 'however', 'therefore'].includes(firstLower)) {
    const nextWord = wordIndices.find(index => index > firstWordIndex)
    if (nextWord !== undefined) {
      leadingEnd = firstWordIndex
      subjectStart = nextWord
    }
  }

  let invertedAuxIndex = -1
  let beQuestion = false
  let forcedSubjectIndices: number[] | null = null
  let forcedComplementStart = -1
  if (isQuestion && ['auxiliary', 'modal'].includes(tokens[firstWordIndex].kind)) {
    invertedAuxIndex = firstWordIndex
    const firstAfterAux = wordIndices.find(index => index > firstWordIndex) ?? firstWordIndex
    const laterVerb = wordIndices.find(index => index > firstWordIndex && ['verb', 'auxiliary', 'modal'].includes(tokens[index].kind))
    subjectStart = firstAfterAux
    if (laterVerb === undefined && BE_FORMS.has(firstLower)) {
      beQuestion = true
      let forcedSubjectEnd = firstAfterAux
      for (const index of wordIndices.filter(value => value > firstAfterAux)) {
        if (!isNominal(tokens[index].kind) || tokens[index].kind === 'adjective') break
        forcedSubjectEnd = index
      }
      forcedSubjectIndices = wordIndices.filter(index => index >= firstAfterAux && index <= forcedSubjectEnd)
      forcedComplementStart = wordIndices.find(index => index > forcedSubjectEnd) ?? -1
    }
  }

  const firstVerbAfter = (startIndex: number) => wordIndices.find(index => index >= startIndex && ['verb', 'auxiliary', 'modal'].includes(tokens[index].kind))
  let mainVerbIndex = beQuestion ? invertedAuxIndex : firstVerbAfter(subjectStart) ?? -1
  let subjectRelativeIndex = -1

  if (mainVerbIndex >= 0) {
    const relativeIndex = wordIndices.find(index => index > subjectStart && index < mainVerbIndex && ['who', 'whom', 'whose', 'which', 'that'].includes(tokens[index].normalized))
    if (relativeIndex !== undefined) {
      subjectRelativeIndex = relativeIndex
      const matrixVerb = wordIndices.find(index => index > mainVerbIndex && isFinitePredicateToken(tokens, index))
      if (matrixVerb !== undefined) mainVerbIndex = matrixVerb
    }
  }

  const sentenceType = isQuestion ? '疑问句' : isExclamation ? '感叹句' : mainVerbIndex === firstWordIndex && ['verb', 'auxiliary', 'modal'].includes(tokens[firstWordIndex].kind) ? '祈使句' : '陈述句'

  let predicateStart = mainVerbIndex
  if (mainVerbIndex >= 0) {
    let cursor = wordIndices.indexOf(mainVerbIndex) - 1
    while (cursor >= 0) {
      const index = wordIndices[cursor]
      if (index < subjectStart) break
      if (['auxiliary', 'modal'].includes(tokens[index].kind)) predicateStart = index
      else break
      cursor -= 1
    }
  }

  let predicateEnd = predicateStart
  let lastVerbIndex = mainVerbIndex
  if (mainVerbIndex >= 0) {
    for (const index of wordIndices.filter(value => value > predicateStart)) {
      const token = tokens[index]
      if (['verb', 'auxiliary', 'modal'].includes(token.kind)) {
        lastVerbIndex = index
        predicateEnd = index
        continue
      }
      if (['not', 'never'].includes(token.normalized) || token.kind === 'adverb') {
        const nextVerb = wordIndices.find(value => value > index && ['verb', 'auxiliary', 'modal'].includes(tokens[value].kind))
        if (nextVerb !== undefined) continue
      }
      break
    }
  }

  let subjectEnd = predicateStart > subjectStart ? [...wordIndices].reverse().find(index => index < predicateStart && index >= subjectStart) ?? -1 : -1
  let preAdverbialStart = predicateStart
  if (subjectRelativeIndex < 0) {
    for (const index of [...wordIndices].reverse().filter(value => value >= subjectStart && value < predicateStart)) {
      if (tokens[index].kind === 'adverb') preAdverbialStart = index
      else break
    }
    if (preAdverbialStart < predicateStart) {
      subjectEnd = [...wordIndices].reverse().find(index => index < preAdverbialStart && index >= subjectStart) ?? -1
    }
  }
  const mainVerb = lastVerbIndex >= 0 ? tokens[lastVerbIndex].normalized : ''
  const linking = LINKING_VERBS.has(mainVerb) || AUXILIARIES.has(mainVerb)
  const afterPredicate = wordIndices.find(index => index > predicateEnd)
  let objectStart = -1
  let objectEnd = -1
  let objectIsClause = false

  if (beQuestion && forcedComplementStart >= 0) {
    objectStart = forcedComplementStart
    objectEnd = lastWordIndex
  } else if (afterPredicate !== undefined && predicateEnd >= 0) {
    const firstAfter = tokens[afterPredicate]
    const reportingClause = REPORTING_VERBS.has(mainVerb) && ['that', 'if', 'whether'].includes(firstAfter.normalized)
    if (reportingClause) {
      objectStart = afterPredicate
      objectEnd = lastWordIndex
      objectIsClause = true
    } else if (linking) {
      objectStart = afterPredicate
      objectEnd = lastWordIndex
    } else if (isNominal(firstAfter.kind)) {
      objectStart = afterPredicate
      objectEnd = afterPredicate
      for (const index of wordIndices.filter(value => value > afterPredicate)) {
        const token = tokens[index]
        if (CLAUSE_PUNCTUATION.has(token.text) || TERMINAL_PUNCTUATION.has(token.text)) break
        if (['preposition', 'conjunction', 'adverb'].includes(token.kind)) break
        if (!isNominal(token.kind)) break
        if (objectEnd > afterPredicate && ['who', 'whom', 'whose', 'which', 'that'].includes(token.normalized)) break
        objectEnd = index
      }
    }
  }

  const trailingStart = objectEnd >= 0 ? wordIndices.find(index => index > objectEnd) : afterPredicate
  const componentIndices = (start: number, end: number) => wordIndices.filter(index => index >= start && index <= end && !CLAUSE_PUNCTUATION.has(tokens[index].text))
  const leadingIndices = leadingEnd >= 0 ? componentIndices(firstWordIndex, leadingEnd) : []
  const relativeClauseIndices = subjectRelativeIndex >= 0 && subjectEnd >= 0 ? componentIndices(subjectRelativeIndex, subjectEnd) : []
  const subjectCoreEnd = subjectRelativeIndex >= 0 ? [...wordIndices].reverse().find(index => index < subjectRelativeIndex && index >= subjectStart) ?? -1 : subjectEnd
  const subjectIndices = forcedSubjectIndices ?? (subjectCoreEnd >= 0 ? componentIndices(subjectStart, subjectCoreEnd) : [])
  const basePredicateIndices = predicateStart >= 0 ? componentIndices(predicateStart, predicateEnd) : []
  const predicateIndices = invertedAuxIndex >= 0 ? [...new Set([invertedAuxIndex, ...basePredicateIndices])] : basePredicateIndices
  const passiveDetected = predicateIndices.some(index => BE_FORMS.has(tokens[index].normalized)) && predicateIndices.some(index => isPassiveParticiple(tokens[index].normalized))
  const objectIndices = objectStart >= 0 ? componentIndices(objectStart, objectEnd) : []
  const trailingIndices = trailingStart !== undefined ? componentIndices(trailingStart, lastWordIndex) : []
  const prePredicateAdverbialIndices = preAdverbialStart < predicateStart
    ? wordIndices.filter(index => index >= preAdverbialStart && index < predicateStart)
    : []
  const trailingAdverbialIndices = trailingIndices.filter(index => !objectIndices.includes(index) && !predicateIndices.includes(index) && !subjectIndices.includes(index) && !relativeClauseIndices.includes(index))
  const adverbialIndices = [...new Set([...prePredicateAdverbialIndices, ...trailingAdverbialIndices])]

  for (const index of leadingIndices) tokens[index].role = 'adverbial'
  for (const index of subjectIndices) tokens[index].role = 'subject'
  for (const index of relativeClauseIndices) tokens[index].role = 'modifier'
  for (const index of predicateIndices) tokens[index].role = 'predicate'
  for (const index of objectIndices) tokens[index].role = beQuestion || linking ? 'complement' : 'object'
  for (const index of adverbialIndices) tokens[index].role = 'adverbial'

  const components: SentenceComponent[] = []
  if (leadingIndices.length) {
    components.push({ role: 'adverbial', label: '前置状语', text: joinTokens(tokens, leadingIndices), head: '', note: '说明时间、条件、原因或背景' })
  }
  let subjectHead = ''
  if (subjectIndices.length) {
    const headIndex = findHead(tokens, subjectIndices)
    subjectHead = headIndex >= 0 ? tokens[headIndex].text : ''
    const subjectNote = relativeClauseIndices.length
      ? `核心词：${subjectHead}；其后含定语从句`
      : headIndex >= 0 ? `核心词：${subjectHead}` : ''
    components.push({ role: 'subject', label: '主语', text: joinTokens(tokens, subjectIndices), head: subjectHead, note: subjectNote })
  } else if (sentenceType === '祈使句') {
    components.push({ role: 'subject', label: '主语', text: '（省略：you）', head: 'you', note: '祈使句通常省略主语' })
  } else {
    components.push({ role: 'subject', label: '主语', text: '（未明确）', head: '', note: '可能为倒装句、省略句或复杂从句' })
  }
  if (relativeClauseIndices.length) {
    components.push({
      role: 'modifier',
      label: '定语从句',
      text: joinTokens(tokens, relativeClauseIndices),
      head: subjectHead,
      note: `${subjectHead ? `修饰 ${subjectHead}` : '修饰前面的名词'}`
    })
  }
  if (predicateIndices.length) {
    const predicateNote = invertedAuxIndex >= 0
      ? `助动词 ${tokens[invertedAuxIndex].text} 前置，构成疑问句`
      : `核心动词：${mainVerb}`
    components.push({ role: 'predicate', label: '谓语', text: joinTokens(tokens, predicateIndices), head: mainVerb, note: predicateNote })
  }
  if (objectIndices.length) {
    const headIndex = findHead(tokens, objectIndices)
    const complementLike = linking || beQuestion
    components.push({
      role: complementLike ? 'complement' : 'object',
      label: complementLike ? '表语' : objectIsClause ? '宾语从句' : '宾语',
      text: joinTokens(tokens, objectIndices),
      head: headIndex >= 0 ? tokens[headIndex].text : '',
      note: objectIsClause ? '由 that/if/whether 引导' : headIndex >= 0 ? `核心词：${tokens[headIndex].text}` : ''
    })
  }
  if (prePredicateAdverbialIndices.length) {
    components.push({ role: 'adverbial', label: '谓语前状语', text: joinTokens(tokens, prePredicateAdverbialIndices), head: '', note: '位于谓语前，修饰动作或说明说话人的态度' })
  }
  if (trailingAdverbialIndices.length) {
    components.push({ role: 'adverbial', label: '状语', text: joinTokens(tokens, trailingAdverbialIndices), head: '', note: '修饰谓语，说明时间、地点、方式、原因或对象' })
  }

  const modifiers: ModifierLink[] = []
  const addNominalModifiers = (indices: number[], label: string) => {
    if (!indices.length) return
    const firstPrepositionPosition = indices.findIndex(index => tokens[index].kind === 'preposition')
    const coreIndices = firstPrepositionPosition >= 0 ? indices.slice(0, firstPrepositionPosition) : indices
    const headIndex = findHead(tokens, coreIndices)
    if (headIndex < 0) return
    const head = tokens[headIndex].text
    for (const index of coreIndices) {
      if (index >= headIndex) break
      const token = tokens[index]
      if (token.kind === 'punctuation') continue
      const relation = token.kind === 'determiner' ? '限定词，限定名词' : token.kind === 'adverb' ? '程度修饰' : `${label}中的前置修饰，修饰名词`
      modifiers.push({ modifier: token.text, target: head, relation })
    }
    if (firstPrepositionPosition >= 0 && coreIndices.length) {
      const postModifier = joinTokens(tokens, indices.slice(firstPrepositionPosition))
      if (postModifier) modifiers.push({ modifier: postModifier, target: head, relation: '后置修饰，说明名词的位置、范围或特征' })
    }
  }
  addNominalModifiers(subjectIndices, '主语')
  if (relativeClauseIndices.length && subjectHead) {
    modifiers.push({
      modifier: joinTokens(tokens, relativeClauseIndices),
      target: subjectHead,
      relation: '定语从句，修饰前面的名词'
    })
  }
  if (!objectIsClause) addNominalModifiers(objectIndices, linking ? '表语' : '宾语')
  if (linking && objectIndices.length && tokens[objectIndices[0]].kind === 'preposition') {
    modifiers.push({ modifier: joinTokens(tokens, objectIndices), target: mainVerb, relation: '表语/地点状语，说明主语的状态或位置' })
  }

  if (mainVerb) {
    for (const index of prePredicateAdverbialIndices) {
      if (tokens[index].kind === 'adverb') modifiers.push({ modifier: tokens[index].text, target: mainVerb, relation: '状语，位于谓语前并修饰动作' })
    }
    for (const index of trailingIndices) {
      if (tokens[index].kind === 'adverb') modifiers.push({ modifier: tokens[index].text, target: mainVerb, relation: '状语，修饰动作' })
    }
    const phraseTokens = trailingIndices.filter(index => !CLAUSE_PUNCTUATION.has(tokens[index].text))
    const nonAdverbPhrase = phraseTokens.filter(index => tokens[index].kind !== 'adverb')
    if (nonAdverbPhrase.length && !nonAdverbPhrase.some(index => tokens[index].kind === 'preposition')) {
      modifiers.push({ modifier: joinTokens(tokens, nonAdverbPhrase), target: mainVerb, relation: '状语，说明动作的时间/地点/方式/对象' })
    }
    for (const index of phraseTokens) {
      if (tokens[index].kind !== 'preposition') continue
      const phraseStart = phraseTokens.indexOf(index)
      const followingBoundary = phraseTokens.slice(phraseStart + 1).find(value => ['preposition', 'adverb', 'conjunction'].includes(tokens[value].kind))
      const phrase = followingBoundary !== undefined ? phraseTokens.slice(phraseStart, phraseTokens.indexOf(followingBoundary)) : phraseTokens.slice(phraseStart)
      const phraseText = joinTokens(tokens, phrase)
      if (!modifiers.some(link => link.modifier === phraseText && link.target === mainVerb)) {
        modifiers.push({ modifier: phraseText, target: mainVerb, relation: passiveDetected && tokens[index].normalized === 'by' ? '施动者状语，说明动作是谁做的' : prepositionRelation(tokens[index].text) })
      }
    }
    if (leadingIndices.length) modifiers.push({ modifier: joinTokens(tokens, leadingIndices), target: mainVerb, relation: '前置状语，说明背景/时间/条件' })
  }

  const chunks: SentenceChunk[] = []
  const dependencies: ChunkDependency[] = []
  let chunkSequence = 0
  const createChunk = (indices: number[], role: SentenceRole, label: string, note = ''): SentenceChunk | null => {
    const text = joinTokens(tokens, indices)
    if (!text) return null
    const chunk: SentenceChunk = { id: `chunk-${++chunkSequence}`, text, label, role, note }
    chunks.push(chunk)
    return chunk
  }

  const leadingChunk = leadingIndices.length ? createChunk(leadingIndices, 'adverbial', '背景/范围状语') : null
  const subjectChunk = subjectIndices.length ? createChunk(subjectIndices, 'subject', '主语') : null
  const preAdverbChunk = prePredicateAdverbialIndices.length ? createChunk(prePredicateAdverbialIndices, 'adverbial', '谓语前状语') : null
  const relativeChunk = relativeClauseIndices.length ? createChunk(relativeClauseIndices, 'modifier', '定语从句') : null
  const predicateChunk = predicateIndices.length ? createChunk(predicateIndices, 'predicate', passiveDetected ? '谓语（被动）' : invertedAuxIndex >= 0 ? '谓语（倒装）' : '谓语') : null

  if (leadingChunk && predicateChunk) dependencies.push({ fromId: leadingChunk.id, toId: predicateChunk.id, relation: '说明背景/范围' })
  if (preAdverbChunk && predicateChunk) dependencies.push({ fromId: preAdverbChunk.id, toId: predicateChunk.id, relation: '修饰动作' })
  if (relativeChunk && subjectChunk) dependencies.push({ fromId: relativeChunk.id, toId: subjectChunk.id, relation: '定语从句，修饰前面的名词' })

  const tailIndices = wordIndices.filter(index => index > predicateEnd && !CLAUSE_PUNCTUATION.has(tokens[index].text))
  let lastVerbPhrase = predicateChunk
  let lastNominal = subjectChunk
  if (predicateChunk && tailIndices.length) {
    const groups = linking || objectIsClause
      ? [tailIndices]
      : splitPhraseGroups(tokens, tailIndices)
    for (const group of groups) {
      if (!group.length) continue
      const first = tokens[group[0]]
      const second = group.length > 1 ? tokens[group[1]] : null
      const isInfinitive = first.normalized === 'to' && second && ['verb', 'auxiliary'].includes(second.kind)
      const isPreposition = first.kind === 'preposition'
      const isNumberPhrase = first.kind === 'number'
      const isPassiveAgent = isPreposition && passiveDetected && first.normalized === 'by'

      let role: SentenceRole = 'object'
      let label = '宾语/补足语'
      if (isInfinitive) {
        role = 'complement'
        label = '不定式'
      } else if (isPreposition) {
        role = lastNominal && !isPassiveAgent ? 'modifier' : 'adverbial'
        label = isPassiveAgent ? '施动者' : lastNominal ? '后置修饰' : '介词短语'
      } else if (isNumberPhrase) {
        role = 'object'
        label = '数量/时间'
      } else if (linking || beQuestion) {
        role = 'complement'
        label = '表语'
      } else if (objectIsClause) {
        role = 'object'
        label = '宾语从句'
      }

      const chunk = createChunk(group, role, label)
      if (!chunk) continue

      if (isInfinitive) {
        if (predicateChunk) dependencies.push({ fromId: chunk.id, toId: predicateChunk.id, relation: '不定式补足，说明做什么' })
        lastVerbPhrase = chunk
      } else if (isPreposition) {
        if (isPassiveAgent && predicateChunk) {
          dependencies.push({ fromId: chunk.id, toId: predicateChunk.id, relation: '施动者，说明动作是谁做的' })
        } else if (lastNominal) {
          const relation = ['of'].includes(first.normalized)
            ? '后置说明，限定前面的名词'
            : ['in', 'on', 'at', 'under', 'near'].includes(first.normalized)
              ? '后置修饰，说明地点/范围'
              : '后置修饰'
          dependencies.push({ fromId: chunk.id, toId: lastNominal.id, relation })
        } else if (lastVerbPhrase) {
          dependencies.push({ fromId: chunk.id, toId: lastVerbPhrase.id, relation: '状语，说明时间/地点/方式' })
        }
        lastNominal = chunk
      } else {
        const target = lastVerbPhrase || predicateChunk
        if (target) {
          const relation = isNumberPhrase
            ? '数量/时间补足'
            : linking || beQuestion
              ? '表语，说明主语的身份或状态'
              : objectIsClause
                ? '宾语从句'
                : lastVerbPhrase && lastVerbPhrase !== predicateChunk
                  ? '不定式宾语'
                  : '宾语/补足语'
          dependencies.push({ fromId: chunk.id, toId: target.id, relation })
        }
        if (group.some(index => ['noun', 'pronoun', 'number'].includes(tokens[index].kind))) lastNominal = chunk
      }
    }
  }

  const notes: string[] = []

  if (passiveDetected) notes.push('检测到被动语态：be 动词 + 过去分词，主语是动作承受者。')
  if (tokens.some(token => ['by', 'with'].includes(token.normalized)) && passiveDetected) notes.push('by/with 介词短语说明动作的执行者或工具。')
  if (objectIsClause) notes.push('谓语后接从句，整体作宾语。')
  if (relativeClauseIndices.length) notes.push('主语中含有定语从句，句子的核心谓语位于从句之后。')
  if (invertedAuxIndex >= 0) notes.push('疑问句采用助动词/系动词前置的倒装结构。')

  const hasObject = objectIndices.length > 0 && !linking && !beQuestion
  const hasComplement = objectIndices.length > 0 && (linking || beQuestion)
  const basePattern = sentenceType === '祈使句'
    ? '祈使结构（省略主语）'
    : passiveDetected ? 'S + be + V-ed（被动）'
    : hasObject ? 'S + V + O'
    : hasComplement ? 'S + V + P'
    : 'S + V'
  const pattern = sentenceType === '疑问句' ? `疑问句 · ${basePattern}` : basePattern
  const verbCount = tokens.filter(token => ['verb', 'auxiliary', 'modal'].includes(token.kind)).length
  const hasSubordinate = tokens.some(token => token.kind === 'conjunction' && (SUBORDINATORS.has(token.normalized) || ['that', 'if', 'whether'].includes(token.normalized)))
  const hasCoordinate = tokens.some(token => token.kind === 'conjunction' && ['and', 'but', 'or', 'nor', 'yet', 'so'].includes(token.normalized))
  const baseComplexity = relativeClauseIndices.length || hasSubordinate && verbCount > 1 ? '复合句' : hasCoordinate && verbCount > 1 ? '并列句' : '简单句'
  const clauses = options.detectNestedClauses === false
    ? []
    : analyzeClauseTree(text, tokens, clauseText => {
        const core = analyzeSentence(clauseText, dictionary, { detectNestedClauses: false })
        return {
          sentenceType: core.sentenceType,
          pattern: core.pattern,
          complexity: core.complexity,
          components: core.components,
          chunks: core.chunks,
          dependencies: core.dependencies,
          notes: core.notes
        }
      })

  const maxClauseDepth = clauses.reduce((max, clause) => Math.max(max, clause.depth), 0)
  const complexity = clauses.length
    ? maxClauseDepth > 1 ? '多重复合句' : '复合句'
    : baseComplexity
  const tree = buildSentenceTree(text, { tokens, components, chunks, pattern, clauses })

  return {
    text,
    sentenceType,
    pattern,
    complexity,
    tokens,
    components,
    modifiers: dedupeModifiers(modifiers),
    chunks,
    dependencies,
    clauses,
    tree,
    notes
  }
}

function isPassiveParticiple(word: string): boolean {
  return /ed$|en$/.test(word) || PASSIVE_PARTICIPLES.has(word)
}

function dedupeModifiers(modifiers: ModifierLink[]): ModifierLink[] {
  const seen = new Set<string>()
  return modifiers.filter(item => {
    const key = `${item.modifier}|${item.target}|${item.relation}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
