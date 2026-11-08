import * as pdfjsLib from 'pdfjs-dist'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { detectMetadata, type ExamPaperType, type ExamSeason } from './exam-import'

const require = createRequire(import.meta.url)
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.mjs')).href

export type SegmentContentType = 'paper' | 'answer' | 'analysis' | 'listening_script'
export type SegmentStatus = 'auto_confirmed' | 'pending_review' | 'confirmed' | 'rejected'

export interface SemanticRangeRect {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
}

export interface SemanticRangeInfo {
  coordinateSpace: 'normalized-0-1'
  source: 'native_text' | 'manual_ocr' | 'manual_rect'
  textStart: number
  textEnd: number
  rects: SemanticRangeRect[]
  lineCount: number
}

export interface SemanticSegment {
  contentType: SegmentContentType
  pageNo: number
  rangeInfo: SemanticRangeInfo
  textExcerpt: string
  confidence: number
  status: SegmentStatus
  segmentOrder: number
  setNo: number | null
  audioSlot: 'A' | 'B' | null
}

export interface SemanticMetadata {
  examType: ExamPaperType
  year: number | null
  session: ExamSeason
  setNo: number | null
  audioSlot: 'A' | 'B' | null
  confidence: number
  examTypeConfidence: number
  yearConfidence: number
  sessionConfidence: number
  sources: string[]
}

export interface ExamPdfSemanticAnalysis {
  filePath: string
  fileName: string
  title: string
  fileHash: string
  fileSize: number
  pageCount: number
  metadata: SemanticMetadata
  segments: SemanticSegment[]
  requiresReview: boolean
  warnings: string[]
}

interface TextLine {
  pageNo: number
  text: string
  rect: SemanticRangeRect
  top: number
  left: number
}

function normalizeText(value: string): string {
  return String(value || '').replace(/[\u3000\s]+/g, ' ').trim()
}

function parseSetNo(value: string): number | null {
  const text = normalizeText(value).normalize('NFKC')
  const digit = text.match(/(?:第\s*([1-6])\s*套|卷\s*([1-6])|set\s*([1-6]))/i)
  if (digit) return Number(digit[1] || digit[2] || digit[3])
  const chinese = text.match(/第\s*([一二三四五六])\s*套|卷\s*([一二三四五六])/)
  if (!chinese) return null
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }
  return map[chinese[1] || chinese[2]] || null
}

function detectAudioSlot(value: string): 'A' | 'B' | null {
  const text = normalizeText(value)
  const match = text.match(/(?:听力|音频|录音)\s*([AB])|([AB])\s*(?:卷|音频|听力)/i)
  const valueFound = match?.[1] || match?.[2]
  return valueFound ? valueFound.toUpperCase() as 'A' | 'B' : null
}

function strongHeadingRole(text: string): { role: SegmentContentType; confidence: number } | null {
  const value = normalizeText(text)
  if (!value || value.length > 90) return null
  if (/^(?:听力原文|录音原文|听力材料|listening\s+script|transcript)\b/i.test(value)) return { role: 'listening_script', confidence: 0.96 }
  if (/^(?:参考)?答案(?:\s*与?\s*(?:解析|详解))?\s*$|^answer\s*key\b|^keys?\s*$/i.test(value)) return { role: 'answer', confidence: 0.94 }
  if (/^(?:答案)?(?:解析|详解)(?:\s|:|：|$)|^explanation\b/i.test(value)) return { role: 'analysis', confidence: 0.92 }
  if (isPaperSectionHeading(value)) return { role: 'paper', confidence: 0.9 }
  return null
}

function isPaperSectionHeading(text: string): boolean {
  const value = normalizeText(text)
  if (!value || value.length > 160) return false
  return /^(?:part\s+[ivx]+|section\s+[a-c]|passage\s+(?:\d+|[ivx]+)|directions\s*:|reading\s+comprehension|listening\s+comprehension|questions?\s+\d+(?:\s*(?:-|–|to)\s*\d+)?\s+(?:are|is|based|following|choose))/i.test(value)
}

function isQuestionStem(text: string): boolean {
  const value = normalizeText(text)
  return /^(?:question\s+\d+\s*[:：.]?|\d{1,3}\s*[.、-]\s*)\s*/i.test(value)
}

function isOptionLine(text: string): boolean {
  return /^(?:[A-D]\s*[).、:：]|[A-D]\s+)\s*\S/i.test(normalizeText(text))
}

