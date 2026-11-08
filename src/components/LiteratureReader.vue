<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import PdfInkToolRail from './PdfInkToolRail.vue'
import { PdfInkManager, parsePdfInkRecord, serializePdfInkStroke, type PdfInkStroke, type PdfInkTool } from '../lib/pdf-ink'
import { annotatePdfTextLayer, applyPdfTextSelection, pdfSelectionClientRect, pdfSelectionLooksLikeWholePage, pdfSelectionPointAt, type PdfSelectionPoint, type PdfSelectionResult } from '../lib/pdf-selection-engine'

const props = defineProps<{ item: any }>()
const appIconUrl = new URL('./assets/icon.png', window.location.href).href
const emit = defineEmits<{ (event: 'close'): void }>()

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', window.location.href).href

const readerRoot = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const pageShell = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const textLayer = ref<HTMLElement | null>(null)
const loading = ref(false)
const rendering = ref(false)
const textInteractionReady = ref(false)
const error = ref('')
const zoom = ref(1)
const pageNumber = ref(1)
const pageCount = ref(0)
const pageWidth = ref(0)
const pageHeight = ref(0)
const copied = ref(false)
const activeInkTool = ref<PdfInkTool>('select')
const inkColor = ref('#ef4444')
const inkLineWidth = ref(3)
const inkEraserSize = ref(20)
let inkManager: PdfInkManager | null = null
let selectionDrag: { anchor: PdfSelectionPoint; startX: number; startY: number; moved: boolean } | null = null
let activeTextSelection: PdfSelectionResult | null = null
let pendingSelectionPoint: PdfSelectionPoint | null = null
let selectionFrame = 0
const viewMode = ref<'single' | 'continuous'>(localStorage.getItem('vocflow-reader-mode') === 'single' ? 'single' : 'continuous')
const continuousHost = ref<HTMLElement | null>(null)
let pdfDocument: any = null
let renderToken = 0
let resizeTimer = 0
let resizeObserver: ResizeObserver | null = null
let continuousRenderToken = 0
let pageScrollTimer = 0
let continuousPageObserver: IntersectionObserver | null = null
let lastContinuousWidth = 0
let lastSingleWidth = 0
let continuousRenderingCount = 0
const continuousViews = new Map<number, {
  wrap: HTMLElement
  shell: HTMLElement
  canvas: HTMLCanvasElement
  textLayer: HTMLElement
  renderKey: string
  rendering: boolean
  token: number
}>()

const isPdf = computed(() => props.item?.file_type === 'pdf' && Boolean(props.item?.file_path))
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const paragraphs = computed<string[]>(() => {
  const text = String(props.item?.content_text || '').trim()
  if (!text) return []
  return text.split(/\n{2,}/).map(part => part.trim()).filter(Boolean).slice(0, 800)
})
const citationText = computed(() => {
  const authors = String(props.item?.authors || '').trim()
  const year = String(props.item?.year || '').trim()
  const title = String(props.item?.title || '').trim()
  const source = String(props.item?.source || '').trim()
  return [authors, year ? `(${year})` : '', title, source].filter(Boolean).join('. ')
})

function toBytes(value: any): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value?.buffer instanceof ArrayBuffer) return new Uint8Array(value.buffer)
  return new Uint8Array(Object.values(value || {}))
}

async function renderPage(): Promise<void> {
  if (viewMode.value !== 'single' || !isPdf.value || !pdfDocument || !stage.value || !canvas.value || !textLayer.value) return
  const token = ++renderToken
  rendering.value = true
  textInteractionReady.value = false
  error.value = ''
  try {
    const page = await pdfDocument.getPage(pageNumber.value)
    if (token !== renderToken) return
    const baseViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(360, stage.value.clientWidth - 76)
    const fitScale = Math.min(2.2, availableWidth / baseViewport.width)
    const viewport = page.getViewport({ scale: Math.max(0.25, fitScale * zoom.value) })
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    canvas.value.width = Math.floor(viewport.width * ratio)
    canvas.value.height = Math.floor(viewport.height * ratio)
    canvas.value.style.width = `${viewport.width}px`
    canvas.value.style.height = `${viewport.height}px`
    pageWidth.value = viewport.width
    pageHeight.value = viewport.height
    if (pageShell.value) {
      pageShell.value.style.width = `${viewport.width}px`
      pageShell.value.style.height = `${viewport.height}px`
      pageShell.value.dataset.pdfBaseWidth = String(baseViewport.width)
      pageShell.value.dataset.pdfBaseHeight = String(baseViewport.height)
      inkManager?.registerPage(pageNumber.value - 1, pageShell.value, pageNumber.value)
      inkManager?.setActivePage(pageNumber.value - 1)
    }
    const context = canvas.value.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法初始化 PDF 画布')
    await page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
    }).promise
    if (token !== renderToken) return
    const textContent = await page.getTextContent()
    if (token !== renderToken) return
    textLayer.value.innerHTML = ''
    textLayer.value.style.width = `${viewport.width}px`
    textLayer.value.style.height = `${viewport.height}px`
    const textDivs: HTMLSpanElement[] = []
    const task = pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: textLayer.value,
      viewport,
      textDivs,
      isOffscreenCanvasSupported: true
    })
    await task.promise
    annotatePdfTextLayer(textLayer.value, textContent.items, textDivs, pageNumber.value)
    if (token === renderToken) textInteractionReady.value = true
  } catch (renderError) {
    if (token === renderToken) error.value = (renderError as Error).message || 'PDF 页面渲染失败'
  } finally {
    if (token === renderToken) rendering.value = false
  }
}

