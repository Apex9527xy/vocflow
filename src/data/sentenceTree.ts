import type { NestedClauseAnalysis } from './clauseAnalysis'
import type { SentenceComponent, SentenceToken } from './sentenceAnalysis'

export type ClauseUnitType =
  | '主句' | '定语从句' | '状语从句' | '主语从句'
  | '宾语从句' | '表语从句' | '同位语从句'

export type BasicSentencePattern = 'SV' | 'SVO' | 'SVP' | 'SVOO' | 'SVOC'

export type ClauseComponentLabel =
  | '主语' | '主语(名词短语)' | '谓语'
  | '宾语' | '宾语(名词短语)' | '宾语(名词性从句)'
  | '间接宾语' | '间接宾语(名词短语)'
  | '直接宾语' | '直接宾语(名词短语)'
  | '表语' | '表语(名词短语)'
  | '宾语补足语' | '状语' | '修饰语'

export interface SentenceTreePhrase {
  text: string
  label: ClauseComponentLabel
}

export interface SentenceTreeModifier {
  text: string
  target: string
  relation: string
}

export interface SentenceTreeClauseNode {
  id: string
  type: ClauseUnitType
  subtype?: string
  guideWord?: string
  pattern: BasicSentencePattern
  subject: SentenceTreePhrase
  predicate: SentenceTreePhrase
  object?: SentenceTreePhrase
  indirectObject?: SentenceTreePhrase
  directObject?: SentenceTreePhrase
  predicative?: SentenceTreePhrase
  objectComplement?: SentenceTreePhrase
  adverbial?: SentenceTreePhrase
  modifiers?: SentenceTreeModifier[]
  children: SentenceTreeClauseNode[]
  valid: boolean
  validationErrors: string[]
}

export interface SentenceTreeAnalysis {
  rawSentence: string
  tree: SentenceTreeClauseNode[]
  valid: boolean
  validationErrors: string[]
}

export const SENTENCE_TREE_COMPONENT_LABELS = [
  '主语', '主语(名词短语)', '谓语', '宾语', '宾语(名词短语)', '宾语(名词性从句)',
  '间接宾语', '间接宾语(名词短语)', '直接宾语', '直接宾语(名词短语)',
  '表语', '表语(名词短语)', '宾语补足语', '状语', '修饰语'
] as const

export const SENTENCE_TREE_SYSTEM_PROMPT = `你是 VocFlow 的英语句法分析器。你的任务不是泛泛解释句子，而是把句子拆成可校验的主谓单元树。

必须遵守以下规则：
1. 整句有且只有一个“主句”根节点，所有从句必须挂在主句或另一个从句下面。
2. 找出句子中的全部独立主谓单元。每个主谓单元必须有明确的 subject 和 predicate；缺少任一成分时标记 valid=false 并给出 validationErrors。
3. 每个主谓单元只能标记一个句型，五种句型互斥：
   - SV：主语 + 不及物动词，无宾语、无表语。
   - SVO：主语 + 实义及物动词 + 宾语。
   - SVP：主语 + 系动词 + 表语；表语不是宾语，二者不得同时出现。
   - SVOO：主语 + 动词 + 间接宾语 + 直接宾语。
   - SVOC：主语 + 动词 + 宾语 + 宾语补足语。
4. 系动词只允许：be, become, seem, remain, prove, look, sound, smell, taste, feel, get, turn 及其合法变形。
5. 每个从句必须标记类型：定语从句、状语从句、主语从句、宾语从句、表语从句、同位语从句。
6. 从句必须有引导词。只有在定语从句或宾语从句中允许符合英语语法的引导词省略；省略时 guideWord 留空，并在 validationErrors 中不得因此判错。
7. 从句内部继续拆成自己的主谓单元；禁止把从句的主语、谓语、宾语混入主句主干。
8. 成分标签只能使用固定集合：主语、主语(名词短语)、谓语、宾语、宾语(名词短语)、宾语(名词性从句)、间接宾语、间接宾语(名词短语)、直接宾语、直接宾语(名词短语)、表语、表语(名词短语)、宾语补足语、状语、修饰语。
9. 如果第一次分析出现缺主语、缺谓语、多个主句或句型互斥冲突，必须先自我校验并重试一次；仍无法确定时保留最可靠结构并写入 validationErrors。
10. 只输出符合给定 JSON Schema 的 JSON，不要输出 Markdown、解释文字或额外字段。`

