import type {
  ChunkDependency,
  SentenceChunk,
  SentenceComponent,
  SentenceToken
} from './sentenceAnalysis'

export interface NestedClauseAnalysis {
  id: string
  depth: number
  parentId: string
  path: string
  marker: string
  clauseType: string
  relation: string
  text: string
  sentenceType: string
  pattern: string
  complexity: string
  components: SentenceComponent[]
  chunks: SentenceChunk[]
  dependencies: ChunkDependency[]
  notes: string[]
}

interface ClauseCoreAnalysis {
  sentenceType: string
  pattern: string
  complexity: string
  components: SentenceComponent[]
  chunks: SentenceChunk[]
  dependencies: ChunkDependency[]
  notes: string[]
}

type AnalyzeClauseCore = (text: string) => ClauseCoreAnalysis

interface ClauseMarkerDefinition {
  clauseType: string
  relation: string
  family: 'relative' | 'nominal' | 'adverbial' | 'that'
}

interface ClauseMarker {
  startToken: number
  endToken: number
  startOffset: number
  endOffset: number
  marker: string
  definition: ClauseMarkerDefinition
}

interface ClauseCandidate extends ClauseMarker {
  id: string
  markerEndOffset: number
  markerEndToken: number
  endToken: number
  endOffset: number
  parentId: string
  depth: number
  path: string
}

const LEADING_CLAUSE_MARKERS = new Set([
  'because', 'although', 'though', 'if', 'unless', 'when', 'whenever', 'while', 'whereas',
  'before', 'after', 'until', 'since', 'as', 'once', 'where', 'wherever', 'whether'
])

const MULTI_MARKERS: Array<{ words: string[]; definition: ClauseMarkerDefinition }> = [
  { words: ['even', 'though'], definition: { clauseType: '让步状语从句', relation: '对上一层从句或主句作出让步', family: 'adverbial' } },
  { words: ['even', 'if'], definition: { clauseType: '让步条件状语从句', relation: '表示退一步的假设条件', family: 'adverbial' } },
  { words: ['as', 'long', 'as'], definition: { clauseType: '条件状语从句', relation: '表示前提条件', family: 'adverbial' } },
  { words: ['as', 'soon', 'as'], definition: { clauseType: '时间状语从句', relation: '表示两个动作紧接发生', family: 'adverbial' } },
  { words: ['in', 'order', 'that'], definition: { clauseType: '目的状语从句', relation: '说明上一层动作的目的', family: 'adverbial' } },
  { words: ['so', 'that'], definition: { clauseType: '目的/结果状语从句', relation: '说明目的或结果', family: 'adverbial' } },
  { words: ['such', 'that'], definition: { clauseType: '结果状语从句', relation: '说明造成的结果', family: 'adverbial' } },
  { words: ['now', 'that'], definition: { clauseType: '原因/时间状语从句', relation: '说明当前状态形成的原因或时间', family: 'adverbial' } }
]