function captureContinuousAnchor(): { page: number; ratio: number } {
  const host = continuousHost.value
  const stageElement = stage.value
  if (!host || !stageElement || !continuousViews.size) return { page: pageNumber.value, ratio: 0 }
  const stageTop = stageElement.getBoundingClientRect().top
  let closest = pageNumber.value
  let closestDistance = Number.POSITIVE_INFINITY
  let closestRatio = 0
  for (const [page, view] of continuousViews) {
    const rect = view.wrap.getBoundingClientRect()
    const distance = Math.abs(rect.top - stageTop)
    if (distance < closestDistance) {
      closestDistance = distance
      closest = page
      closestRatio = Math.min(1, Math.max(0, (stageTop - rect.top) / Math.max(1, rect.height)))
    }
  }
  return { page: closest, ratio: closestRatio }
}

function restoreContinuousAnchor(anchor: { page: number; ratio: number }): void {
  const view = continuousViews.get(anchor.page)
  const stageElement = stage.value
  if (!view || !stageElement) return
  const stageTop = stageElement.getBoundingClientRect().top
  const pageTop = view.wrap.getBoundingClientRect().top - stageTop + stageElement.scrollTop
  stageElement.scrollTop = Math.max(0, pageTop + view.wrap.offsetHeight * anchor.ratio)
}

function observeContinuousPages(): void {
  continuousPageObserver?.disconnect()
  continuousPageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const page = Number((entry.target as HTMLElement).dataset.pageNumber || 0)
      if (page) void renderContinuousPage(page)
    }
  }, { root: stage.value, rootMargin: '900px 0px' })
  for (const view of continuousViews.values()) continuousPageObserver.observe(view.wrap)
}

async function buildContinuousPages(token: number): Promise<void> {
  if (!isPdf.value || !pdfDocument || !stage.value || !continuousHost.value) return
  const host = continuousHost.value
  const anchor = captureContinuousAnchor()
  continuousPageObserver?.disconnect()
  inkManager?.resetPages()
  host.innerHTML = ''
  continuousViews.clear()
  const fragment = document.createDocumentFragment()
  for (let number = 1; number <= pageCount.value; number += 1) {
    if (token !== continuousRenderToken) return
    const page = await pdfDocument.getPage(number)
    const baseViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(360, stage.value.clientWidth - 76)
    const fitScale = Math.min(2.2, availableWidth / baseViewport.width)
    const viewport = page.getViewport({ scale: Math.max(0.25, fitScale * zoom.value) })
    const wrapper = document.createElement('section')
    wrapper.dataset.pageNumber = String(number)
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;margin:0 auto 24px;'
    const label = document.createElement('div')
    label.className = 'continuous-page-label'
    label.textContent = `第 ${number} 页`
    const shell = document.createElement('div')
    shell.className = 'continuous-pdf-page'
    shell.dataset.annotationPage = String(number)
    shell.dataset.pdfBaseWidth = String(baseViewport.width)
    shell.dataset.pdfBaseHeight = String(baseViewport.height)
    shell.style.cssText = `position:relative;flex-shrink:0;width:${viewport.width}px;height:${viewport.height}px;background:#fff;box-shadow:0 8px 30px rgba(44,36,32,.16);overflow:hidden;`
    const pageCanvas = document.createElement('canvas')
    pageCanvas.style.display = 'block'
    pageCanvas.width = Math.max(1, Math.floor(viewport.width))
    pageCanvas.height = Math.max(1, Math.floor(viewport.height))
    pageCanvas.style.width = `${viewport.width}px`
    pageCanvas.style.height = `${viewport.height}px`
    const pageTextLayer = document.createElement('div')
    pageTextLayer.className = 'vocflow-pdf-text-layer'
    pageTextLayer.style.width = `${viewport.width}px`
    pageTextLayer.style.height = `${viewport.height}px`
    shell.appendChild(pageCanvas)
    shell.appendChild(pageTextLayer)
    inkManager?.registerPage(number - 1, shell, number)
    wrapper.appendChild(label)
    wrapper.appendChild(shell)
    fragment.appendChild(wrapper)
    continuousViews.set(number, {
      wrap: wrapper,
      shell,
      canvas: pageCanvas,
      textLayer: pageTextLayer,
      renderKey: '',
      rendering: false,
      token: 0
    })
  }
  if (token !== continuousRenderToken) return
  host.appendChild(fragment)
  lastContinuousWidth = stage.value.clientWidth
  await nextTick()
  observeContinuousPages()
  restoreContinuousAnchor(anchor)
  renderNearbyContinuousPages()
}