function startsQuestionWithOptions(lines: TextLine[], lineIndex: number): boolean {
  if (!isQuestionStem(lines[lineIndex]?.text || '')) return false
  const following = lines.slice(lineIndex + 1, lineIndex + 5)
  const optionCount = following.reduce((count, line) => count + (normalizeText(line.text).match(/(?:^|\s)[A-D]\s*[).、:：]/g)?.length || 0), 0)
  return optionCount >= 2
}

function inferLineRole(text: string): { role: SegmentContentType; confidence: number } {
  const value = normalizeText(text)
  if (!value) return { role: 'paper', confidence: 0.3 }
  if (/^\d{1,3}[.\-、]\s*[A-D][).]?/i.test(value) || /\b[A-D][).]\s+\S/i.test(value)) return { role: 'paper', confidence: 0.76 }
  if (/^(?:答案|参考答案|answer\s*key|keys?)\b/i.test(value) || /^\d{1,3}\s*[-:：]\s*[A-D,\s]+$/i.test(value)) return { role: 'answer', confidence: 0.72 }
  if (/^(?:解析|详解)\b|^explanation\b/i.test(value)) return { role: 'analysis', confidence: 0.7 }
  if (/^(?:m|w|man|woman|speaker|narrator)\s*[:：]/i.test(value)) return { role: 'listening_script', confidence: 0.67 }
  return { role: 'paper', confidence: 0.44 }
}

function looksLikeStandaloneAnalysisFile(fileName: string): boolean {
  const name = basename(fileName)
  const hasPaperHint = /(?:真题|试卷|试题|paper|exam)/i.test(name)
  const hasSolutionHint = /(?:解析|详解|分析|analysis|solution)/i.test(name)
  const hasAnswerOnlyHint = /(?:答案|answer)/i.test(name) && !hasPaperHint
  if (!hasSolutionHint && !hasAnswerOnlyHint) return false
  // Keep roles only when the filename explicitly marks a combined paper-plus-analysis document.
  const explicitCombined = /(?:真题|试卷|试题).{0,10}(?:\+|＋|&|与|及|含|附).{0,10}(?:答案|解析|详解)|(?:答案|解析|详解).{0,10}(?:\+|＋|&|与|及).{0,10}(?:真题|试卷|试题)/i.test(name)
  return !explicitCombined
}

type DocumentRole = 'paper' | 'analysis' | 'mixed'

interface DocumentRoleProfile {
  role: DocumentRole
  confidence: number
  paperScore: number
  analysisScore: number
  reasons: string[]
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length
}

function inferDocumentRole(fileName: string, fullText: string, pages: TextLine[][]): DocumentRoleProfile {
  const name = basename(fileName)
  const lines = pages.flat()
  let paperScore = 0
  let analysisScore = 0
  const reasons: string[] = []

  const nameAnalysis = /(?:解析|详解|答案|分析|solution|answer|explanation)/i.test(name)
  const namePaper = /(?:真题|试题|试卷|paper|exam)/i.test(name)
  // “真题+答案/解析”属于混合文档，文件名同时命中两类关键词时不能被降级成纯解析。
  const nameCombined = /(?:真题|试题|试卷).{0,12}(?:\+|＋|&|与|及|含|附|带).{0,12}(?:答案|解析|详解)|(?:答案|解析|详解).{0,12}(?:\+|＋|&|与|及).{0,12}(?:真题|试题|试卷)/i.test(name)
  if (nameCombined) reasons.push('文件名标记为真题与答案/解析混合文档')
  if (nameAnalysis) { analysisScore += 4; reasons.push('文件名含解析/答案特征') }
  if (namePaper) { paperScore += 2; reasons.push('文件名含真题/试卷特征') }

  const sectionHeadings = lines.filter(line => isPaperSectionHeading(line.text)).length
  const questionStems = lines.filter(line => isQuestionStem(line.text)).length
  const optionLines = lines.filter(line => isOptionLine(line.text)).length
  paperScore += Math.min(4, sectionHeadings * 0.45)
  paperScore += Math.min(3, questionStems * 0.12)
  paperScore += Math.min(2.5, optionLines * 0.07)
  paperScore += Math.min(2, countMatches(fullText, /(?:writing|reading\s+comprehension|listening\s+comprehension|translation|directions\s*:|section\s+[a-c]|part\s+[ivx]+)/gi) * 0.25)

  const analysisTerms = countMatches(fullText, /(?:参考答案|答案速查|【答案】|【解析】|解析\s*[:：]|详解\s*[:：]|定位句|解题思路|正确选项|干扰项|篇章导读|参考译文|句意解析|考点分析)/g)
  analysisScore += Math.min(5, analysisTerms * 0.32)
  analysisScore += Math.min(2, countMatches(fullText, /(?:答案|解析|译文|定位|干扰项|正确项)/g) * 0.08)
  if (sectionHeadings) reasons.push(`检测到 ${sectionHeadings} 个试卷栏目标题`)
  if (questionStems && optionLines) reasons.push(`检测到 ${questionStems} 个题号和 ${optionLines} 个选项行`)
  if (analysisTerms) reasons.push(`检测到 ${analysisTerms} 个解析/答案标记`)

  if (nameCombined) return { role: 'mixed', confidence: 0.9, paperScore, analysisScore, reasons }
  if (nameAnalysis && !namePaper) return { role: 'analysis', confidence: 0.94, paperScore, analysisScore, reasons }
  if (namePaper && !nameAnalysis) return { role: 'paper', confidence: 0.9, paperScore, analysisScore, reasons }
  if (analysisScore >= paperScore + 1.2) {
    return { role: 'analysis', confidence: Math.min(0.96, 0.72 + (analysisScore - paperScore) * 0.045), paperScore, analysisScore, reasons }
  }
  if (paperScore >= analysisScore + 1.2) {
    return { role: 'paper', confidence: Math.min(0.94, 0.7 + (paperScore - analysisScore) * 0.045), paperScore, analysisScore, reasons }
  }
  return { role: 'mixed', confidence: 0.72, paperScore, analysisScore, reasons }
}