const SINGLE_MARKERS: Record<string, ClauseMarkerDefinition> = {
  who: { clauseType: '定语从句', relation: '修饰前面的名词或代词', family: 'relative' },
  whom: { clauseType: '定语从句', relation: '修饰前面的名词或代词，并在从句中作宾语', family: 'relative' },
  whose: { clauseType: '定语从句', relation: '修饰前面的名词，表示所属关系', family: 'relative' },
  which: { clauseType: '定语从句', relation: '修饰前面的名词、短语或整个分句', family: 'relative' },
  that: { clauseType: '名词性从句', relation: '由上下文决定其名词性从句功能', family: 'that' },
  because: { clauseType: '原因状语从句', relation: '说明上一层动作或状态的原因', family: 'adverbial' },
  since: { clauseType: '原因/时间状语从句', relation: '说明原因或从某一时间点开始', family: 'adverbial' },
  as: { clauseType: '时间/原因/方式状语从句', relation: '说明时间、原因或方式', family: 'adverbial' },
  for: { clauseType: '原因状语从句', relation: '补充说明上一层判断的原因', family: 'adverbial' },
  if: { clauseType: '条件状语从句', relation: '说明上一层动作发生的条件', family: 'adverbial' },
  unless: { clauseType: '条件状语从句', relation: '说明除非条件', family: 'adverbial' },
  although: { clauseType: '让步状语从句', relation: '对上一层内容作出让步', family: 'adverbial' },
  though: { clauseType: '让步状语从句', relation: '对上一层内容作出让步', family: 'adverbial' },
  while: { clauseType: '时间/对比状语从句', relation: '说明同时发生、持续背景或对比关系', family: 'adverbial' },
  whereas: { clauseType: '对比状语从句', relation: '与上一层内容形成对比', family: 'adverbial' },
  when: { clauseType: '时间状语从句', relation: '说明动作发生的时间', family: 'adverbial' },
  whenever: { clauseType: '时间状语从句', relation: '说明动作发生的任意时间', family: 'adverbial' },
  before: { clauseType: '时间状语从句', relation: '说明动作发生之前的时间', family: 'adverbial' },
  after: { clauseType: '时间状语从句', relation: '说明动作发生之后的时间', family: 'adverbial' },
  until: { clauseType: '时间状语从句', relation: '说明动作持续到的时间', family: 'adverbial' },
  once: { clauseType: '时间/条件状语从句', relation: '说明动作一旦发生的条件或时间', family: 'adverbial' },
  where: { clauseType: '地点状语从句', relation: '说明动作发生的地点', family: 'adverbial' },
  wherever: { clauseType: '地点状语从句', relation: '说明动作发生的任意地点', family: 'adverbial' },
  than: { clauseType: '比较状语从句', relation: '与主句中的比较对象形成比较', family: 'adverbial' },
  whether: { clauseType: '名词性从句', relation: '表示是否，作主语、宾语或表语', family: 'nominal' },
  what: { clauseType: '名词性从句', relation: '在上一层结构中作主语、宾语或表语', family: 'nominal' },
  whatever: { clauseType: '名词性从句', relation: '表示无论什么，作主语、宾语或表语', family: 'nominal' },
  whoever: { clauseType: '名词性从句', relation: '表示无论谁，作主语或宾语', family: 'nominal' },
  whomever: { clauseType: '名词性从句', relation: '表示无论谁，作宾语', family: 'nominal' },
  whichever: { clauseType: '名词性从句', relation: '表示无论哪一个，作主语或宾语', family: 'nominal' },
  why: { clauseType: '名词性/定语从句', relation: '说明原因或修饰前面的名词', family: 'nominal' },
  how: { clauseType: '名词性从句', relation: '表示方式或程度，作主语、宾语或表语', family: 'nominal' }
}

const REPORTING_VERBS = new Set([
  'say', 'said', 'tell', 'told', 'think', 'thought', 'know', 'knew', 'believe', 'believed',
  'expect', 'expected', 'hope', 'hoped', 'wish', 'wished', 'suggest', 'suggested',
  'explain', 'explained', 'wonder', 'wondered', 'ask', 'asked', 'realize', 'realized',
  'notice', 'noticed', 'show', 'showed', 'shows', 'prove', 'proved', 'proves', 'claim', 'claimed', 'claims',
  'say', 'says', 'tell', 'tells', 'think', 'thinks', 'know', 'knows', 'believe', 'believes', 'suggest', 'suggests',
  'explain', 'explains', 'indicate', 'indicates', 'imply', 'implies', 'mean', 'means', 'confirm', 'confirms',
  'reveal', 'reveals', 'warn', 'warns', 'teach', 'teaches', 'remind', 'reminds', 'admit', 'admits',
  'deny', 'denies', 'agree', 'agrees', 'argue', 'argues'
])

const LINKING_FORMS = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'become', 'became', 'seem', 'seemed', 'remain', 'remained'])
const ABSTRACT_NOUNS = new Set([
  'fact', 'idea', 'belief', 'news', 'evidence', 'possibility', 'claim', 'theory', 'hope', 'fear',
  'reason', 'doubt', 'thought', 'impression', 'conclusion', 'promise', 'decision', 'suggestion', 'rumor', 'rumour'
])
const COORDINATORS = new Set(['and', 'but', 'or', 'nor', 'yet', 'so'])
const TERMINALS = new Set(['.', '!', '?'])

function previousSignificant(tokens: SentenceToken[], index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].kind !== 'punctuation') return cursor
  }
  return -1
}

function nextSignificant(tokens: SentenceToken[], index: number): number {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].kind !== 'punctuation') return cursor
  }
  return -1
}