async function relayoutContinuousPages(token: number): Promise<void> {
  if (!pdfDocument || !continuousViews.size || !stage.value) return
  const anchor = captureContinuousAnchor()
  for (const [number, view] of continuousViews) {
    if (token !== continuousRenderToken) return
    const page = await pdfDocument.getPage(number)
    const baseViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(360, stage.value.clientWidth - 76)
    const fitScale = Math.min(2.2, availableWidth / baseViewport.width)
    const viewport = page.getViewport({ scale: Math.max(0.25, fitScale * zoom.value) })
    view.shell.dataset.pdfBaseWidth = String(baseViewport.width)
    view.shell.dataset.pdfBaseHeight = String(baseViewport.height)
    view.shell.style.width = `${viewport.width}px`
    view.shell.style.height = `${viewport.height}px`
    view.canvas.style.width = `${viewport.width}px`
    view.canvas.style.height = `${viewport.height}px`
    view.textLayer.style.width = `${viewport.width}px`
    view.textLayer.style.height = `${viewport.height}px`
    const key = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
    if (view.renderKey !== key) view.renderKey = ''
  }
  lastContinuousWidth = stage.value.clientWidth
  await nextTick()
  restoreContinuousAnchor(anchor)
  renderNearbyContinuousPages()
}

function renderNearbyContinuousPages(): void {
  const stageElement = stage.value
  if (!stageElement) return
  const stageRect = stageElement.getBoundingClientRect()
  for (const [number, view] of continuousViews) {
    const rect = view.wrap.getBoundingClientRect()
    if (rect.bottom >= stageRect.top - 900 && rect.top <= stageRect.bottom + 900) void renderContinuousPage(number)
  }
}

async function renderContinuousPage(number: number): Promise<void> {
  const view = continuousViews.get(number)
  if (!view || view.rendering || !pdfDocument || !stage.value) return
  view.rendering = true
  continuousRenderingCount += 1
  rendering.value = true
  const token = ++view.token
  try {
    const page = await pdfDocument.getPage(number)
    const baseViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(360, stage.value.clientWidth - 76)
    const fitScale = Math.min(2.2, availableWidth / baseViewport.width)
    const viewport = page.getViewport({ scale: Math.max(0.25, fitScale * zoom.value) })
    view.shell.dataset.pdfBaseWidth = String(baseViewport.width)
    view.shell.dataset.pdfBaseHeight = String(baseViewport.height)
    const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
    if (view.renderKey === renderKey) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const replacement = document.createElement('canvas')
    replacement.width = Math.max(1, Math.floor(viewport.width * ratio))
    replacement.height = Math.max(1, Math.floor(viewport.height * ratio))
    replacement.style.width = `${viewport.width}px`
    replacement.style.height = `${viewport.height}px`
    replacement.style.display = 'block'
    replacement.style.visibility = 'hidden'
    view.shell.insertBefore(replacement, view.canvas)
    const context = replacement.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法初始化 PDF 画布')
    await page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
    }).promise
    if (token !== view.token || continuousRenderToken < 0) {
      replacement.remove()
      return
    }
    view.canvas.remove()
    replacement.style.visibility = ''
    view.canvas = replacement
    view.shell.style.width = `${viewport.width}px`
    view.shell.style.height = `${viewport.height}px`
    view.textLayer.style.width = `${viewport.width}px`
    view.textLayer.style.height = `${viewport.height}px`
    const textContent = await page.getTextContent()
    if (token !== view.token) return
    const textDivs: HTMLSpanElement[] = []
    view.textLayer.innerHTML = ''
    await pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: view.textLayer,
      viewport,
      textDivs,
      isOffscreenCanvasSupported: true
    }).promise
    annotatePdfTextLayer(view.textLayer, textContent.items, textDivs, number)
    if (number === pageNumber.value) textInteractionReady.value = true
    view.renderKey = renderKey
  } catch (renderError) {
    if (token === view.token) error.value = (renderError as Error).message || 'PDF 连续页面渲染失败'
  } finally {
    view.rendering = false
    continuousRenderingCount = Math.max(0, continuousRenderingCount - 1)
    rendering.value = continuousRenderingCount > 0
  }
}

