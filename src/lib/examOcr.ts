import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', window.location.href).href

interface TesseractLoggerMessage {
  status?: string
  progress?: number
  workerId?: number
}

interface TesseractWorker {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>
  setParameters: (parameters: Record<string, string>) => Promise<unknown>
  terminate: () => Promise<unknown>
}

interface TesseractNamespace {
  createWorker: (languages: string, oem?: number, options?: Record<string, unknown>) => Promise<TesseractWorker>
}

declare global {
  interface Window {
    Tesseract?: TesseractNamespace
  }
}

let tesseractScriptPromise: Promise<TesseractNamespace> | null = null
let workerPromise: Promise<TesseractWorker> | null = null
let progressHandler: ((progress: number, status: string) => void) | null = null

function loadTesseract(): Promise<TesseractNamespace> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (tesseractScriptPromise) return tesseractScriptPromise
  tesseractScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = new URL('./assets/ocr/tesseract.min.js', window.location.href).href
    script.async = true
    script.onload = () => {
      if (window.Tesseract) resolve(window.Tesseract)
      else reject(new Error('OCR 引擎加载失败'))
    }
    script.onerror = () => reject(new Error('OCR 引擎文件缺失或无法加载'))
    document.head.appendChild(script)
  })
  return tesseractScriptPromise
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tesseract = await loadTesseract()
      const worker = await tesseract.createWorker('eng+chi_sim', 1, {
        workerPath: new URL('./assets/ocr/worker.min.js', window.location.href).href,
        corePath: new URL('./assets/ocr/tesseract-core-lstm.wasm.js', window.location.href).href,
        langPath: new URL('./assets/ocr/lang-data', window.location.href).href,
        gzip: true,
        workerBlobURL: false,
        logger: (message: TesseractLoggerMessage) => {
          const status = String(message.status || '正在识别')
          const progress = Number.isFinite(message.progress) ? Number(message.progress) : 0
          progressHandler?.(progress, status)
        }
      })
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1'
      })
      return worker
    })().catch(error => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}

export async function recognizeExamPdfFirstPage(
  filePath: string,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  progressHandler = onProgress ?? null
  onProgress?.(0, '正在读取 PDF 首页')
  const fileResult = await window.cet4Api.readExamPdf(filePath)
  if (!fileResult.success || !fileResult.data) throw new Error(fileResult.message || '无法读取 PDF 文件')

  const pdf = await pdfjsLib.getDocument({ data: fileResult.data }).promise
  try {
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2.4, 2400 / Math.max(baseViewport.width, baseViewport.height))
    const viewport = page.getViewport({ scale: Math.max(1.2, scale) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { willReadFrequently: false })
    if (!context) throw new Error('无法创建 OCR 画布')
    await page.render({ canvasContext: context, viewport }).promise
    onProgress?.(0, '正在启动本地 OCR')
    const worker = await getWorker()
    onProgress?.(0.05, '正在识别首页文字')
    const result = await worker.recognize(canvas)
    onProgress?.(1, '首页 OCR 完成')
    canvas.width = 0
    canvas.height = 0
    return String(result.data.text || '')
  } finally {
    await pdf.destroy()
  }
}

export async function terminateExamOcr(): Promise<void> {
  progressHandler = null
  if (!workerPromise) return
  const worker = await workerPromise.catch(() => null)
  workerPromise = null
  if (worker) await worker.terminate().catch(() => undefined)
}