function isAuxiliaryLike(token: SentenceToken): boolean {
  return token.kind === 'auxiliary' || token.kind === 'modal'
}

function isFiniteVerb(tokens: SentenceToken[], index: number): boolean {
  const token = tokens[index]
  if (isAuxiliaryLike(token)) return true
  if (token.kind !== 'verb') return false
  const previous = previousSignificant(tokens, index)
  if (previous >= 0 && (tokens[previous].kind === 'determiner' || tokens[previous].normalized === 'to')) return false
  if (/ing$/.test(token.normalized)) return false
  if (/(?:ed|en)$/.test(token.normalized)) {
    const previous = previousSignificant(tokens, index)
    return previous < 0 || tokens[previous].kind !== 'auxiliary'
  }
  return true
}

function isPredicateContinuation(tokens: SentenceToken[], index: number): boolean {
  const previous = previousSignificant(tokens, index)
  if (previous < 0) return false
  let cursor = previous
  while (cursor >= 0 && tokens[cursor].kind === 'adverb') cursor = previousSignificant(tokens, cursor)
  if (cursor < 0) return false
  return isAuxiliaryLike(tokens[cursor])
}

function predicateGroupCount(tokens: SentenceToken[], startToken: number, endToken: number): number {
  let count = 0
  for (let index = startToken + 1; index <= endToken; index += 1) {
    if (!isFiniteVerb(tokens, index)) continue
    if (isPredicateContinuation(tokens, index)) continue
    count += 1
  }
  return count
}

function markerMatchesAt(tokens: SentenceToken[], index: number): ClauseMarker | null {
  for (const multi of MULTI_MARKERS) {
    let cursor = index
    let matched = true
    for (let wordIndex = 0; wordIndex < multi.words.length; wordIndex += 1) {
      if (cursor >= tokens.length || tokens[cursor].kind === 'punctuation' || tokens[cursor].normalized !== multi.words[wordIndex]) {
        matched = false
        break
      }
      cursor = nextSignificant(tokens, cursor)
      if (wordIndex < multi.words.length - 1 && cursor < 0) {
        matched = false
        break
      }
    }
    if (matched) {
      const endToken = previousSignificant(tokens, cursor)
      return {
        startToken: index,
        endToken,
        startOffset: tokens[index].start,
        endOffset: tokens[endToken].end,
        marker: tokens.slice(index, endToken + 1).map(token => token.text).join(' '),
        definition: multi.definition
      }
    }
  }

  const token = tokens[index]
  const definition = SINGLE_MARKERS[token.normalized]
  if (!definition) return null
  if (['because', 'since', 'as', 'for', 'before', 'after', 'until', 'once'].includes(token.normalized)) {
    const next = nextSignificant(tokens, index)
    if (next < 0 || ['of', 'to'].includes(tokens[next].normalized)) return null
  }
  return {
    startToken: index,
    endToken: index,
    startOffset: token.start,
    endOffset: token.end,
    marker: token.text,
    definition
  }
}

function detectMarkers(tokens: SentenceToken[]): ClauseMarker[] {
  const markers: ClauseMarker[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind === 'punctuation') continue
    const marker = markerMatchesAt(tokens, index)
    if (!marker) continue
    markers.push(marker)
    index = marker.endToken
  }
  return markers
}

function lastClauseToken(tokens: SentenceToken[]): number {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index].kind !== 'punctuation' || TERMINALS.has(tokens[index].text)) return index
  }
  return tokens.length - 1
}

function previousBoundaryIndex(tokens: SentenceToken[], index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].kind !== 'punctuation' || TERMINALS.has(tokens[cursor].text)) return cursor
  }
  return index - 1
}

function findNominalHeadBefore(tokens: SentenceToken[], startToken: number): number {
  const previous = previousSignificant(tokens, startToken)
  if (previous < 0) return -1
  if (['noun', 'pronoun'].includes(tokens[previous].kind)) return previous
  let cursor = previous
  for (let step = 0; step < 4; step += 1) {
    cursor = previousSignificant(tokens, cursor)
    if (cursor < 0) break
    if (tokens[cursor].kind === 'determiner') return previous
    if (['noun', 'pronoun'].includes(tokens[cursor].kind)) return cursor
  }
  return -1
}