async function renderContinuousPages(): Promise<void> {
  if (!isPdf.value || !pdfDocument || !stage.value || !continuousHost.value) return
  const token = ++continuousRenderToken
  error.value = ''
  if (!continuousViews.size || continuousViews.size !== pageCount.value) {
    await buildContinuousPages(token)
  } else {
    await relayoutContinuousPages(token)
  }
}

function scrollToContinuousPage(number: number): void {
  const target = continuousHost.value?.querySelector(`[data-page-number="${number}"]`) as HTMLElement | null
  target?.scrollIntoView({ block: 'start', behavior: 'auto' })
}

function handleReaderScroll(): void {
  if (viewMode.value !== 'continuous' || !stage.value) return
  if (pageScrollTimer) window.clearTimeout(pageScrollTimer)
  pageScrollTimer = window.setTimeout(() => {
    const host = continuousHost.value
    const stageElement = stage.value
    if (!host || !stageElement) return
    const stageTop = stageElement.getBoundingClientRect().top
    let closest = pageNumber.value
    let closestDistance = Number.POSITIVE_INFINITY
    host.querySelectorAll<HTMLElement>('[data-page-number]').forEach(page => {
      const distance = Math.abs(page.getBoundingClientRect().top - stageTop)
      if (distance < closestDistance) {
        closestDistance = distance
        closest = Number(page.dataset.pageNumber || 1)
      }
    })
    pageNumber.value = closest
    textInteractionReady.value = Boolean(continuousViews.get(closest)?.textLayer.querySelector('span'))
    inkManager?.setActivePage(closest - 1)
  }, 80)
}

async function refreshPageView(): Promise<void> {
  if (!isPdf.value) return
  await nextTick()
  if (viewMode.value === 'continuous') await renderContinuousPages()
  else await renderPage()
}

async function setViewMode(mode: 'single' | 'continuous'): Promise<void> {
  if (viewMode.value === mode) return
  viewMode.value = mode
  localStorage.setItem('vocflow-reader-mode', mode)
  continuousRenderToken += 1
  continuousPageObserver?.disconnect()
  continuousViews.clear()
  await refreshPageView()
  if (mode === 'continuous') scrollToContinuousPage(pageNumber.value)
  else if (stage.value) stage.value.scrollTop = 0
}
async function loadPdf(): Promise<void> {
  if (!isPdf.value) return
  loading.value = true
  textInteractionReady.value = false
  error.value = ''
  try {
    const bytes = await window.cet4Api.readLiteratureFile(Number(props.item.id))
    const assetBase = new URL('./assets/pdfjs/', window.location.href).href
    pdfDocument = await pdfjsLib.getDocument({
      data: toBytes(bytes),
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      useSystemFonts: true
    }).promise
    pageCount.value = pdfDocument.numPages
    pageNumber.value = 1
    await nextTick()
    await refreshPageView()
  } catch (loadError) {
    error.value = (loadError as Error).message || 'PDF 打开失败'
  } finally {
    loading.value = false
  }
}

async function goPage(next: number): Promise<void> {
  const target = Math.max(1, Math.min(pageCount.value || 1, next))
  pageNumber.value = target
  textInteractionReady.value = viewMode.value === 'continuous'
    ? Boolean(continuousViews.get(target)?.textLayer.querySelector('span'))
    : false
  inkManager?.setActivePage(target - 1)
  if (viewMode.value === 'continuous') scrollToContinuousPage(target)
  else await renderPage()
}

function changeZoom(delta: number): void {
  zoom.value = Math.min(2.4, Math.max(0.5, Number((zoom.value + delta).toFixed(2))))
  if (isPdf.value) void refreshPageView()
}

function resetZoom(): void {
  zoom.value = 1
  if (isPdf.value) void refreshPageView()
}

function setInkTool(tool: PdfInkTool): void {
  activeInkTool.value = tool
  inkManager?.setTool(tool)
  window.getSelection()?.removeAllRanges()
}

function setInkColor(color: string): void {
  inkColor.value = color
  inkManager?.setColor(color)
}

function setInkLineWidth(width: number): void {
  inkLineWidth.value = width
  inkManager?.setLineWidth(width)
}