export const SENTENCE_TREE_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'VocFlowSentenceTreeAnalysis',
  type: 'object',
  additionalProperties: false,
  required: ['rawSentence', 'tree', 'valid', 'validationErrors'],
  properties: {
    rawSentence: { type: 'string', minLength: 1 },
    tree: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: { $ref: '#/$defs/clauseNode' }
    },
    valid: { type: 'boolean' },
    validationErrors: { type: 'array', items: { type: 'string' } }
  },
  $defs: {
    phrase: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'label'],
      properties: {
        text: { type: 'string', minLength: 1 },
        label: {
          type: 'string',
          enum: [
            '主语', '主语(名词短语)', '谓语', '宾语', '宾语(名词短语)',
            '宾语(名词性从句)', '间接宾语', '间接宾语(名词短语)',
            '直接宾语', '直接宾语(名词短语)', '表语', '表语(名词短语)',
            '宾语补足语', '状语', '修饰语'
          ]
        }
      }
    },
    modifier: {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'target', 'relation'],
      properties: {
        text: { type: 'string' },
        target: { type: 'string' },
        relation: { type: 'string' }
      }
    },
    clauseNode: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'type', 'pattern', 'subject', 'predicate', 'children', 'valid', 'validationErrors'],
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          enum: ['主句', '定语从句', '状语从句', '主语从句', '宾语从句', '表语从句', '同位语从句']
        },
        subtype: { type: 'string' },
        guideWord: { type: 'string' },
        pattern: { type: 'string', enum: ['SV', 'SVO', 'SVP', 'SVOO', 'SVOC'] },
        subject: { $ref: '#/$defs/phrase' },
        predicate: { $ref: '#/$defs/phrase' },
        object: { $ref: '#/$defs/phrase' },
        indirectObject: { $ref: '#/$defs/phrase' },
        directObject: { $ref: '#/$defs/phrase' },
        predicative: { $ref: '#/$defs/phrase' },
        objectComplement: { $ref: '#/$defs/phrase' },
        adverbial: { $ref: '#/$defs/phrase' },
        modifiers: { type: 'array', items: { $ref: '#/$defs/modifier' } },
        children: { type: 'array', items: { $ref: '#/$defs/clauseNode' } },
        valid: { type: 'boolean' },
        validationErrors: { type: 'array', items: { type: 'string' } }
      }
    }
  }
} as const

const LINKING_VERBS = new Set([
  'be', 'am', 'is', 'are', 'was', 'were', 'been', 'being',
  'become', 'becomes', 'became', 'seem', 'seems', 'seemed',
  'remain', 'remains', 'remained', 'prove', 'proves', 'proved', 'proven',
  'look', 'looks', 'looked', 'sound', 'sounds', 'sounded',
  'smell', 'smells', 'smelled', 'taste', 'tastes', 'tasted',
  'feel', 'feels', 'felt', 'get', 'gets', 'got', 'gotten',
  'turn', 'turns', 'turned'
])

const DITRANSITIVE_VERBS = new Set([
  'give', 'gives', 'gave', 'given', 'send', 'sends', 'sent', 'show', 'shows', 'showed', 'shown',
  'tell', 'tells', 'told', 'teach', 'teaches', 'taught', 'buy', 'buys', 'bought',
  'bring', 'brings', 'brought', 'offer', 'offers', 'offered', 'pass', 'passes', 'passed',
  'lend', 'lends', 'lent', 'pay', 'pays', 'paid', 'promise', 'promises', 'promised',
  'award', 'awards', 'awarded', 'hand', 'hands', 'handed', 'write', 'writes', 'wrote', 'written'
])