function normalizeDocumentSegments(fileName: string, segments: SemanticSegment[], profile: DocumentRoleProfile): SemanticSegment[] {
  const standaloneAnalysis = profile.role === 'analysis' || looksLikeStandaloneAnalysisFile(fileName)
  return segments.map(segment => {
    let contentType = segment.contentType
    if (contentType === 'answer' || contentType === 'listening_script') contentType = 'analysis'
    if (standaloneAnalysis && contentType === 'paper') contentType = 'analysis'
    if (!standaloneAnalysis && profile.role === 'paper' && contentType === 'analysis' && segment.confidence < 0.8 && !analysisFileHint(fileName)) {
      contentType = 'paper'
    }
    return {
      ...segment,
      contentType,
      confidence: Math.max(segment.confidence, standaloneAnalysis ? Math.max(profile.confidence, 0.88) : 0.8),
      status: 'auto_confirmed'
    }
  })
}

function autoConfirmSegmentRoles(segments: SemanticSegment[], profile: DocumentRoleProfile): SemanticSegment[] {
  return segments.map(segment => {
    const fallbackRole = profile.role === 'analysis' ? 'analysis' : profile.role === 'paper' ? 'paper' : segment.contentType
    const contentType = segment.confidence < 0.8 && profile.role !== 'mixed' ? fallbackRole : segment.contentType
    return {
      ...segment,
      contentType,
      confidence: Math.max(segment.confidence, profile.role === 'mixed' ? 0.76 : Math.max(0.8, profile.confidence)),
      status: 'auto_confirmed'
    }
  })
}

function analysisFileHint(fileName: string): boolean {
  return /(?:解析|答案|详解|分析|solution|answer|explanation)/i.test(basename(fileName))
}

function closeRoleSegment(segment: any | null, output: SemanticSegment[], orderRef: { value: number }, pageNo: number): void {
  if (!segment || !segment.lines.length) return
  const text = segment.lines.map((line: TextLine) => line.text).join('\n').trim()
  if (!text) return
  output.push({
    contentType: segment.role,
    pageNo,
    rangeInfo: {
      coordinateSpace: 'normalized-0-1',
      source: 'native_text',
      textStart: segment.textStart,
      textEnd: segment.textStart + text.length,
      rects: segment.lines.map((line: TextLine) => line.rect),
      lineCount: segment.lines.length
    },
    textExcerpt: text.slice(0, 50000),
    confidence: Math.max(0, Math.min(1, segment.confidence)),
    status: 'auto_confirmed',
    segmentOrder: orderRef.value++,
    setNo: parseSetNo(text),
    audioSlot: detectAudioSlot(text)
  })
}

function itemRect(item: any, viewport: any): SemanticRangeRect {
  const height = Math.max(1, Number(item.height) || 8)
  const x = Math.max(0, Number(item.transform?.[4]) || 0) / viewport.width
  const top = Math.max(0, viewport.height - ((Number(item.transform?.[5]) || 0) + height)) / viewport.height
  return {
    pageNo: 1,
    x,
    y: top,
    width: Math.max(0.001, (Number(item.width) || 1) / viewport.width),
    height: Math.max(0.001, height / viewport.height)
  }
}