function setInkEraserSize(size: number): void {
  inkEraserSize.value = size
  inkManager?.setEraserSize(size)
}

async function loadInkRecords(): Promise<void> {
  if (!inkManager) return
  try {
    const rows = await window.cet4Api.getLiteratureAnnotations(Number(props.item.id))
    const strokes = (Array.isArray(rows) ? rows : []).map(parsePdfInkRecord).filter((stroke): stroke is PdfInkStroke => Boolean(stroke))
    inkManager.setRecords(strokes)
  } catch (error) {
    console.error('加载手绘笔迹失败', error)
  }
}

function createInkManager(): void {
  inkManager = new PdfInkManager({
    onStrokeAdded: async stroke => {
      const result = await window.cet4Api.addLiteratureAnnotation({
        itemId: Number(props.item.id),
        annotationType: 'drawing',
        pageNumber: stroke.pageIndex + 1,
        color: stroke.color,
        geometry: serializePdfInkStroke(stroke)
      })
      return Number(result.annotation?.id) || undefined
    },
    onStrokeDeleted: async id => {
      await window.cet4Api.deleteLiteratureAnnotation(id)
    }
  })
  inkManager.setColor(inkColor.value)
  inkManager.setLineWidth(inkLineWidth.value)
  inkManager.setEraserSize(inkEraserSize.value)
  inkManager.setTool(activeInkTool.value)
}

function dispatchSentenceAnalysis(result: PdfSelectionResult): void {
  if (!readerRoot.value) return
  const text = result.text.replace(/\s+/g, ' ').trim()
  if (text.length < 8 || text.length > 1800 || pdfSelectionLooksLikeWholePage(result, readerRoot.value)) return
  const rect = pdfSelectionClientRect(result, readerRoot.value)
  if (!rect) return
  window.dispatchEvent(new CustomEvent('vocflow:analyze-selection', {
    detail: { text, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  }))
}

function handleSelectionMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || activeInkTool.value !== 'select' || !readerRoot.value) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('button, input, textarea, select')) return
  const anchor = pdfSelectionPointAt(readerRoot.value, event.clientX, event.clientY, 'before')
  if (!anchor) return
  selectionDrag = { anchor, startX: event.clientX, startY: event.clientY, moved: false }
  activeTextSelection = null
}

function pointerInsideReader(event: MouseEvent): boolean {
  const bounds = stage.value?.getBoundingClientRect()
  return Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom)
}

function handleSelectionMouseMove(event: MouseEvent): void {
  if (!selectionDrag || !readerRoot.value) return
  if (Math.hypot(event.clientX - selectionDrag.startX, event.clientY - selectionDrag.startY) < 2) return
  if (!pointerInsideReader(event)) return
  selectionDrag.moved = true
  const end = pdfSelectionPointAt(readerRoot.value, event.clientX, event.clientY, 'after')
  if (!end) return
  pendingSelectionPoint = end
  event.preventDefault()
  if (selectionFrame) return
  selectionFrame = window.requestAnimationFrame(() => {
    selectionFrame = 0
    if (!selectionDrag || !pendingSelectionPoint || !readerRoot.value) return
    activeTextSelection = applyPdfTextSelection(selectionDrag.anchor, pendingSelectionPoint, readerRoot.value, 'words')
  })
}

function handleSelectionMouseUp(event: MouseEvent): void {
  if (!selectionDrag || !readerRoot.value) return
  if (!selectionDrag.moved) {
    selectionDrag = null
    pendingSelectionPoint = null
    return
  }
  const end = pointerInsideReader(event)
    ? pdfSelectionPointAt(readerRoot.value, event.clientX, event.clientY, 'after') || pendingSelectionPoint
    : pendingSelectionPoint
  if (end) activeTextSelection = applyPdfTextSelection(selectionDrag.anchor, end, readerRoot.value, 'words')
  selectionDrag = null
  pendingSelectionPoint = null
  if (selectionFrame) {
    window.cancelAnimationFrame(selectionFrame)
    selectionFrame = 0
  }
  if (!activeTextSelection) return
  const result = activeTextSelection
  // The click event immediately following mouseup must pass the outside-click
  // guard before the analysis card is mounted.
  window.setTimeout(() => dispatchSentenceAnalysis(result), 30)
}

async function copyCitation(): Promise<void> {
  if (!citationText.value) return
  await navigator.clipboard.writeText(citationText.value)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1500)
}

async function openSource(): Promise<void> {
  if (props.item?.source_url) await window.cet4Api.openLiteratureUrl(props.item.source_url)
}

