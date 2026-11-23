import { app } from 'electron'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import * as pdfjsLib from 'pdfjs-dist'

const require = createRequire(import.meta.url)
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.mjs')).href

/** One recognised text line, with geometry normalised to the page box (0..1). */
export interface OcrTextLine {
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface OcrPagePayload {
  success: boolean
  pageNo: number
  width: number
  height: number
  lines: OcrTextLine[]
  cached: boolean
  message?: string
}

interface CachedOcrPage {
  fileHash: string
  pageNo: number
  width: number
  height: number
  lines: OcrTextLine[]
  createdAt: string
}

const MAX_DOCUMENT_CACHE = 4
const documentCache = new Map<string, { doc: any; mtimeMs: number }>()
const pendingByHash = new Map<string, Promise<OcrPagePayload>>()

let ocrQueue: Promise<unknown> = Promise.resolve()
let tessWorker: any = null
let tessWorkerPromise: Promise<any> | null = null
let tessWorkerIdleTimer: ReturnType<typeof setTimeout> | null = null

/** Serialise OCR jobs: one wasm worker, one page at a time. */
function enqueueOcr<T>(task: () => Promise<T>): Promise<T> {
  const run = ocrQueue.then(task, task)
  ocrQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function ocrCacheRoot(): string {
  const dir = join(app.getPath('userData'), 'ocr-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function tessdataCacheRoot(): string {
  const dir = join(ocrCacheRoot(), 'tessdata')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Language data ships inside `@tesseract.js-data/*`. Unpacking the gzip once into userData
 * keeps tesseract.js fully offline: it finds `<cachePath>/<lang>.traineddata` and never fetches.
 */
function ensureTrainedData(): void {
  const cacheDir = tessdataCacheRoot()
  const packages: Record<string, string> = { chi_sim: '@tesseract.js-data/chi_sim', eng: '@tesseract.js-data/eng' }
  for (const [lang, pkg] of Object.entries(packages)) {
    const target = join(cacheDir, `${lang}.traineddata`)
    if (existsSync(target) && statSync(target).size > 1024 * 1024) continue
    const packageJson = require.resolve(`${pkg}/package.json`)
    const gz = join(dirname(packageJson), '4.0.0', `${lang}.traineddata.gz`)
    if (!existsSync(gz)) {
      throw new Error(`缺少 OCR 语言数据：${lang}（${gz}）`)
    }
    const unpacked = gunzipSync(readFileSync(gz))
    writeFileSync(target, unpacked)
    console.info(`[ocr] 解压语言包 ${lang}: ${unpacked.length} 字节`)
  }
}

async function getOcrWorker(): Promise<any> {
  if (tessWorker) {
    if (tessWorkerIdleTimer) {
      clearTimeout(tessWorkerIdleTimer)
      tessWorkerIdleTimer = null
    }
    return tessWorker
  }
  if (!tessWorkerPromise) {
    tessWorkerPromise = (async () => {
      ensureTrainedData()
      const module: any = await import('tesseract.js')
      const createWorker = module.createWorker || module.default?.createWorker
      if (typeof createWorker !== 'function') throw new Error('tesseract.js 未提供 createWorker')
      const worker = await createWorker(['chi_sim', 'eng'], 1, {
        cachePath: tessdataCacheRoot(),
        gzip: false,
        logger: () => undefined
      })
      tessWorker = worker
      return worker
    })()
    tessWorkerPromise = tessWorkerPromise.catch(error => {
      tessWorkerPromise = null
      throw error
    })
  }
  const worker = await tessWorkerPromise
  if (!tessWorker) tessWorker = worker
  return worker
}

function scheduleWorkerRelease(): void {
  if (tessWorkerIdleTimer) clearTimeout(tessWorkerIdleTimer)
  tessWorkerIdleTimer = setTimeout(() => {
    const worker = tessWorker
    tessWorker = null
    tessWorkerPromise = null
    tessWorkerIdleTimer = null
    if (worker) void worker.terminate().catch(() => undefined)
  }, 90_000)
}

function releaseWorkerNow(): void {
  const worker = tessWorker
  tessWorker = null
  tessWorkerPromise = null
  if (tessWorkerIdleTimer) {
    clearTimeout(tessWorkerIdleTimer)
    tessWorkerIdleTimer = null
  }
  if (worker) void worker.terminate().catch(() => undefined)
}

function cacheKeyFor(filePath: string, pageNo: number): { key: string; mtimeMs: number } {
  const stat = statSync(filePath)
  const key = createHash('sha1').update(`${filePath}|${stat.size}|${Math.round(stat.mtimeMs)}|${pageNo}`).digest('hex')
  return { key, mtimeMs: stat.mtimeMs }
}

/** Encode the decoded scan bitmap as 24-bit BMP, which tesseract.js decodes natively in Node. */
function encodeBmp24(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Buffer {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4
  const pixelBytes = rowSize * height
  const fileSize = 54 + pixelBytes
  const buffer = Buffer.alloc(fileSize)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(fileSize, 2)
  buffer.writeUInt32LE(54, 10)
  buffer.writeUInt32LE(40, 14)
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  buffer.writeUInt16LE(1, 26)
  buffer.writeUInt16LE(24, 28)
  buffer.writeUInt32LE(0, 30)
  buffer.writeUInt32LE(pixelBytes, 34)
  let offset = 54
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * width * 4
    let target = offset
    for (let x = 0; x < width; x++) {
      const source = rowStart + x * 4
      buffer[target] = rgba[source + 2]
      buffer[target + 1] = rgba[source + 1]
      buffer[target + 2] = rgba[source]
      target += 3
    }
    offset += rowSize
  }
  return buffer
}

function encodeGrayscale8(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): Buffer {
  const paletteSize = 256 * 4
  const rowSize = Math.floor((8 * width + 31) / 32) * 4
  const pixelBytes = rowSize * height
  const offset = 54 + paletteSize
  const buffer = Buffer.alloc(offset + pixelBytes)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(buffer.length, 2)
  buffer.writeUInt32LE(offset, 10)
  buffer.writeUInt32LE(40, 14)
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  buffer.writeUInt16LE(1, 26)
  buffer.writeUInt16LE(8, 28)
  buffer.writeUInt32LE(pixelBytes, 34)
  buffer.writeUInt32LE(256, 46)
  for (let i = 0; i < 256; i++) {
    const at = 54 + i * 4
    buffer[at] = i
    buffer[at + 1] = i
    buffer[at + 2] = i
    buffer[at + 3] = 0
  }
  for (let y = 0; y < height; y++) {
    const target = offset + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) buffer[target + x] = gray[y * width + x]
  }
  return buffer
}

function toBmp(image: { kind?: number; width: number; height: number; data: any }): Buffer | null {
  const { width, height, data } = image
  const kind = Number(image.kind)
  // kind 1 is a 1-bit-per-pixel stencil mask — never a page scan, and not decodable here.
  if (kind === 1) return null
  const channels = Math.max(1, Math.round(data.length / (width * height)))
  if (channels === 1) return encodeGrayscale8(data, width, height)
  if (channels === 3) {
    // Expand packed RGB into RGBA so the encoder only has one fast path.
    const rgba = new Uint8Array(width * height * 4)
    for (let i = 0, s = 0; i < rgba.length; i += 4, s += 3) {
      rgba[i] = data[s]
      rgba[i + 1] = data[s + 1]
      rgba[i + 2] = data[s + 2]
      rgba[i + 3] = 255
    }
    return encodeBmp24(rgba, width, height)
  }
  return encodeBmp24(data, width, height)
}

function readImageObject(page: any, name: string): Promise<any> {
  return new Promise(resolve => {
    let settled = false
    const done = (value: any) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      const maybe = page.objs.get(name, done)
      if (maybe) done(maybe)
    } catch {
      done(null)
    }
    // Defensive timeout: an operator-list image should resolve immediately once requested.
    setTimeout(() => done(null), 8_000)
  })
}

/** Pull the biggest raster embedded in the page — scanned exam PDFs are one full-page image. */
async function extractPageBitmap(page: any): Promise<{ bmp: Buffer; width: number; height: number } | null> {
  const ops = await page.getOperatorList()
  const { OPS } = pdfjsLib as any
  const candidates: Array<{ name?: string; inline?: any }> = []
  for (let index = 0; index < ops.fnArray.length; index++) {
    const fn = ops.fnArray[index]
    if (fn === OPS.paintImageXObject) {
      const name = ops.argsArray[index]?.[0]
      if (typeof name === 'string') candidates.push({ name })
    } else if (fn === OPS.paintInlineImageXObject) {
      const payload = ops.argsArray[index]?.[0]
      if (payload && payload.width && payload.height) candidates.push({ inline: payload })
    }
  }
  let best: { bmp: Buffer; width: number; height: number; area: number } | null = null
  for (const candidate of candidates) {
    const image = candidate.inline || (candidate.name ? await readImageObject(page, candidate.name) : null)
    if (!image || !image.width || !image.height) continue
    const area = image.width * image.height
    if (best && area <= best.area) continue
    try {
      const bmp = toBmp(image)
      if (bmp) best = { bmp, width: image.width, height: image.height, area }
    } catch {
      // Ignore exotic colour models; another operator may still hold a usable bitmap.
    }
  }
  return best ? { bmp: best.bmp, width: best.width, height: best.height } : null
}

/** chi_sim emits a space between every CJK glyph; drop those, keep CJK↔latin gaps. */
function normalizeOcrText(raw: string): string {
  return String(raw || '')
    .replace(/\u3000/g, ' ')
    .replace(/([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])\s+(?=[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim()
}

interface RawLine {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  confidence?: number
}

function collectLines(data: any): RawLine[] {
  const blocks = Array.isArray(data?.blocks) ? data.blocks : []
  const lines: RawLine[] = []
  for (const block of blocks) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        if (line?.bbox) lines.push(line)
      }
    }
  }
  return lines
}

function buildLines(rawLines: RawLine[], imageWidth: number, imageHeight: number): OcrTextLine[] {
  const output: OcrTextLine[] = []
  for (const line of rawLines) {
    const text = normalizeOcrText(line.text)
    if (!text || !/\S/.test(text)) continue
    if (Number(line.confidence ?? 0) < 20 && text.replace(/[^\p{L}\p{N}]/gu, '').length < 3) continue
    const { x0, y0, x1, y1 } = line.bbox
    const width = Math.max(1, x1 - x0)
    const height = Math.max(1, y1 - y0)
    if (width < 3 || height < 3) continue
    output.push({
      text,
      x: Math.min(1, Math.max(0, x0 / imageWidth)),
      y: Math.min(1, Math.max(0, y0 / imageHeight)),
      width: Math.min(1, Math.max(0, width / imageWidth)),
      height: Math.min(1, Math.max(0, height / imageHeight)),
      confidence: Number(line.confidence ?? 0)
    })
  }
  return output.sort((a, b) => (a.y - b.y) || (a.x - b.x))
}

async function getDocument(filePath: string): Promise<any> {
  const stat = statSync(filePath)
  const cached = documentCache.get(filePath)
  if (cached && Math.abs(cached.mtimeMs - stat.mtimeMs) < 1) return cached.doc
  if (cached) {
    documentCache.delete(filePath)
    void cached.doc.destroy().catch(() => undefined)
  }
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(readFileSync(filePath)), isEvalSupported: false } as any).promise
  documentCache.set(filePath, { doc, mtimeMs: stat.mtimeMs })
  while (documentCache.size > MAX_DOCUMENT_CACHE) {
    const oldest = documentCache.keys().next().value
    if (oldest === undefined) break
    const entry = documentCache.get(oldest)
    documentCache.delete(oldest)
    if (entry) void entry.doc.destroy().catch(() => undefined)
  }
  return doc
}