function inferThatDefinition(tokens: SentenceToken[], startToken: number): ClauseMarkerDefinition {
  const previous = previousSignificant(tokens, startToken)
  if (previous >= 0 && REPORTING_VERBS.has(tokens[previous].normalized)) {
    return { clauseType: '宾语从句', relation: '作前面及物动词的宾语', family: 'nominal' }
  }
  if (previous >= 0 && LINKING_FORMS.has(tokens[previous].normalized)) {
    return { clauseType: '表语从句', relation: '作系动词后的表语', family: 'nominal' }
  }
  const nominalHead = findNominalHeadBefore(tokens, startToken)
  if (nominalHead >= 0) {
    const next = nextSignificant(tokens, startToken)
    if (next >= 0 && ['noun', 'determiner', 'adjective'].includes(tokens[next].kind) && ABSTRACT_NOUNS.has(tokens[nominalHead].normalized)) {
      return { clauseType: '同位语从句', relation: '解释前面的抽象名词 ' + tokens[nominalHead].text, family: 'nominal' }
    }
    return { clauseType: '定语从句', relation: '修饰前面的名词或代词 ' + tokens[nominalHead].text, family: 'relative' }
  }
  if (startToken === 0) {
    return { clauseType: '主语从句', relation: '在整句中充当主语', family: 'nominal' }
  }
  return { clauseType: '名词性从句', relation: '根据所在位置充当主语、宾语或表语', family: 'nominal' }
}

function inferNominalDefinition(tokens: SentenceToken[], startToken: number, definition: ClauseMarkerDefinition): ClauseMarkerDefinition {
  const previous = previousSignificant(tokens, startToken)
  if (previous >= 0 && LINKING_FORMS.has(tokens[previous].normalized)) {
    return { ...definition, clauseType: '表语从句', relation: '作系动词后的表语' }
  }
  const nominalHead = findNominalHeadBefore(tokens, startToken)
  if (nominalHead >= 0 && ['which', 'who', 'whom', 'whose'].includes(tokens[startToken].normalized)) {
    return { ...definition, clauseType: '定语从句', relation: '修饰前面的名词或代词 ' + tokens[nominalHead].text }
  }
  if (previous >= 0 && REPORTING_VERBS.has(tokens[previous].normalized)) {
    return { ...definition, clauseType: '宾语从句', relation: '作前面及物动词的宾语' }
  }
  if (startToken === 0) {
    return { ...definition, clauseType: '主语从句', relation: '在整句中充当主语' }
  }
  return definition
}

function isLikelyDeterminerUse(tokens: SentenceToken[], marker: ClauseMarker, endToken: number): boolean {
  if (marker.startToken !== 0 || !['that', 'which', 'what', 'whose'].includes(tokens[marker.startToken].normalized)) return false
  const next = nextSignificant(tokens, marker.startToken)
  if (next < 0 || tokens[next].kind !== 'noun') return false
  return predicateGroupCount(tokens, marker.startToken, endToken) < 2
}

function buildClauseSpans(tokens: SentenceToken[]): Map<number, number> {
  const markers = detectMarkers(tokens)
  const markerStarts = new Set(markers.map(marker => marker.startToken))
  const memo = new Map<number, number>()
  const lastToken = lastClauseToken(tokens)

  const findEnd = (startToken: number): number => {
    const cached = memo.get(startToken)
    if (cached !== undefined) return cached
    let endToken = lastToken
    let ownPredicateSeen = false
    let coordinationIndex = -1

    for (let index = startToken + 1; index <= lastToken; index += 1) {
      const token = tokens[index]
      if (TERMINALS.has(token.text)) {
        endToken = previousBoundaryIndex(tokens, index)
        break
      }
      if (token.text === ';' || token.text === ':') {
        endToken = previousBoundaryIndex(tokens, index)
        break
      }
      if (token.text === ',') {
        if (ownPredicateSeen) {
          endToken = previousBoundaryIndex(tokens, index)
          break
        }
        continue
      }

      if (COORDINATORS.has(token.normalized) && ownPredicateSeen) {
        coordinationIndex = index
        continue
      }

      if (markerStarts.has(index) && index > startToken) {
        const nestedEnd = findEnd(index)
        if (nestedEnd > index) {
          if (ownPredicateSeen && coordinationIndex >= 0) {
            endToken = previousBoundaryIndex(tokens, coordinationIndex)
            break
          }
          index = nestedEnd
          continue
        }
      }

      if (isFiniteVerb(tokens, index) && !isPredicateContinuation(tokens, index)) {
        if (!ownPredicateSeen) {
          ownPredicateSeen = true
          coordinationIndex = -1
          continue
        }
        if (coordinationIndex >= 0) {
          coordinationIndex = -1
          continue
        }
        endToken = previousBoundaryIndex(tokens, index)
        break
      }
    }
    memo.set(startToken, Math.max(startToken, endToken))
    return memo.get(startToken)!
  }

  for (const marker of markers) findEnd(marker.startToken)
  return memo
}

