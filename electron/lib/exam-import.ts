import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { extractPdfText } from './pdf-parser'

export type ExamSeason = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | 'unknown'
export type ExamPaperType = 'basic-primary' | 'basic-junior' | 'basic-senior' | 'CET4' | 'CET6' | 'POSTGRAD' | 'IELTS' | 'TOEFL' | 'unknown'

export const examPaperTypeValues: ExamPaperType[] = [
  'basic-primary',
  'basic-junior',
  'basic-senior',
  'CET4',
  'CET6',
  'POSTGRAD',
  'IELTS',
  'TOEFL'
]

export function isExamPaperType(value: unknown): value is ExamPaperType {
  return examPaperTypeValues.includes(String(value) as ExamPaperType)
}

export function isBasicExamPaperType(value: ExamPaperType): boolean {
  return value === 'basic-primary' || value === 'basic-junior' || value === 'basic-senior'
}

export function normalizeExamSeason(value: unknown): ExamSeason {
  const text = String(value ?? '')
  return /^(0[1-9]|1[0-2])$/.test(text) ? text as ExamSeason : 'unknown'
}

export function examSeasonLabel(value: ExamSeason): string {
  return value === 'unknown' ? '场次未分类' : `${Number(value)}月`
}

export function examSeasonFolder(value: ExamSeason): string {
  if (value === '06') return '06-上半年'
  if (value === '12') return '12-下半年'
  return value === 'unknown' ? '未分类' : `${value}-${Number(value)}月`
}
export type ExamDetectionSource = 'filename' | 'pdf-text' | 'ocr' | 'manual' | 'unknown'

export interface ExamMetadataDetection {
  year: number | null
  season: ExamSeason
  paperType: ExamPaperType
  detectionSource: ExamDetectionSource
}

export interface ExamPdfInspection extends ExamMetadataDetection {
  filePath: string
  fileName: string
  title: string
  fileHash: string
  fileSize: number
  pageCount: number
  needsOcr: boolean
  textExcerpt: string
  warning: string
}

function normalizeText(value: string): string {
  return String(value || '').replace(/[\u3000\s]+/g, ' ').trim()
}

function validYear(value: unknown): number | null {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return null
  return year
}

type MonthNumber = Exclude<ExamSeason, 'unknown'>
interface MonthDefinition {
  value: MonthNumber
  chinese: string
  english: string
}

const monthDefinitions: MonthDefinition[] = [
  { value: '12', chinese: '十二', english: 'dec(?:ember)?' },
  { value: '11', chinese: '十一', english: 'nov(?:ember)?' },
  { value: '10', chinese: '十', english: 'oct(?:ober)?' },
  { value: '09', chinese: '九', english: 'sep(?:t(?:ember)?)?' },
  { value: '08', chinese: '八', english: 'aug(?:ust)?' },
  { value: '07', chinese: '七', english: 'jul(?:y)?' },
  { value: '06', chinese: '六', english: 'jun(?:e)?' },
  { value: '05', chinese: '五', english: 'may' },
  { value: '04', chinese: '四', english: 'apr(?:il)?' },
  { value: '03', chinese: '三', english: 'mar(?:ch)?' },
  { value: '02', chinese: '二', english: 'feb(?:ruary)?' },
  { value: '01', chinese: '一', english: 'jan(?:uary)?' }
]
const englishMonthPattern = monthDefinitions.map(item => item.english).join('|')

function seasonFromMonth(value: string | number): ExamSeason {
  return String(Number(value)).padStart(2, '0') as ExamSeason
}

export function detectSeason(value: string): ExamSeason {
  const text = normalizeText(value)
  if (!text) return 'unknown'

  const datedMonth = text.match(/(?:^|[^0-9])(?:20\d{2})\s*(?:年\s*|[-_./]\s*|\s+)(0?[1-9]|1[0-2])(?=\s*月|[^0-9]|$)/i)
  if (datedMonth) return seasonFromMonth(datedMonth[1])

  for (const month of monthDefinitions) {
    if (new RegExp(`(?:^|[^0-9])0?${Number(month.value)}\\s*月`).test(text)) return month.value
    if (new RegExp(`${month.chinese}\\s*月`).test(text)) return month.value
    if (new RegExp(`\\b(?:${month.english})\\b`, 'i').test(text)) return month.value
  }

  if (/(?:下半年|冬季)/i.test(text)) return '12'
  if (/(?:上半年|夏季)/i.test(text)) return '06'
  return 'unknown'
}

