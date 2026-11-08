import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, relative } from 'node:path'
import { detectMetadata, inspectExamPdf, type ExamPaperType, type ExamSeason } from './exam-import'
import { EXAM_AUDIO_EXTENSIONS, EXAM_TEXT_EXTENSIONS } from './exam-folder'

export type ExamResourceRole = 'text' | 'audio' | 'analysis'

export interface ExamResourceCandidate {
  id: string
  path: string
  fileName: string
  relativePath: string
  directory: string
  role: ExamResourceRole
  mimeType: string
  fileSize: number
  fileHash: string
  pageCount: number | null
  paperType: ExamPaperType
  year: number | null
  season: ExamSeason
  setNo: number | null
  normalizedStem: string
}

export interface ExamResourceDraft {
  id: string
  title: string
  paperType: ExamPaperType
  year: number | null
  season: ExamSeason
  setNo: number | null
  textFileId: string
  audioFileId: string
  analysisFileId: string
  confidence: number
  warnings: string[]
}

export interface ExamResourceScanResult {
  rootPath: string
  files: ExamResourceCandidate[]
  drafts: ExamResourceDraft[]
  unmatchedFileIds: string[]
  warnings: string[]
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac'
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
}

function parseSetNo(value: string): number | null {
  const text = String(value || '').normalize('NFKC')
  const digitMatch = text.match(/(?:第\s*([1-9]\d*)\s*套|卷\s*([1-9]\d*)|set\s*([1-9]\d*))/i)
  if (digitMatch) return Number(digitMatch[1] || digitMatch[2] || digitMatch[3])
  const chineseMatch = text.match(/第\s*([一二三四五六七八九十])\s*套|卷\s*([一二三四五六七八九十])/)
  if (!chineseMatch) return null
  const source = chineseMatch[1] || chineseMatch[2]
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return map[source] || null
}