function rectsOverlap(left: SemanticRangeRect, right: SemanticRangeRect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

function buildLinesFromItems(items: any[], pageNo: number, viewport: any): TextLine[] {
  const boxes = items
    .filter(item => normalizeText(String(item.str || '')))
    .map(item => {
      const rect = itemRect(item, viewport)
      return { text: normalizeText(String(item.str || '')), rect, top: rect.y }
    })
    .sort((left, right) => left.top - right.top || left.rect.x - right.rect.x)

  const rows: Array<Array<{ text: string; rect: SemanticRangeRect; top: number }>> = []
  for (const box of boxes) {
    let row = rows.find(candidate => Math.abs((candidate[0]?.top || 0) - box.top) <= 0.012)
    if (!row) {
      row = []
      rows.push(row)
    }
    row.push(box)
  }

  const lines: TextLine[] = []
  for (const row of rows) {
    row.sort((left, right) => left.rect.x - right.rect.x)
    let cluster: typeof row = []
    const flush = () => {
      if (!cluster.length) return
      const minX = Math.min(...cluster.map(item => item.rect.x))
      const minY = Math.min(...cluster.map(item => item.rect.y))
      const maxX = Math.max(...cluster.map(item => item.rect.x + item.rect.width))
      const maxY = Math.max(...cluster.map(item => item.rect.y + item.rect.height))
      const text = cluster.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim()
      if (text) lines.push({ pageNo, text, rect: { pageNo, x: minX, y: minY, width: maxX - minX, height: maxY - minY }, top: minY, left: minX })
      cluster = []
    }
    for (const box of row) {
      if (cluster.length) {
        const previous = cluster[cluster.length - 1]
        if (box.rect.x - (previous.rect.x + previous.rect.width) > 0.11) flush()
      }
      cluster.push(box)
    }
    flush()
  }
  return lines.sort((left, right) => left.top - right.top || left.left - right.left)
}

async function extractPdfLines(buffer: ArrayBuffer): Promise<{ pageCount: number; pages: TextLine[][] }> {
  const document = await pdfjsLib.getDocument({ data: buffer, useSystemFonts: true }).promise
  const pages: TextLine[][] = []
  try {
    for (let pageNo = 1; pageNo <= document.numPages; pageNo++) {
      const page = await document.getPage(pageNo)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      pages.push(buildLinesFromItems(content.items as any[], pageNo, viewport))
    }
    return { pageCount: document.numPages, pages }
  } finally {
    await document.destroy()
  }
}

function buildSegments(pages: TextLine[][], profile: DocumentRoleProfile): SemanticSegment[] {
  const output: SemanticSegment[] = []
  const orderRef = { value: 1 }
  let globalOffset = 0
  let activeRole: SegmentContentType | null = profile.role === 'analysis' ? 'analysis' : profile.role === 'paper' ? 'paper' : null
  let activeConfidence = profile.confidence
  const rolePrior: SegmentContentType | null = profile.role === 'analysis' ? 'analysis' : profile.role === 'paper' ? 'paper' : null

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageNo = pageIndex + 1
    let current: any = null
    const pageLines = pages[pageIndex]
    for (let lineIndex = 0; lineIndex < pageLines.length; lineIndex++) {
      const line = pageLines[lineIndex]
      const heading = strongHeadingRole(line.text)
      const inferred = inferLineRole(line.text)
      const roleBeforeBoundary = current?.role || activeRole
      const paperBoundary = isPaperSectionHeading(line.text)
        || (profile.role !== 'analysis' && roleBeforeBoundary !== 'analysis' && startsQuestionWithOptions(pageLines, lineIndex))
      const currentRole = current?.role || activeRole
      const currentConfidence = current?.confidence || activeConfidence
      const nextRole = heading?.role
        || (paperBoundary ? 'paper' : currentRole || rolePrior || inferred.role)
      const confidence = heading?.confidence
        || (paperBoundary ? 0.86 : currentRole ? currentConfidence : rolePrior ? Math.max(0.82, profile.confidence) : inferred.confidence)
      if (!current || current.role !== nextRole) {
        closeRoleSegment(current, output, orderRef, pageNo)
        current = { role: nextRole, confidence, textStart: globalOffset, lines: [line] }
      } else {
        current.lines.push(line)
        current.confidence = Math.max(current.confidence, confidence)
      }
      globalOffset += line.text.length + 1
    }
    closeRoleSegment(current, output, orderRef, pageNo)
    if (current?.lines.length) {
      activeRole = current.role
      activeConfidence = current.confidence
    }
  }
  return output
}