export function analyzeClauseTree(
  text: string,
  tokens: SentenceToken[],
  analyzeCore: AnalyzeClauseCore
): NestedClauseAnalysis[] {
  const markers = detectMarkers(tokens)
  if (!markers.length) return []
  const spans = buildClauseSpans(tokens)
  const candidates: ClauseCandidate[] = []

  for (const marker of markers) {
    const endToken = spans.get(marker.startToken) ?? marker.endToken
    if (endToken <= marker.endToken) continue
    const predicateCount = predicateGroupCount(tokens, marker.startToken, endToken)
    if (predicateCount < 1) continue
    const afterClause = nextSignificant(tokens, endToken)
    const followedByMatrixPredicate = afterClause >= 0 && isFiniteVerb(tokens, afterClause)
    const normalizedMarker = tokens[marker.startToken].normalized
    const leadingNominalMarker = ['whether', 'what', 'who', 'whom', 'whose', 'which', 'whatever', 'whoever', 'whichever', 'how', 'why', 'where', 'whenever'].includes(normalizedMarker)
    if (marker.startToken === 0 && predicateCount < 2 && !followedByMatrixPredicate && !LEADING_CLAUSE_MARKERS.has(normalizedMarker) && !leadingNominalMarker) continue
    if (isLikelyDeterminerUse(tokens, marker, endToken)) continue
    let definition = marker.definition
    if (tokens[marker.startToken].normalized === 'that') definition = inferThatDefinition(tokens, marker.startToken)
    else if (definition.family === 'nominal') definition = inferNominalDefinition(tokens, marker.startToken, definition)
    candidates.push({
      ...marker,
      definition,
      id: `clause-${candidates.length + 1}`,
      markerEndOffset: marker.endOffset,
      markerEndToken: marker.endToken,
      endToken,
      endOffset: tokens[endToken].end,
      parentId: '',
      depth: 1,
      path: ''
    })
  }

  const stack: ClauseCandidate[] = []
  for (const candidate of candidates) {
    while (stack.length && !(candidate.startToken >= stack[stack.length - 1].startToken && candidate.endToken <= stack[stack.length - 1].endToken)) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    candidate.parentId = parent?.id || ''
    candidate.depth = parent ? parent.depth + 1 : 1
    candidate.path = parent ? `${parent.path} → ${candidate.definition.clauseType}` : candidate.definition.clauseType
    stack.push(candidate)
  }

  return candidates.map(candidate => {
    const clauseText = text.slice(candidate.startOffset, candidate.endOffset).trim()
    const afterMarker = nextSignificant(tokens, candidate.markerEndToken)
    const relativeMarkerIsSubject = candidate.definition.family === 'relative' && afterMarker >= 0 && isFiniteVerb(tokens, afterMarker)
    const bodyText = text.slice(candidate.markerEndOffset, candidate.endOffset).trim()
    const analysisText = relativeMarkerIsSubject ? clauseText : (bodyText || clauseText)
    const core = analyzeCore(analysisText)
    return {
      id: candidate.id,
      depth: candidate.depth,
      parentId: candidate.parentId || '',
      path: candidate.path,
      marker: candidate.marker,
      clauseType: candidate.definition.clauseType,
      relation: candidate.definition.relation,
      text: clauseText,
      sentenceType: core.sentenceType,
      pattern: core.pattern,
      complexity: core.complexity,
      components: core.components,
      chunks: core.chunks,
      dependencies: core.dependencies,
      notes: core.notes
    }
  })
}