function handleReaderWheel(event: WheelEvent): void {
  const element = stage.value
  if (!element) return
  event.preventDefault()
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? element.clientHeight : 1
  element.scrollTop += event.deltaY * multiplier
}

function handleReaderDoubleClick(event: MouseEvent): void {
  if (event.button !== 0) return
  const target = event.target instanceof Element ? event.target : null
  const marked = target?.closest<HTMLElement>('[data-pdf-word]')
  let word = marked?.dataset.pdfWord || ''
  if (!word) {
    const selection = window.getSelection()?.toString().trim() || ''
    if (/^[A-Za-z][A-Za-z'’-]*$/.test(selection)) word = selection
  }
  word = word.replace(/^['’-]+|['’-]+$/g, '').trim()
  if (!word || !/[A-Za-z]/.test(word)) return
  window.dispatchEvent(new CustomEvent('vocflow:lookup-word', { detail: { word, x: event.clientX, y: event.clientY } }))
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (document.querySelector('.word-lookup-card, .sentence-lookup-card')) return
    emit('close')
    return
  }
  if (!isPdf.value) return
  if (event.key === 'ArrowLeft' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
    void goPage(pageNumber.value - 1)
  } else if (event.key === 'ArrowRight' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
    void goPage(pageNumber.value + 1)
  }
}

function scheduleRender(): void {
  if (!isPdf.value) return
  const width = stage.value?.clientWidth || 0
  if (viewMode.value === 'continuous' && Math.abs(width - lastContinuousWidth) < 10) return
  if (viewMode.value === 'single' && Math.abs(width - lastSingleWidth) < 8) return
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => void refreshPageView(), 160)
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('mousemove', handleSelectionMouseMove, true)
  window.addEventListener('mouseup', handleSelectionMouseUp, true)
  createInkManager()
  await window.cet4Api.touchLiterature(Number(props.item.id))
  await loadInkRecords()
  if (isPdf.value) {
    await nextTick()
    resizeObserver = new ResizeObserver(scheduleRender)
    if (stage.value) resizeObserver.observe(stage.value)
    await loadPdf()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mousemove', handleSelectionMouseMove, true)
  window.removeEventListener('mouseup', handleSelectionMouseUp, true)
  if (resizeTimer) window.clearTimeout(resizeTimer)
  if (pageScrollTimer) window.clearTimeout(pageScrollTimer)
  if (selectionFrame) window.cancelAnimationFrame(selectionFrame)
  resizeObserver?.disconnect()
  continuousPageObserver?.disconnect()
  renderToken += 1
  continuousRenderToken += 1
  for (const view of continuousViews.values()) view.token += 1
  inkManager?.destroy()
  inkManager = null
  pdfDocument?.destroy?.()
})
</script>