const COMPLEX_TRANSITIVE_VERBS = new Set([
  'make', 'makes', 'made', 'let', 'lets', 'have', 'has', 'had', 'get', 'gets', 'got',
  'keep', 'keeps', 'kept', 'find', 'finds', 'found', 'consider', 'considers', 'considered',
  'call', 'calls', 'called', 'name', 'names', 'named', 'elect', 'elects', 'elected',
  'appoint', 'appoints', 'appointed', 'see', 'sees', 'saw', 'seen', 'hear', 'hears', 'heard',
  'watch', 'watches', 'watched', 'feel', 'feels', 'felt', 'want', 'wants', 'wanted',
  'ask', 'asks', 'asked', 'tell', 'tells', 'told', 'expect', 'expects', 'expected',
  'cause', 'causes', 'caused', 'allow', 'allows', 'allowed', 'require', 'requires', 'required',
  'urge', 'urges', 'urged', 'force', 'forces', 'forced', 'encourage', 'encourages', 'encouraged',
  'remind', 'reminds', 'reminded', 'enable', 'enables', 'enabled', 'invite', 'invites', 'invited'
])

function componentByRole(components: SentenceComponent[], role: SentenceComponent['role']): SentenceComponent | undefined {
  return components.find(component => component.role === role)
}

function chunkTextByRole(components: SentenceComponent[], chunks: Array<{ role: string; text: string }>, role: string): string {
  return componentByRole(components, role as SentenceComponent['role'])?.text
    || chunks.find(chunk => chunk.role === role)?.text
    || ''
}

function validPhraseText(text: string): string {
  const value = String(text || '').trim()
  if (!value || value === '（未明确）' || value === '(未明确)') return ''
  return value
}

function nominalLabel(text: string, fallback: '主语' | '宾语' | '间接宾语' | '直接宾语' | '表语'): string {
  const value = text.trim()
  if (/\b(?:that|whether|what|who|which|when|where|why|how)\b/i.test(value) && /\b(?:is|are|was|were|has|have|had|can|could|will|would|may|might|must|do|does|did|changes?|knows?|likes?)\b/i.test(value)) {
    return fallback === '宾语' ? '宾语(名词性从句)' : fallback === '主语' ? '主语' : fallback === '表语' ? '表语' : `${fallback}(名词短语)`
  }
  if (/^(?:i|you|he|she|it|we|they|me|him|her|us|them|this|that|these|those)$/i.test(value)) return fallback
  return `${fallback}(名词短语)` as ClauseComponentLabel
}

function phrase(text: string, fallback: '主语' | '宾语' | '间接宾语' | '直接宾语' | '表语'): SentenceTreePhrase {
  return { text, label: nominalLabel(text, fallback) as ClauseComponentLabel }
}

function normalizeClauseType(clause: NestedClauseAnalysis): ClauseUnitType {
  const value = clause.clauseType || ''
  if (value.includes('定语')) return '定语从句'
  if (value.includes('状语')) return '状语从句'
  if (value.includes('主语')) return '主语从句'
  if (value.includes('同位语')) return '同位语从句'
  if (value.includes('宾语')) return '宾语从句'
  if (value.includes('表语')) return '表语从句'
  if (value.includes('名词性')) {
    if (clause.relation.includes('宾语')) return '宾语从句'
    if (clause.relation.includes('主语')) return '主语从句'
    if (clause.relation.includes('表语')) return '表语从句'
    if (clause.relation.includes('同位语')) return '同位语从句'
    return '宾语从句'
  }
  return '宾语从句'
}

function splitDoubleObjectText(text: string): { indirectObject: string; directObject: string } | null {
  const value = text.trim()
  const preposition = value.match(/^(.+?)\s+(to|for)\s+(.+)$/i)
  if (preposition) return { directObject: preposition[1].trim(), indirectObject: preposition[3].trim() }
  const tokens = value.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:[.,]\d+)*|[^\s]/g) || []
  if (tokens.length < 2) return null
  const pronouns = /^(?:i|you|he|she|it|we|they|me|him|her|us|them)$/i
  const nominalKinds = /^(?:a|an|the|this|that|these|those|my|your|his|her|its|our|their|some|any|no|every|each)$/i
  let end = -1
  if (pronouns.test(tokens[0] || '')) {
    end = 0
  } else if (nominalKinds.test(tokens[0] || '')) {
    for (let index = 1; index < tokens.length; index += 1) {
      if (/^[A-Za-z\-]+$/.test(tokens[index] || '') && !nominalKinds.test(tokens[index] || '')) { end = index; break }
    }
  } else {
    end = 0
  }
  if (end < 0 || end >= tokens.length - 1) return null
  return {
    indirectObject: tokens.slice(0, end + 1).join(' ').replace(/\s+([,.;])/g, '$1'),
    directObject: tokens.slice(end + 1).join(' ').replace(/\s+([,.;])/g, '$1')
  }
}