export function detectPaperType(value: string): ExamPaperType {
  const text = normalizeText(value)
  if (!text) return 'unknown'
  if (/(?:小学|一年级|二年级|三年级|四年级|五年级|六年级|primary\s+school|elementary\s+school|basic-primary)/i.test(text)) return 'basic-primary'
  if (/(?:初中|初一|初二|初三|七年级|八年级|九年级|中考|junior\s+high|middle\s+school|basic-junior)/i.test(text)) return 'basic-junior'
  if (/(?:高中|高一|高二|高三|高考|senior\s+high|basic-senior)/i.test(text)) return 'basic-senior'
  if (/托福|TOEFL|Test\s+of\s+English\s+as\s+a\s+Foreign\s+Language/i.test(text)) return 'TOEFL'
  if (/雅思|IELTS|International\s+English\s+Language\s+Testing\s+System/i.test(text)) return 'IELTS'
  if (/考研|研究生入学考试|全国硕士研究生|POSTGRAD|KAOYAN/i.test(text)) return 'POSTGRAD'
  if (/(?:大学英语|英语)?六级|CET[\s_-]*6|CET6|Band\s*6|College\s+English\s+Test\s+Band\s*6/i.test(text)) return 'CET6'
  if (/(?:大学英语|英语)?四级|CET[\s_-]*4|CET4|Band\s*4|College\s+English\s+Test\s+Band\s*4/i.test(text)) return 'CET4'
  return 'unknown'
}

function detectYear(value: string): number | null {
  const text = normalizeText(value)
  if (!text) return null
  const monthPatterns = [
    /(20\d{2})\s*年\s*(?:0?[1-9]|1[0-2])\s*月/,
    new RegExp(`\\b(?:${englishMonthPattern})\\b[^0-9]{0,16}(20\\d{2})`, 'i'),
    new RegExp(`(20\\d{2})[^0-9]{0,16}\\b(?:${englishMonthPattern})\\b`, 'i'),
    /(20\d{2})[-_.年/\s](?:0?[1-9]|1[0-2])(?:[-_.月/\s]|$)/i
  ]
  for (const pattern of monthPatterns) {
    const match = text.match(pattern)
    const year = validYear(match?.[1])
    if (year) return year
  }

  const examPatterns = [
    /(?:CET[\s_-]*[46]|大学英语[四六]级|英语[四六]级|考研|雅思|托福|IELTS|TOEFL|小学|初中|高中|中考|高考|真题)[^0-9]{0,30}(20\d{2})/i,
    /(20\d{2})[^0-9]{0,30}(?:CET[\s_-]*[46]|大学英语[四六]级|英语[四六]级|考研|雅思|托福|IELTS|TOEFL|小学|初中|高中|中考|高考|真题)/i
  ]
  for (const pattern of examPatterns) {
    const match = text.match(pattern)
    const year = validYear(match?.[1])
    if (year) return year
  }

  const yearMatch = text.match(/\b20\d{2}\b/)
  if (yearMatch) return validYear(yearMatch[0])

  const shortYear = text.match(/(?:^|[^0-9])(2[0-9])\s*年\s*(?:0?[1-9]|1[0-2])\s*月/)
  return shortYear ? validYear(2000 + Number(shortYear[1])) : null
}

export function detectMetadata(value: string): ExamMetadataDetection {
  return {
    year: detectYear(value),
    season: detectSeason(value),
    paperType: detectPaperType(value),
    detectionSource: 'unknown'
  }
}

function mergeMetadata(primary: ExamMetadataDetection, fallback: ExamMetadataDetection, fallbackSource: ExamDetectionSource): ExamMetadataDetection {
  return {
    year: primary.year ?? fallback.year,
    season: primary.season !== 'unknown' ? primary.season : fallback.season,
    paperType: primary.paperType !== 'unknown' ? primary.paperType : fallback.paperType,
    detectionSource: primary.year ? 'filename' : fallback.year ? fallbackSource : 'unknown'
  }
}

export function detectOcrMetadata(fileName: string, ocrText: string): ExamMetadataDetection & { textExcerpt: string } {
  const filenameMeta = detectMetadata(fileName)
  const textMeta = detectMetadata(ocrText)
  const merged = mergeMetadata(filenameMeta, textMeta, 'ocr')
  if (!filenameMeta.year && textMeta.year) merged.detectionSource = 'ocr'
  return {
    ...merged,
    textExcerpt: normalizeText(ocrText).slice(0, 800)
  }
}

export async function inspectExamPdf(filePath: string): Promise<ExamPdfInspection> {
  if (extname(filePath).toLowerCase() !== '.pdf') throw new Error('仅支持 PDF 文件')
  const stat = statSync(filePath)
  const buffer = readFileSync(filePath)
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  const fileName = basename(filePath)
  const title = fileName.replace(/\.pdf$/i, '').trim() || fileName
  const filenameMeta = detectMetadata(fileName)

  let text = ''
  let pageCount = 0
  let warning = ''
  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    const extracted = await extractPdfText(arrayBuffer, 2)
    text = extracted.text
    pageCount = extracted.pageCount
  } catch (error) {
    warning = `PDF 文本读取失败：${(error as Error).message}`
  }

  const textMeta = detectMetadata(text)
  const metadata = mergeMetadata(filenameMeta, textMeta, 'pdf-text')
  return {
    ...metadata,
    filePath,
    fileName,
    title,
    fileHash,
    fileSize: stat.size,
    pageCount,
    needsOcr: metadata.year == null,
    textExcerpt: normalizeText(text).slice(0, 800),
    warning
  }
}