async function recognizePage(filePath: string, pageNo: number): Promise<OcrPagePayload> {
  const doc = await getDocument(filePath)
  const page = await doc.getPage(pageNo)
  const bitmap = await extractPageBitmap(page)
  if (!bitmap) {
    return { success: false, pageNo, width: 0, height: 0, lines: [], cached: false, message: '该页没有可识别的位图' }
  }
  const worker = await getOcrWorker()
  const result = await worker.recognize(bitmap.bmp, {}, { text: true, blocks: true })
  const lines = buildLines(collectLines(result?.data), bitmap.width, bitmap.height)
  scheduleWorkerRelease()
  if (!lines.length) {
    return { success: false, pageNo, width: bitmap.width, height: bitmap.height, lines: [], cached: false, message: '未识别到文字' }
  }
  return { success: true, pageNo, width: bitmap.width, height: bitmap.height, lines, cached: false }
}

export async function ocrPdfPage(filePath: string, pageNo: number): Promise<OcrPagePayload> {
  const normalizedPage = Math.max(1, Math.floor(Number(pageNo) || 1))
  if (!filePath || !existsSync(filePath)) {
    return { success: false, pageNo: normalizedPage, width: 0, height: 0, lines: [], cached: false, message: 'PDF 文件不存在' }
  }
  let key = ''
  try {
    key = cacheKeyFor(filePath, normalizedPage).key
  } catch (error) {
    return { success: false, pageNo: normalizedPage, width: 0, height: 0, lines: [], cached: false, message: (error as Error).message }
  }
  const cacheFile = join(ocrCacheRoot(), `${key}.json`)
  if (existsSync(cacheFile)) {
    try {
      const parsed = JSON.parse(readFileSync(cacheFile, 'utf8')) as CachedOcrPage
      if (Array.isArray(parsed.lines) && parsed.lines.length) {
        return { success: true, pageNo: normalizedPage, width: parsed.width, height: parsed.height, lines: parsed.lines, cached: true }
      }
    } catch {
      // Corrupted cache entry: fall through and redo the page.
    }
  }
  const inflight = pendingByHash.get(key)
  if (inflight) return inflight
  const job = enqueueOcr(async () => {
    try {
      const payload = await recognizePage(filePath, normalizedPage)
      if (payload.success && payload.lines.length) {
        try {
          const entry: CachedOcrPage = {
            fileHash: key,
            pageNo: normalizedPage,
            width: payload.width,
            height: payload.height,
            lines: payload.lines,
            createdAt: new Date().toISOString()
          }
          writeFileSync(cacheFile, JSON.stringify(entry), 'utf8')
        } catch (error) {
          console.warn('[ocr] 写入缓存失败:', error)
        }
      }
      return payload
    } catch (error) {
      return {
        success: false,
        pageNo: normalizedPage,
        width: 0,
        height: 0,
        lines: [],
        cached: false,
        message: (error as Error)?.message || 'OCR 失败'
      } as OcrPagePayload
    } finally {
      pendingByHash.delete(key)
    }
  })
  pendingByHash.set(key, job)
  return job
}

/** Called on app shutdown so the wasm worker does not keep the process alive. */
export function disposePdfOcr(): void {
  releaseWorkerNow()
  for (const entry of documentCache.values()) void entry.doc.destroy().catch(() => undefined)
  documentCache.clear()
}