function inferMetadata(text: string, fileName: string): SemanticMetadata {
  const headText = text.slice(0, 20000)
  const textMeta = detectMetadata(headText)
  const fileMeta = detectMetadata(fileName)
  // Explicit metadata in a well-organized filename is authoritative. PDF text is the fallback,
  // because reading passages may mention unrelated exam names, years, or months.
  const examType = fileMeta.paperType !== 'unknown' ? fileMeta.paperType : textMeta.paperType
  const year = fileMeta.year ?? textMeta.year
  const session = fileMeta.season !== 'unknown' ? fileMeta.season : textMeta.season
  const setNo = parseSetNo(fileName) ?? parseSetNo(headText)
  const audioSlot = detectAudioSlot(fileName) ?? detectAudioSlot(headText)
  const examTypeConfidence = fileMeta.paperType !== 'unknown' ? 0.92 : textMeta.paperType !== 'unknown' ? 0.9 : 0
  const yearConfidence = fileMeta.year != null ? 0.9 : textMeta.year != null ? 0.86 : 0
  const sessionConfidence = fileMeta.season !== 'unknown' ? 0.9 : textMeta.season !== 'unknown' ? 0.86 : 0
  const sources: string[] = []
  if (fileMeta.paperType !== 'unknown' || fileMeta.year != null || fileMeta.season !== 'unknown') sources.push('文件名优先')
  if (textMeta.paperType !== 'unknown' || textMeta.year != null || textMeta.season !== 'unknown') sources.push('PDF 内部文本兜底')
  return {
    examType,
    year,
    session,
    setNo,
    audioSlot,
    confidence: Math.min(examTypeConfidence, yearConfidence, sessionConfidence),
    examTypeConfidence,
    yearConfidence,
    sessionConfidence,
    sources
  }
}

export async function analyzeExamPdf(filePath: string): Promise<ExamPdfSemanticAnalysis> {
  const stat = statSync(filePath)
  const buffer = readFileSync(filePath)
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const extracted = await extractPdfLines(arrayBuffer)
  const lines = extracted.pages.flat()
  const fullText = lines.map(line => line.text).join('\n')
  const metadata = inferMetadata(fullText, basename(filePath))
  const profile = inferDocumentRole(basename(filePath), fullText, extracted.pages)
  let segments = autoConfirmSegmentRoles(normalizeDocumentSegments(basename(filePath), buildSegments(extracted.pages, profile), profile), profile)

  if (!segments.length && extracted.pageCount > 0) {
    // 无文字层的扫描版 PDF 仍可依据文件名与页面排版特征推断文档角色。
    // 解析类文件绝不能因为未识别出文字片段而回落成真题卷。
    segments = [{
      contentType: profile.role === 'analysis' ? 'analysis' : 'paper',
      pageNo: 1,
      rangeInfo: {
        coordinateSpace: 'normalized-0-1',
        source: 'native_text',
        textStart: 0,
        textEnd: 0,
        rects: [{ pageNo: 1, x: 0.05, y: 0.05, width: 0.9, height: 0.9 }],
        lineCount: 0
      },
      textExcerpt: '',
      confidence: Math.max(0.72, profile.confidence),
      status: 'auto_confirmed',
      segmentOrder: 1,
      setNo: metadata.setNo,
      audioSlot: metadata.audioSlot
    }]
  }

  return {
    filePath,
    fileName: basename(filePath),
    title: basename(filePath).replace(/\.pdf$/i, ''),
    fileHash,
    fileSize: stat.size,
    pageCount: extracted.pageCount,
    metadata,
    segments,
    requiresReview: metadata.confidence < 0.75,
    warnings: lines.length === 0
      ? [`PDF 没有可读取的原生文字；系统已按${profile.role === 'analysis' ? '解析' : '真题题干'}自动归类，可稍后用OCR或标注工具修正`]
      : profile.confidence < 0.72 ? [`文档角色自动判定置信度较低，已按${profile.role === 'analysis' ? '解析' : profile.role === 'paper' ? '真题题干' : '混合文档'}自动归类`] : []
  }
}

export async function extractTextInPdfRects(filePath: string, pageNo: number, rects: SemanticRangeRect[]): Promise<string> {
  const buffer = readFileSync(filePath)
  const load = await pdfjsLib.getDocument({
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    useSystemFonts: true
  }).promise
  try {
    if (pageNo < 1 || pageNo > load.numPages) throw new Error('PDF 页码超出范围')
    const page = await load.getPage(pageNo)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const lines = buildLinesFromItems(content.items as any[], pageNo, viewport)
    return lines
      .filter(line => rects.some(rect => rectsOverlap(line.rect, rect)))
      .sort((left, right) => left.top - right.top || left.left - right.left)
      .map(line => line.text)
      .join('\n')
  } finally {
    await load.destroy()
  }
}