function splitObjectComplementText(text: string): { object: string; complement: string } | null {
  const tokens = text.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*|\d+(?:[.,]\d+)*|[^\s]/g) || []
  if (tokens.length < 2) return null
  const determiner = /^(?:a|an|the|this|that|these|those|my|your|his|her|its|our|their|some|any|no|every|each)$/i
  let nounEnd = -1
  if (determiner.test(tokens[0] || '')) {
    for (let index = 1; index < tokens.length; index += 1) {
      if (/^[A-Za-z\-]+$/.test(tokens[index] || '') && !determiner.test(tokens[index] || '')) { nounEnd = index; break }
    }
  } else {
    nounEnd = 0
  }
  if (nounEnd < 0 || nounEnd >= tokens.length - 1) return null
  return {
    object: tokens.slice(0, nounEnd + 1).join(' '),
    complement: tokens.slice(nounEnd + 1).join(' ')
  }
}

interface UnitDerivation {
  pattern: BasicSentencePattern
  subject: SentenceTreePhrase
  predicate: SentenceTreePhrase
  object?: SentenceTreePhrase
  indirectObject?: SentenceTreePhrase
  directObject?: SentenceTreePhrase
  predicative?: SentenceTreePhrase
  objectComplement?: SentenceTreePhrase
  adverbial?: SentenceTreePhrase
}

function fallbackPredicate(tokens: SentenceToken[]): SentenceComponent | undefined {
  const token = tokens.find(item => ['verb', 'auxiliary', 'modal'].includes(item.kind))
  if (!token) return undefined
  return { role: 'predicate', label: '谓语', text: token.text, head: token.text, note: '' }
}

function fallbackSubject(tokens: SentenceToken[], predicate: SentenceComponent | undefined): SentenceComponent | undefined {
  if (!tokens.length) return undefined
  const predicateIndex = predicate ? tokens.findIndex(token => token.text === predicate.head || token.text === predicate.text.split(/\s+/).pop()) : -1
  const before = tokens.slice(0, predicateIndex >= 0 ? predicateIndex : Math.min(tokens.length, 8)).filter(token => token.kind !== 'punctuation')
  if (!before.length) return undefined
  const text = before.map(token => token.text).join(' ').replace(/\s+([,.;:!?])/g, '$1').trim()
  return text ? { role: 'subject', label: '主语', text, head: before[before.length - 1].text, note: '' } : undefined
}