<template>
  <Teleport to="body">
    <div ref="readerRoot" class="literature-reader-overlay" data-vocflow-manual-lookup="true" @contextmenu.stop>
      <PdfInkToolRail :tool="activeInkTool" :color="inkColor" :line-width="inkLineWidth" :eraser-size="inkEraserSize" @tool="setInkTool" @color="setInkColor" @line-width="setInkLineWidth" @eraser-size="setInkEraserSize" />
      <header class="reader-toolbar">
        <div class="reader-brand"><img :src="appIconUrl" alt="VocFlow" /><div><strong>VocFlow</strong><small>文献阅读</small></div></div>
        <button class="reader-back" type="button" @click="emit('close')">‹ 返回</button>
        <div class="reader-title-group">
          <div class="reader-title">{{ item.title }}</div>
          <div class="reader-subtitle">
            {{ item.authors || '未知作者' }}
            <span v-if="item.year">· {{ item.year }}</span>
            <span v-if="item.source">· {{ item.source }}</span>
          </div>
        </div>
        <div class="reader-tools">
          <button type="button" title="缩小" @click="changeZoom(-0.1)">−</button>
          <button type="button" class="zoom-label" title="恢复适合宽度" @click="resetZoom">{{ zoomLabel }}</button>
          <button type="button" title="放大" @click="changeZoom(0.1)">＋</button>
          <span v-if="isPdf" class="reader-mode-switch">
            <button type="button" :class="{ active: viewMode === 'single' }" @click="setViewMode('single')">单页</button>
            <button type="button" :class="{ active: viewMode === 'continuous' }" @click="setViewMode('continuous')">连续</button>
          </span>
          <span v-if="isPdf" class="reader-page-controls">
            <button type="button" title="上一页" :disabled="pageNumber <= 1" @click="goPage(pageNumber - 1)">‹</button>
            <span>{{ pageNumber }} / {{ pageCount || '…' }}</span>
            <button type="button" title="下一页" :disabled="pageCount === 0 || pageNumber >= pageCount" @click="goPage(pageNumber + 1)">›</button>
          </span>
        </div>
      </header>

      <div class="reader-layout">
        <main ref="stage" class="reader-stage" :data-text-interaction-ready="textInteractionReady ? '1' : '0'" :data-no-sentence-lookup="activeInkTool !== 'select' ? '' : undefined" :data-word-lookup-ignore="activeInkTool !== 'select' ? '' : undefined" :class="{ 'article-mode': !isPdf, 'ink-active': activeInkTool !== 'select' }" @scroll.passive="handleReaderScroll" @mousedown="handleSelectionMouseDown">
          <div v-if="isPdf && !loading && !error && !textInteractionReady" class="text-interaction-mask"><span class="reader-spinner"></span><span>正在准备文字交互…</span></div>
          <div v-if="loading" class="reader-state">
            <span class="reader-spinner"></span>
            <span>正在加载文献…</span>
          </div>
          <div v-else-if="error && isPdf" class="reader-state error">
            <strong>PDF 加载失败</strong>
            <span>{{ error }}</span>
            <button type="button" @click="loadPdf">重试</button>
          </div>
          <template v-else-if="isPdf">
            <div v-if="viewMode === 'single'" class="pdf-reader-canvas">
              <div ref="pageShell" class="pdf-page-shell" :data-annotation-page="pageNumber" :style="{ width: pageWidth + 'px', height: pageHeight + 'px' }">
                <canvas ref="canvas"></canvas>
                <div ref="textLayer" class="textLayer vocflow-pdf-text-layer"></div>
                <div v-if="rendering" class="page-rendering-indicator">渲染中…</div>
              </div>
            </div>
            <div v-else ref="continuousHost" class="continuous-pages"></div>
            <div v-if="rendering && viewMode === 'continuous'" class="continuous-rendering-status">正在渲染全文…</div>
          </template>
          <article v-else class="reader-article" :style="{ fontSize: `${16 * zoom}px` }">
            <h1>{{ item.title }}</h1>
            <p v-if="item.authors" class="article-authors">{{ item.authors }}<span v-if="item.year"> · {{ item.year }}</span></p>
            <section v-if="item.abstract" class="article-abstract">
              <div class="article-section-label">摘要</div>
              <p>{{ item.abstract }}</p>
            </section>
            <section class="article-body">
              <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
              <p v-if="!paragraphs.length" class="article-empty">该文献没有保存可阅读的正文，请尝试打开原网页或重新抓取 PDF。</p>
            </section>
          </article>
        </main>

      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.literature-reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 90000;
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
  background: #e9e5df;
  font-family: var(--font-sans);
}
.reader-toolbar {
  position: relative;
  z-index: 40;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  min-height: 62px;
  padding: 9px 160px 9px 16px;
  border-bottom: 1px solid rgba(61, 51, 45, 0.13);
  background: rgba(255, 252, 247, 0.97);
  box-shadow: 0 2px 14px rgba(44, 36, 32, 0.08);
  backdrop-filter: blur(12px);
}
.reader-brand { flex-shrink:0; display:flex; align-items:center; gap:8px; padding-right:4px; }.reader-brand img { width:34px; height:34px; object-fit:contain; border-radius:9px; }.reader-brand div { display:flex; flex-direction:column; line-height:1.15; }.reader-brand strong { color:var(--text-primary); font-family:var(--font-display); font-size:13px; }.reader-brand small { margin-top:2px; color:var(--text-muted); font-size:8px; }
.reader-back {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid rgba(217, 119, 6, 0.2);
  border-radius: 9px;
  color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.06);
  font-size: 12px;
  font-weight: 700;
}
.reader-title-group { min-width: 160px; flex: 1; overflow: hidden; }
.reader-title {
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reader-subtitle {
  overflow: hidden;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reader-tools { position: relative; z-index: 45; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.reader-tools button {
  min-width: 30px;
  padding: 6px 9px;
  border: 1px solid rgba(61, 51, 45, 0.12);
  border-radius: 7px;
  color: var(--text-secondary);
  background: #fff;
  font-size: 11px;
}
.reader-tools button:hover:not(:disabled), .reader-tools button.active {
  border-color: rgba(217, 119, 6, 0.35);
  color: var(--accent-dim);
  background: rgba(217, 119, 6, 0.07);
}
.reader-tools button:disabled { opacity: 0.35; cursor: default; }
.reader-tools .zoom-label { min-width: 48px; color: var(--accent-dim); font-family: var(--font-mono); }
.reader-tools .tool-accent { color: #fff; background: var(--gradient-accent); border-color: transparent; font-weight: 700; }
.reader-mode-switch { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid rgba(61,51,45,.1); border-radius: 7px; background: rgba(61,51,45,.035); }
.reader-mode-switch button { min-width: 42px; padding: 5px 7px; border: 0; border-radius: 5px; background: transparent; }
.reader-mode-switch button.active { color: #fff; background: var(--accent); }
.reader-page-controls { display: flex; align-items: center; gap: 3px; padding: 0 4px; color: var(--text-muted); font-family: var(--font-mono); font-size: 10px; }

.reader-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.metadata-label {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}


.reader-stage {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  padding: 30px 34px 46px;
  background: #e9e5df;
  scroll-behavior: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
}
.reader-state {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.reader-state.error { color: var(--danger); }
.text-interaction-mask { position:absolute; inset:0; z-index:18; display:flex; align-items:center; justify-content:center; gap:9px; color:var(--text-secondary); background:rgba(233,229,223,.82); font-size:11px; pointer-events:all; }
.reader-state button { padding: 7px 14px; border-radius: 8px; color: #fff; background: var(--accent); }
.reader-spinner { width: 22px; height: 22px; border: 3px solid rgba(217,119,6,.18); border-top-color: var(--accent); border-radius: 50%; animation: reader-spin 700ms linear infinite; }
@keyframes reader-spin { to { transform: rotate(360deg); } }

.pdf-reader-canvas { min-width: min-content; display: flex; justify-content: center; }
.pdf-page-shell {
  position: relative;
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 8px 30px rgba(44, 36, 32, 0.16);
}
.pdf-page-shell canvas { position: relative; z-index: 1; display: block; }
.page-rendering-indicator {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 4;
  padding: 4px 7px;
  border-radius: 5px;
  color: #7c5a20;
  background: rgba(255, 248, 226, 0.92);
  font-size: 9px;
  pointer-events: none;
}

:global(.vocflow-pdf-text-layer) {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  opacity: 0.28;
  line-height: 1;
  text-align: initial;
  text-size-adjust: none;
  transform-origin: 0 0;
  forced-color-adjust: none;
}
:global(.vocflow-pdf-text-layer span), :global(.vocflow-pdf-text-layer br) {
  position: absolute;
  color: transparent;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
}
:global(.vocflow-pdf-text-layer ::selection) { background: rgba(37, 99, 235, 0.34); }
:global(.vocflow-pdf-text-layer .endOfContent) { display: block; position: absolute; inset: 100% 0 0; z-index: -1; cursor: default; user-select: none; }
:global(.vocflow-pdf-text-layer .endOfContent.active) { top: 0; }
.continuous-pages { width: 100%; min-width: min-content; padding-bottom: 30px; }
:global(.continuous-page-label) { align-self: stretch; padding: 0 6px; color: var(--text-muted); font-family: var(--font-mono); font-size: 9px; text-align: center; }
.continuous-rendering-status {
  position: sticky;
  top: 6px;
  z-index: 8;
  width: fit-content;
  margin: 0 auto 10px;
  padding: 6px 10px;
  border-radius: 999px;
  color: var(--accent-dim);
  background: rgba(255, 250, 241, 0.95);
  box-shadow: 0 4px 14px rgba(44, 36, 32, 0.12);
  font-size: 10px;
}

.reader-article {
  width: min(840px, 100%);
  margin: 0 auto;
  padding: 48px 58px 72px;
  color: #2d2723;
  background: #fffdf9;
  box-shadow: 0 8px 30px rgba(44, 36, 32, 0.13);
  line-height: 1.85;
  user-select: text;
}
.reader-article h1 { margin-bottom: 12px; font-family: var(--font-display); font-size: 1.7em; line-height: 1.35; }
.article-authors { color: #786d65; font-size: .78em; }
.article-abstract { margin-top: 30px; padding: 18px 20px; border-left: 3px solid rgba(217,119,6,.5); background: #fbf6ec; }
.article-section-label { margin-bottom: 7px; color: #b45309; font-size: .68em; font-weight: 800; letter-spacing: 1.2px; }
.article-abstract p { color: #5f554e; font-size: .88em; line-height: 1.75; }
.article-body { margin-top: 30px; }
.article-body p { margin-bottom: 1.1em; text-align: justify; }
.article-empty { color: var(--text-muted); font-size: .8em; text-align: center !important; }


@media (max-width: 850px) {
  .reader-toolbar { align-items: flex-start; flex-wrap: wrap; }
  .reader-title-group { flex-basis: calc(100% - 150px); }
  .reader-stage { padding: 18px 12px 32px; }
  .reader-article { padding: 30px 24px 50px; }
}
</style>