function classifyRole(fileName: string): ExamResourceRole {
  const extension = extname(fileName).toLowerCase()
  if (EXAM_AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (/(?:解析|答案|详解|答案速查|analysis|answer|solution|key\b)/i.test(fileName)) return 'analysis'
  return 'text'
}

function normalizedStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/(?:真题|试题|解析|答案|详解|答案速查|听力|音频|录音|文本|原文|analysis|answer|solution|listening|audio|transcript)/gi, ' ')
    .replace(/(?:四级|六级|考研英语|考研|雅思|托福|CET[\s_-]*[46]|IELTS|TOEFL|POSTGRAD|KAOYAN)/gi, ' ')
    .replace(/20\d{2}/g, ' ')
    .replace(/(?:0?[1-9]|1[0-2])\s*月|(?:0?6|12)(?=\D|$)|(?:第\s*)?[一二三四1-9]\s*套|set\s*\d+/gi, ' ')
    .replace(/[年月]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function metadataKey(candidate: Pick<ExamResourceCandidate, 'paperType' | 'year' | 'season'>): string {
  return `${candidate.paperType}|${candidate.year ?? 'unknown'}|${candidate.season}`
}

function commonPrefixDepth(left: string, right: string): number {
  const a = normalizePath(left).split('/').filter(Boolean)
  const b = normalizePath(right).split('/').filter(Boolean)
  let depth = 0
  while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1
  return depth
}

function tokenSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return 0.75
  const leftTokens = new Set(left.match(/[\p{L}\p{N}]{2,}/gu) || [])
  const rightTokens = new Set(right.match(/[\p{L}\p{N}]{2,}/gu) || [])
  if (!leftTokens.size || !rightTokens.size) return 0
  let overlap = 0
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1
  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

function safeTitle(candidate: ExamResourceCandidate): string {
  const source = candidate.fileName.replace(/\.[^.]+$/, '').trim()
  return source || candidate.fileName
}

async function buildCandidate(pathValue: string, rootPath: string): Promise<ExamResourceCandidate> {
  const stat = statSync(pathValue)
  const fileName = basename(pathValue)
  const extension = extname(fileName).toLowerCase()
  const fileHash = createHash('sha256').update(readFileSync(pathValue)).digest('hex')
  const relativePath = rootPath && existsSync(rootPath) ? relative(rootPath, pathValue) : fileName
  const searchText = `${dirname(relativePath)} ${fileName}`.replace(/\\/g, ' ')
  const pathMetadata = detectMetadata(searchText)
  let paperType = pathMetadata.paperType
  let year = pathMetadata.year
  let season = pathMetadata.season
  let pageCount: number | null = null
  let setNo = parseSetNo(searchText)

  if (extension === '.pdf' && (year == null || paperType === 'unknown')) {
    try {
      const inspected = await inspectExamPdf(pathValue)
      year = year ?? inspected.year
      season = season === 'unknown' ? inspected.season : season
      paperType = paperType === 'unknown' ? inspected.paperType : paperType
      pageCount = inspected.pageCount
      setNo = setNo ?? parseSetNo(inspected.title)
    } catch {}
  }

  return {
    id: pathValue,
    path: pathValue,
    fileName,
    relativePath,
    directory: normalizePath(dirname(relativePath)),
    role: classifyRole(fileName),
    mimeType: MIME_TYPES[extension] || 'application/octet-stream',
    fileSize: stat.size,
    fileHash,
    pageCount,
    paperType,
    year,
    season,
    setNo,
    normalizedStem: normalizedStem(fileName)
  }
}

function scoreCandidate(candidate: ExamResourceCandidate, draft: ExamResourceDraft, textCandidate: ExamResourceCandidate, metaDraftCount: number): number {
  let score = 0
  const sameMetadata = metadataKey(candidate) === metadataKey(textCandidate)
  if (candidate.normalizedStem.length >= 2 && textCandidate.normalizedStem.length >= 2 && candidate.normalizedStem === textCandidate.normalizedStem) score += 100
  if (candidate.setNo != null && candidate.setNo === draft.setNo && sameMetadata) score += 75
  if (candidate.directory && candidate.directory === textCandidate.directory) score += 40
  if (sameMetadata) score += 25
  if (metaDraftCount === 1 && sameMetadata) score += 25
  const prefix = commonPrefixDepth(candidate.directory, textCandidate.directory)
  if (prefix > 0) score += Math.min(20, prefix * 6)
  if (prefix >= 2 && metaDraftCount === 1) score += 20
  score += Math.round(tokenSimilarity(candidate.normalizedStem, textCandidate.normalizedStem) * 15)
  return Math.min(100, score)
}

export async function scanExamResourceFiles(filePaths: string[], rootPath = ''): Promise<ExamResourceScanResult> {
  const warnings: string[] = []
  const uniquePaths = [...new Set(filePaths.filter(filePath => existsSync(filePath) && statSync(filePath).isFile()))]
  const files: ExamResourceCandidate[] = []
  for (const filePath of uniquePaths) {
    try {
      const extension = extname(filePath).toLowerCase()
      if (!EXAM_TEXT_EXTENSIONS.has(extension) && !EXAM_AUDIO_EXTENSIONS.has(extension)) continue
      files.push(await buildCandidate(filePath, rootPath))
    } catch (error) {
      warnings.push(`${basename(filePath)} 读取失败：${(error as Error).message}`)
    }
  }

  const textFiles = files.filter(file => file.role === 'text')
  const drafts: ExamResourceDraft[] = textFiles.map((textFile, index) => ({
    id: `draft-${index + 1}-${textFile.fileHash.slice(0, 8)}`,
    title: safeTitle(textFile),
    paperType: textFile.paperType,
    year: textFile.year,
    season: textFile.season,
    setNo: textFile.setNo,
    textFileId: textFile.id,
    audioFileId: '',
    analysisFileId: '',
    confidence: 100,
    warnings: []
  }))

  const assigned = new Set(textFiles.map(file => file.id))
  for (const candidate of files.filter(file => file.role !== 'text')) {
    const scored = drafts.map(draft => {
      const textCandidate = files.find(file => file.id === draft.textFileId)!
      const metaDraftCount = drafts.filter(item =>
        item.paperType === candidate.paperType
        && item.year === candidate.year
        && item.season === candidate.season
      ).length
      return { draft, score: scoreCandidate(candidate, draft, textCandidate, metaDraftCount) }
    }).sort((left, right) => right.score - left.score)

    const available = scored.filter(entry => candidate.role === 'audio'
      ? !entry.draft.audioFileId
      : !entry.draft.analysisFileId)
    const top = available[0]
    const second = available[1]
    if (!top || top.score < 45) {
      warnings.push(`${candidate.fileName} 未能稳定匹配到真题文本`)
      continue
    }
    if (second && second.score === top.score) {
      warnings.push(`${candidate.fileName} 存在多个同等候选，需要手动确认`)
      continue
    }
    if (candidate.role === 'audio') top.draft.audioFileId = candidate.id
    else top.draft.analysisFileId = candidate.id
    top.draft.confidence = Math.min(top.draft.confidence, top.score)
    assigned.add(candidate.id)
  }

  for (const draft of drafts) {
    if (!draft.year) draft.warnings.push('年份未识别')
    if (draft.paperType === 'unknown') draft.warnings.push('考试类型未识别')
    if (!draft.audioFileId) draft.warnings.push('未匹配音频')
    if (!draft.analysisFileId) draft.warnings.push('未匹配解析')
    if (draft.confidence < 80) draft.warnings.push('自动匹配置信度较低，请核对文件')
  }

  const unmatchedFileIds = files.filter(file => !assigned.has(file.id)).map(file => file.id)
  return { rootPath, files, drafts, unmatchedFileIds, warnings }
}

export function resourceStatus(roles: ExamResourceRole[]): string {
  const hasText = roles.includes('text')
  const hasAudio = roles.includes('audio')
  const hasAnalysis = roles.includes('analysis')
  if (hasText && hasAudio && hasAnalysis) return 'complete'
  if (hasText && hasAudio) return 'missing_analysis'
  if (hasText && hasAnalysis) return 'missing_audio'
  if (hasText) return 'text_only'
  return 'incomplete'
}

export function fingerprintResources(resources: Array<{ role: ExamResourceRole; fileHash: string }>): string {
  if (!resources.length) return ''
  const value = resources
    .slice()
    .sort((left, right) => left.role.localeCompare(right.role))
    .map(resource => `${resource.role}:${resource.fileHash}`)
    .join('|')
  return createHash('sha256').update(value).digest('hex')
}