function deriveUnit(
  components: SentenceComponent[],
  chunks: Array<{ role: string; text: string }>,
  tokens: SentenceToken[],
  patternHint = ''
): UnitDerivation {
  let subjectComponent = componentByRole(components, 'subject')
  let predicateComponent = componentByRole(components, 'predicate') || fallbackPredicate(tokens)
  if (!subjectComponent && predicateComponent) subjectComponent = fallbackSubject(tokens, predicateComponent)
  const subjectText = validPhraseText(subjectComponent?.text || chunkTextByRole(components, chunks, 'subject'))
  const predicateText = validPhraseText(predicateComponent?.text || chunkTextByRole(components, chunks, 'predicate'))
  let objectText = validPhraseText(componentByRole(components, 'object')?.text || chunkTextByRole(components, chunks, 'object'))
  let effectivePredicateText = validPhraseText(predicateComponent?.text || chunkTextByRole(components, chunks, 'predicate'))
  if (!objectText && effectivePredicateText.includes(' ')) {
    const words = effectivePredicateText.split(/\s+/)
    const firstVerb = words[0]?.toLowerCase() || ''
    const lastWord = words[words.length - 1] || ''
    if (/ing$/i.test(lastWord) && !['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'].includes(firstVerb)) {
      effectivePredicateText = words[0]
      objectText = words.slice(1).join(' ')
    }
  }
  let complementText = validPhraseText(componentByRole(components, 'complement')?.text || chunkTextByRole(components, chunks, 'complement'))
  const predicateWords = effectivePredicateText.split(/\s+/).filter(Boolean)
  const bePredicate = ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'].includes(String(predicateWords[0] || '').toLowerCase())
  let adverbialText = ''
  const verbTail = complementText || objectText
  const verbTailWords = verbTail.split(/\s+/).filter(Boolean)
  const verbTailHead = String(verbTailWords[0] || '')
  if (bePredicate && /(?:ing|ed|en)$/i.test(verbTailHead)) {
    effectivePredicateText = `${predicateText} ${verbTailHead}`.trim()
    const rest = verbTailWords.slice(1).join(' ').trim()
    if (/ing$/i.test(verbTailHead)) objectText = rest
    else if (rest) adverbialText = [adverbialText, rest].filter(Boolean).join(' ')
    complementText = ''
  }
  const finalPredicateWords = effectivePredicateText.split(/\s+/).filter(Boolean)
  const predicateFirst = String(finalPredicateWords[0] || '').toLowerCase()
  const predicateLast = String(finalPredicateWords[finalPredicateWords.length - 1] || '').toLowerCase()
  const progressive = ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'].includes(predicateFirst) && /ing$/i.test(predicateLast)
  const passive = ['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being'].includes(predicateFirst) && /(?:ed|en)$/i.test(predicateLast)
  if (progressive || passive) {
    objectText = ''
    complementText = ''
  }
  adverbialText = [adverbialText, validPhraseText(componentByRole(components, 'adverbial')?.text || chunkTextByRole(components, chunks, 'adverbial'))].filter(Boolean).join(' ')
  if (objectText && adverbialText && (adverbialText === objectText || objectText.startsWith(adverbialText) || adverbialText.startsWith(objectText))) {
    adverbialText = ''
  }
  const verb = String(predicateComponent?.head || predicateText.split(/\s+/).pop() || '').toLowerCase().replace(/[^a-z']/g, '')
  const linking = LINKING_VERBS.has(verb) && !progressive && !passive
  const base: UnitDerivation = {
    pattern: 'SV',
    subject: phrase(subjectText, '主语'),
    predicate: { text: effectivePredicateText, label: '谓语' }
  }
  if (adverbialText) base.adverbial = { text: adverbialText, label: '状语' }

  if (linking) {
    const predicativeText = complementText || objectText
    if (predicativeText) {
      base.pattern = 'SVP'
      base.predicative = phrase(predicativeText, '表语')
    } else if (patternHint.includes('S + V + P')) {
      base.pattern = 'SVP'
    }
    return base
  }

  if (objectText) {
    if (DITRANSITIVE_VERBS.has(verb)) {
      const split = splitDoubleObjectText(objectText)
      if (split) {
        base.pattern = 'SVOO'
        base.indirectObject = phrase(split.indirectObject, '间接宾语')
        base.directObject = phrase(split.directObject, '直接宾语')
        return base
      }
    }
    if (complementText || COMPLEX_TRANSITIVE_VERBS.has(verb)) {
      const split = complementText
        ? { object: objectText, complement: complementText }
        : splitObjectComplementText(objectText)
      if (split) {
        base.pattern = 'SVOC'
        base.object = phrase(split.object, '宾语')
        base.objectComplement = { text: split.complement, label: '宾语补足语' }
        return base
      }
    }
    base.pattern = 'SVO'
    base.object = phrase(objectText, '宾语')
    return base
  }

  if (complementText) {
    base.pattern = 'SVP'
    base.predicative = phrase(complementText, '表语')
  }
  return base
}

function clauseNodeFromData(clause: NestedClauseAnalysis): SentenceTreeClauseNode {
  const derived = deriveUnit(clause.components, clause.chunks, [], clause.pattern)
  return {
    id: clause.id,
    type: normalizeClauseType(clause),
    subtype: clause.clauseType,
    guideWord: clause.marker,
    ...derived,
    children: [],
    valid: true,
    validationErrors: []
  }
}

function validateNode(node: SentenceTreeClauseNode, isRoot: boolean): void {
  const errors: string[] = []
  if (isRoot && node.type !== '主句') errors.push('根节点必须是主句')
  if (!node.subject.text) errors.push('缺少主语')
  if (!node.predicate.text) errors.push('缺少谓语')
  if (!isRoot && !node.guideWord && !['定语从句', '宾语从句'].includes(node.type)) {
    errors.push(`${node.type}缺少引导词`)
  }
  if (node.pattern === 'SV' && (node.object || node.predicative || node.indirectObject || node.directObject || node.objectComplement)) {
    errors.push('SV 句型不得包含宾语、表语、双宾语或宾补')
  }
  if (node.pattern === 'SVO' && !node.object) errors.push('SVO 句型缺少宾语')
  if (node.pattern === 'SVP' && (!node.predicative || node.object || node.indirectObject || node.directObject)) {
    errors.push('SVP 句型必须且只能包含表语，表语不能与宾语同时出现')
  }
  if (node.pattern === 'SVOO' && (!node.indirectObject || !node.directObject || node.object)) {
    errors.push('SVOO 句型必须同时包含间接宾语和直接宾语')
  }
  if (node.pattern === 'SVOC' && (!node.object || !node.objectComplement)) {
    errors.push('SVOC 句型必须同时包含宾语和宾语补足语')
  }
  node.validationErrors = [...new Set(errors)]
  node.valid = node.validationErrors.length === 0
  for (const child of node.children) validateNode(child, false)
}

export function buildSentenceTree(
  rawSentence: string,
  analysis: {
    tokens: SentenceToken[]
    components: SentenceComponent[]
    chunks: Array<{ role: string; text: string }>
    pattern: string
    clauses: NestedClauseAnalysis[]
  }
): SentenceTreeAnalysis {
  const derived = deriveUnit(analysis.components, analysis.chunks, analysis.tokens, analysis.pattern)
  const root: SentenceTreeClauseNode = {
    id: 'main',
    type: '主句',
    ...derived,
    children: [],
    valid: true,
    validationErrors: []
  }
  const clauseNodes = analysis.clauses.map(clauseNodeFromData)
  const nodeMap = new Map(clauseNodes.map(node => [node.id, node]))
  analysis.clauses.forEach((clause, index) => {
    const node = clauseNodes[index]
    const parent = clause.parentId ? nodeMap.get(clause.parentId) : root
    ;(parent || root).children.push(node)
  })
  validateNode(root, true)
  const allNodes: SentenceTreeClauseNode[] = []
  const collect = (node: SentenceTreeClauseNode) => { allNodes.push(node); node.children.forEach(collect) }
  collect(root)
  const validationErrors = allNodes.flatMap(node => node.validationErrors.map(error => `${node.type}: ${error}`))
  return {
    rawSentence,
    tree: [root],
    valid: validationErrors.length === 0,
    validationErrors: [...new Set(validationErrors)]
  }
}


function validatePhrase(value: any, field: string, errors: string[]): SentenceTreePhrase | null {
  const text = String(value?.text || '').trim()
  const label = String(value?.label || '').trim()
  if (!text) errors.push(`${field}缺少 text`)
  if (!(SENTENCE_TREE_COMPONENT_LABELS as readonly string[]).includes(label)) errors.push(`${field}使用了非法标签：${label || '(空)'}`)
  return text && label ? { text, label: label as ClauseComponentLabel } : null
}

function validateAiNode(value: any, isRoot: boolean, errors: string[], mainCounter: { count: number }): SentenceTreeClauseNode | null {
  if (!value || typeof value !== 'object') {
    errors.push('存在无效从句节点')
    return null
  }
  const type = String(value.type || '') as ClauseUnitType
  const allowedTypes: ClauseUnitType[] = ['主句', '定语从句', '状语从句', '主语从句', '宾语从句', '表语从句', '同位语从句']
  if (!allowedTypes.includes(type)) errors.push(`存在非法从句类型：${type || '(空)'}`)
  if (type === '主句') mainCounter.count += 1
  if (isRoot && type !== '主句') errors.push('根节点必须是主句')
  if (!isRoot && type === '主句') errors.push('从句节点不能标记为主句')
  const pattern = String(value.pattern || '') as BasicSentencePattern
  if (!['SV', 'SVO', 'SVP', 'SVOO', 'SVOC'].includes(pattern)) errors.push(`${type || '节点'}使用了非法句型：${pattern || '(空)'}`)
  const subject = validatePhrase(value.subject, `${type || '节点'}主语`, errors)
  const predicate = validatePhrase(value.predicate, `${type || '节点'}谓语`, errors)
  const object = value.object ? validatePhrase(value.object, `${type || '节点'}宾语`, errors) : undefined
  const indirectObject = value.indirectObject ? validatePhrase(value.indirectObject, `${type || '节点'}间接宾语`, errors) : undefined
  const directObject = value.directObject ? validatePhrase(value.directObject, `${type || '节点'}直接宾语`, errors) : undefined
  const predicative = value.predicative ? validatePhrase(value.predicative, `${type || '节点'}表语`, errors) : undefined
  const objectComplement = value.objectComplement ? validatePhrase(value.objectComplement, `${type || '节点'}宾语补足语`, errors) : undefined
  const adverbial = value.adverbial ? validatePhrase(value.adverbial, `${type || '节点'}状语`, errors) : undefined
  if (!subject) errors.push(`${type || '节点'}缺少主语`)
  if (!predicate) errors.push(`${type || '节点'}缺少谓语`)
  if (!isRoot && !String(value.guideWord || '').trim() && !['定语从句', '宾语从句'].includes(type)) errors.push(`${type || '从句'}缺少引导词`)
  if (pattern === 'SVO' && !object) errors.push(`${type || '节点'}的 SVO 缺少宾语`)
  if (pattern === 'SVP' && (!predicative || object || indirectObject || directObject)) errors.push(`${type || '节点'}的 SVP 表语配置不合法`)
  if (pattern === 'SVOO' && (!indirectObject || !directObject || object)) errors.push(`${type || '节点'}的 SVOO 宾语配置不合法`)
  if (pattern === 'SVOC' && (!object || !objectComplement)) errors.push(`${type || '节点'}的 SVOC 宾补配置不合法`)
  const children = Array.isArray(value.children)
    ? value.children.map((child: any) => validateAiNode(child, false, errors, mainCounter)).filter(Boolean) as SentenceTreeClauseNode[]
    : []
  const nodeErrors = errors.filter((_, index) => index >= errors.length - 20 && false)
  return {
    id: String(value.id || `node-${mainCounter.count}-${Math.random().toString(36).slice(2, 6)}`),
    type,
    subtype: value.subtype ? String(value.subtype) : undefined,
    guideWord: value.guideWord ? String(value.guideWord) : undefined,
    pattern,
    subject: subject || { text: '', label: '主语' },
    predicate: predicate || { text: '', label: '谓语' },
    object: object || undefined,
    indirectObject: indirectObject || undefined,
    directObject: directObject || undefined,
    predicative: predicative || undefined,
    objectComplement: objectComplement || undefined,
    adverbial: adverbial || undefined,
    children,
    valid: nodeErrors.length === 0,
    validationErrors: []
  }
}

export function validateSentenceTreePayload(payload: any, rawSentence: string): SentenceTreeAnalysis {
  const errors: string[] = []
  if (!payload || typeof payload !== 'object') throw new Error('模型返回内容不是 JSON 对象')
  if (!Array.isArray(payload.tree) || payload.tree.length !== 1) errors.push('tree 必须且只能包含一个主句根节点')
  const mainCounter = { count: 0 }
  const root = Array.isArray(payload.tree) && payload.tree[0]
    ? validateAiNode(payload.tree[0], true, errors, mainCounter)
    : null
  if (mainCounter.count !== 1) errors.push(`主句数量必须为 1，实际为 ${mainCounter.count}`)
  const tree = root ? [root] : []
  return {
    rawSentence,
    tree,
    valid: errors.length === 0 && Boolean(root),
    validationErrors: [...new Set(errors)]
  }
}
