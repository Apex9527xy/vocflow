<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import { PdfInkManager, parsePdfInkRecord, serializePdfInkStroke, type PdfInkStroke, type PdfInkTool } from '../../lib/pdf-ink'
import { annotatePdfTextLayer, applyPdfTextSelection, clearPdfTextSelection, pdfSelectionClientRect, pdfSelectionLooksLikeWholePage, pdfSelectionPointAt, type PdfSelectionPoint, type PdfSelectionResult } from '../../lib/pdf-selection-engine'

const props = defineProps<{
  collectionId: number
  paperId: number
  segments: ExamContentSegmentRecord[]
  role: 'paper' | 'analysis'
  label: string
  zoom: number
  activeInkTool: PdfInkTool
  inkColor: string
  inkLineWidth: number
  eraserSize: number
}>()

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', window.location.href).href

interface PageReference {
  key: string
  sourceFilePath: string
  fileName: string
  pageNo: number
  order: number
}

interface SegmentPageView {
  reference: PageReference
  wrap: HTMLElement
  shell: HTMLElement
  canvas: HTMLCanvasElement
  layer: HTMLElement
  renderKey: string
  rendering: boolean
  token: number
}

const root = ref<HTMLElement | null>(null)
const pagesHost = ref<HTMLElement | null>(null)
const loading = ref(false)
const renderingCount = ref(0)
const error = ref('')
const firstPageReady = ref(false)
const textInteractionReady = ref(false)
const scopeKey = computed(() => props.collectionId + ':' + props.paperId + ':' + props.role)
let inkManager: PdfInkManager | null = null
let selectionDrag: { anchor: PdfSelectionPoint; startX: number; startY: number; moved: boolean; pageIndex: number } | null = null
let activeTextSelection: PdfSelectionResult | null = null
let pendingSelectionPoint: PdfSelectionPoint | null = null
let selectionFrame = 0
let layoutToken = 0
let resizeTimer = 0
let resizeObserver: ResizeObserver | null = null
let lastRenderWidth = 0
let pageObserver: IntersectionObserver | null = null
let lastLayoutWidth = 0
const documentCache = new Map<string, any>()
const pageViews: SegmentPageView[] = []

const pageReferences = computed<PageReference[]>(() => {
  const unique = new Map<string, PageReference>()
  for (const segment of props.segments) {
    if (!['auto_confirmed', 'confirmed'].includes(segment.status)) continue
    const pageNo = Math.max(1, Number(segment.page_no) || 1)
    const sourceFilePath = segment.source_file_path
    const key = `${sourceFilePath}#${pageNo}`
    if (!unique.has(key)) {
      unique.set(key, {
        key,
        sourceFilePath,
        fileName: sourceFilePath.split(/[/\\]/).pop() || sourceFilePath,
        pageNo,
        order: segment.segment_order
      })
    }
  }
  return [...unique.values()].sort((left, right) => left.order - right.order || left.pageNo - right.pageNo)
})

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if ((value as any)?.buffer instanceof ArrayBuffer) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return new Uint8Array(Object.values(value as Record<string, number> || {}))
}

async function getPdfDocument(sourceFilePath: string): Promise<any> {
  const cached = documentCache.get(sourceFilePath)
  if (cached) return cached
  const result = await window.cet4Api.readCollectionSourcePdf(sourceFilePath)
  if (!result.success || result.data == null) throw new Error(result.message || `无法读取 ${sourceFilePath}`)
  const assetBase = new URL('./assets/pdfjs/', window.location.href).href
  const document = await pdfjsLib.getDocument({
    data: toBytes(result.data),
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    useSystemFonts: true
  }).promise
  documentCache.set(sourceFilePath, document)
  return document
}

function availableWidth(): number {
  return Math.max(260, (root.value?.clientWidth || 700) - 34)
}

function viewportFor(page: any): any {
  const base = page.getViewport({ scale: 1 })
  const fitScale = Math.min(2.2, availableWidth() / base.width)
  return page.getViewport({ scale: Math.max(0.22, fitScale * props.zoom) })
}

function captureScrollAnchor(): { index: number; ratio: number; top: number } | null {
  const host = root.value
  if (!host || !pageViews.length) return null
  const hostTop = host.getBoundingClientRect().top
  let closest = 0
  let closestTop = Number.POSITIVE_INFINITY
  pageViews.forEach((view, index) => {
    const top = view.wrap.getBoundingClientRect().top - hostTop
    if (Math.abs(top) < Math.abs(closestTop)) {
      closest = index
      closestTop = top
    }
  })
  const view = pageViews[closest]
  return {
    index: closest,
    ratio: Math.min(1, Math.max(0, -closestTop / Math.max(1, view.wrap.offsetHeight))),
    top: host.scrollTop
  }
}

function restoreScrollAnchor(anchor: { index: number; ratio: number; top: number } | null): void {
  const host = root.value
  if (!host) return
  const view = anchor ? pageViews[anchor.index] : null
  if (!view) {
    host.scrollTop = Math.min(anchor?.top || 0, host.scrollHeight)
    return
  }
  const hostTop = host.getBoundingClientRect().top
  const pageTop = view.wrap.getBoundingClientRect().top - hostTop + host.scrollTop
  host.scrollTop = Math.max(0, pageTop + view.wrap.offsetHeight * anchor!.ratio)
}

function createPageView(reference: PageReference, viewport: any, pageIndex: number): SegmentPageView {
  const wrap = document.createElement('section')
  wrap.className = 'segment-pdf-page-wrap'
  wrap.dataset.pageNumber = String(reference.pageNo)
  wrap.dataset.pageKey = reference.key
  const label = document.createElement('div')
  label.className = 'segment-pdf-page-label'
  label.textContent = `${reference.fileName} · 第 ${reference.pageNo} 页`
  const shell = document.createElement('div')
  shell.className = 'segment-pdf-page-shell'
  shell.dataset.examAnnotationPage = String(reference.pageNo)
  shell.dataset.pdfBaseWidth = String(viewport.width / Math.max(0.0001, viewport.scale))
  shell.dataset.pdfBaseHeight = String(viewport.height / Math.max(0.0001, viewport.scale))
  shell.style.width = `${viewport.width}px`
  shell.style.height = `${viewport.height}px`
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`
  const textLayer = document.createElement('div')
  textLayer.className = 'segment-pdf-text-layer'
  textLayer.style.width = `${viewport.width}px`
  textLayer.style.height = `${viewport.height}px`
  textLayer.style.setProperty('--scale-factor', String(viewport.scale))
  shell.appendChild(canvas)
  shell.appendChild(textLayer)
  inkManager?.registerPage(pageIndex, shell, reference.pageNo)
  wrap.appendChild(label)
  wrap.appendChild(shell)
  const view: SegmentPageView = {
    reference,
    wrap,
    shell,
    canvas,
    layer: textLayer,
    renderKey: '',
    rendering: false,
    token: 0
  }
  pageObserver?.observe(wrap)
  return view
}

async function buildPages(): Promise<void> {
  const host = pagesHost.value
  if (!host) return
  const token = ++layoutToken
  const anchor = captureScrollAnchor()
  pageObserver?.disconnect()
  pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const key = (entry.target as HTMLElement).dataset.pageKey
      const view = pageViews.find(item => item.reference.key === key)
      if (view) void renderPage(view)
    }
  }, { root: root.value, rootMargin: '900px 0px' })

  host.innerHTML = ''
  pageViews.splice(0, pageViews.length)
  const fragment = document.createDocumentFragment()
  try {
    for (let pageIndex = 0; pageIndex < pageReferences.value.length; pageIndex += 1) {
      const reference = pageReferences.value[pageIndex]
      if (token !== layoutToken) return
      const pdfDocument = await getPdfDocument(reference.sourceFilePath)
      if (token !== layoutToken) return
      const page = await pdfDocument.getPage(reference.pageNo)
      const view = createPageView(reference, viewportFor(page), pageIndex)
      pageViews.push(view)
      fragment.appendChild(view.wrap)
    }
    if (token !== layoutToken) return
    host.appendChild(fragment)
    loading.value = false
    lastLayoutWidth = root.value?.clientWidth || 0
    await nextTick()
    restoreScrollAnchor(anchor)
    renderNearbyPages()
    syncActiveInkPage()
  } catch (loadError) {
    if (token === layoutToken) {
      error.value = (loadError as Error).message || 'PDF 页面加载失败'
      loading.value = false
    }
  }
}

async function relayoutPages(): Promise<void> {
  if (!pageViews.length) return
  const token = ++layoutToken
  const anchor = captureScrollAnchor()
  for (const view of pageViews) {
    if (token !== layoutToken) return
    const pdfDocument = await getPdfDocument(view.reference.sourceFilePath)
    const page = await pdfDocument.getPage(view.reference.pageNo)
    const viewport = viewportFor(page)
    const baseViewport = page.getViewport({ scale: 1 })
    view.shell.dataset.pdfBaseWidth = String(baseViewport.width)
    view.shell.dataset.pdfBaseHeight = String(baseViewport.height)
    view.shell.style.width = `${viewport.width}px`
    view.shell.style.height = `${viewport.height}px`
    view.canvas.style.width = `${viewport.width}px`
    view.canvas.style.height = `${viewport.height}px`
    view.layer.style.width = `${viewport.width}px`
    view.layer.style.height = `${viewport.height}px`
    const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
    if (view.renderKey !== renderKey) view.renderKey = ''
  }
  lastLayoutWidth = root.value?.clientWidth || 0
  await nextTick()
  restoreScrollAnchor(anchor)
  renderNearbyPages()
}

function renderNearbyPages(): void {
  if (!root.value) return
  const hostRect = root.value.getBoundingClientRect()
  for (const view of pageViews) {
    const rect = view.wrap.getBoundingClientRect()
    if (rect.bottom >= hostRect.top - 900 && rect.top <= hostRect.bottom + 900) void renderPage(view)
  }
}

async function renderPage(view: SegmentPageView): Promise<void> {
  if (view.rendering) return
  const pdfDocument = await getPdfDocument(view.reference.sourceFilePath)
  const page = await pdfDocument.getPage(view.reference.pageNo)
  const viewport = viewportFor(page)
  const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
  if (view.renderKey === renderKey) return
  view.rendering = true
  renderingCount.value += 1
  const token = ++view.token
  try {
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const replacement = document.createElement('canvas')
    replacement.width = Math.max(1, Math.floor(viewport.width * ratio))
    replacement.height = Math.max(1, Math.floor(viewport.height * ratio))
    replacement.style.width = `${viewport.width}px`
    replacement.style.height = `${viewport.height}px`
    replacement.style.display = 'block'
    replacement.style.visibility = 'hidden'
    const context = replacement.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法初始化 PDF 画布')
    view.shell.insertBefore(replacement, view.canvas)
    await page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
    }).promise
    if (token !== view.token) {
      replacement.remove()
      return
    }
    view.canvas.remove()
    replacement.style.visibility = ''
    view.canvas = replacement
    view.layer.style.width = `${viewport.width}px`
    view.layer.style.height = `${viewport.height}px`
    view.layer.style.setProperty('--scale-factor', String(viewport.scale))
    const textContent = await page.getTextContent()
    if (token !== view.token) return
    view.layer.innerHTML = ''
    const textDivs: HTMLSpanElement[] = []
    await pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: view.layer,
      viewport,
      textDivs,
      isOffscreenCanvasSupported: true
    }).promise
    annotatePdfTextLayer(view.layer, textContent.items, textDivs, view.reference.pageNo)
    if (!firstPageReady.value) {
      firstPageReady.value = true
      textInteractionReady.value = true
    }
    view.renderKey = renderKey
  } catch (renderError) {
    if (token === view.token) error.value = (renderError as Error).message || 'PDF 页面渲染失败'
  } finally {
    view.rendering = false
    renderingCount.value = Math.max(0, renderingCount.value - 1)
  }
}

async function loadInkRecords(): Promise<void> {
  if (!inkManager) return
  try {
    const result = await window.cet4Api.getExamAnnotations(scopeKey.value)
    const strokes = (result.success && Array.isArray(result.annotations) ? result.annotations : [])
      .map(parsePdfInkRecord)
      .filter((stroke): stroke is PdfInkStroke => Boolean(stroke))
    inkManager.setRecords(strokes)
  } catch (error) {
    console.error('加载真题手绘笔迹失败', error)
  }
}

function createInkManager(): void {
  inkManager = new PdfInkManager({
    onStrokeAdded: async stroke => {
      const result = await window.cet4Api.addExamAnnotation({
        scopeKey: scopeKey.value,
        pageNumber: stroke.pageIndex + 1,
        annotationType: 'drawing',
        color: stroke.color,
        geometry: serializePdfInkStroke(stroke)
      })
      return Number(result.id || result.annotation?.id) || undefined
    },
    onStrokeDeleted: async id => {
      await window.cet4Api.deleteExamAnnotation(id)
    }
  })
}

function applyInkSettings(): void {
  inkManager?.setTool(props.activeInkTool)
  inkManager?.setColor(props.inkColor)
  inkManager?.setLineWidth(props.inkLineWidth)
  inkManager?.setEraserSize(props.eraserSize)
}

function syncActiveInkPage(): void {
  if (!root.value || !pageViews.length) return
  const hostTop = root.value.getBoundingClientRect().top
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY
  pageViews.forEach((view, index) => {
    const distance = Math.abs(view.wrap.getBoundingClientRect().top - hostTop)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  inkManager?.setActivePage(closestIndex)
}

const WORD_CHARACTER_PATTERN = /[A-Za-z\u2018\u2019'-]/

function cleanLookupWord(value: string): string {
  return value.replace(/^['\u2018\u2019]+|['\u2018\u2019]+$/g, '').trim()
}

function selectedLookupWord(): string {
  const selected = window.getSelection()?.toString().trim() || ''
  return /^[A-Za-z][A-Za-z\u2018\u2019'-]*$/.test(selected) ? cleanLookupWord(selected) : ''
}

function lookupWordAtCaret(x: number, y: number): string {
  const legacyDocument = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
  }
  const modernDocument = document as Document & {
    caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let offset = 0
  if (legacyDocument.caretRangeFromPoint) {
    const range = legacyDocument.caretRangeFromPoint(x, y)
    if (range) {
      node = range.startContainer
      offset = range.startOffset
    }
  } else if (modernDocument.caretPositionFromPoint) {
    const point = modernDocument.caretPositionFromPoint(x, y)
    if (point) {
      node = point.offsetNode
      offset = point.offset
    }
  }
  if (!(node instanceof Text) || !node.parentElement?.closest('.segment-pdf-text-layer')) return ''
  const value = node.data
  let index = Math.min(offset, Math.max(0, value.length - 1))
  if (!WORD_CHARACTER_PATTERN.test(value[index] || '') && index > 0 && WORD_CHARACTER_PATTERN.test(value[index - 1] || '')) index -= 1
  if (!WORD_CHARACTER_PATTERN.test(value[index] || '')) return ''
  let start = index
  let end = index + 1
  while (start > 0 && WORD_CHARACTER_PATTERN.test(value[start - 1])) start -= 1
  while (end < value.length && WORD_CHARACTER_PATTERN.test(value[end])) end += 1
  return cleanLookupWord(value.slice(start, end))
}

function handlePdfDoubleClick(event: MouseEvent): void {
  if (event.button !== 0 || props.activeInkTool !== 'select' || !root.value) return
  const target = event.target instanceof Element ? event.target : null
  if (!target || !root.value.contains(target) || !target.closest('.segment-pdf-text-layer')) return
  const marked = target.closest<HTMLElement>('[data-pdf-word]')
  const word = cleanLookupWord(marked?.dataset.pdfWord || '') || selectedLookupWord() || lookupWordAtCaret(event.clientX, event.clientY)
  if (!word || !/[A-Za-z]/.test(word)) return
  event.preventDefault()
  // Handle PDF double-click lookup before the global document listener can race with selection.
  event.stopImmediatePropagation()
  window.dispatchEvent(new CustomEvent('vocflow:lookup-word', { detail: { word, x: event.clientX, y: event.clientY } }))
}

function selectionIsUsable(result: PdfSelectionResult | null): result is PdfSelectionResult {
  if (!result || !root.value || result.ranges.length !== 1) return false
  const text = result.text.replace(/\s+/g, ' ').trim()
  return text.length >= 8 && text.length <= 1800 && !pdfSelectionLooksLikeWholePage(result, root.value)
}

function selectPdfRange(anchor: PdfSelectionPoint, head: PdfSelectionPoint): PdfSelectionResult | null {
  if (!root.value || anchor.pageIndex !== head.pageIndex) return null
  const selection = applyPdfTextSelection(anchor, head, root.value, 'words')
  if (selectionIsUsable(selection)) return selection
  clearPdfTextSelection()
  return null
}

function dispatchSentenceAnalysis(result: PdfSelectionResult): void {
  if (!root.value || !selectionIsUsable(result)) return
  const text = result.text.replace(/\s+/g, ' ').trim()
  const rect = pdfSelectionClientRect(result, root.value)
  if (!rect) return
  window.dispatchEvent(new CustomEvent('vocflow:analyze-selection', {
    detail: { text, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
  }))
}

function handleSelectionMouseDown(event: MouseEvent): void {
  if (event.button !== 0 || props.activeInkTool !== 'select' || !root.value) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('button, input, textarea, select')) return
  const layer = target?.closest('.segment-pdf-text-layer')
  if (!layer || !root.value.contains(layer)) return
  const anchor = pdfSelectionPointAt(root.value, event.clientX, event.clientY, 'before')
  if (!anchor) return
  // PDF.js can extend Chromium's native selection to its end-of-content sentinel.
  // Let the indexed selection engine own the gesture instead of the browser.
  window.getSelection()?.removeAllRanges()
  selectionDrag = { anchor, startX: event.clientX, startY: event.clientY, moved: false, pageIndex: anchor.pageIndex }
  activeTextSelection = null
}

function handleSelectionSelectStart(event: Event): void {
  if (props.activeInkTool !== 'select') return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('.segment-pdf-text-layer')) event.preventDefault()
}

function pointerInsideReader(event: MouseEvent): boolean {
  const bounds = root.value?.getBoundingClientRect()
  return Boolean(bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom)
}

function handleSelectionMouseMove(event: MouseEvent): void {
  if (!selectionDrag || !root.value) return
  if (Math.hypot(event.clientX - selectionDrag.startX, event.clientY - selectionDrag.startY) < 3) return
  if (!pointerInsideReader(event)) return
  selectionDrag.moved = true
  // Keep ordinary drags on the page where the gesture started. Selecting across
  // page shells can make Chromium highlight every DOM node between two pages.
  const end = pdfSelectionPointAt(root.value, event.clientX, event.clientY, 'after', selectionDrag.pageIndex)
  if (!end || end.pageIndex !== selectionDrag.pageIndex) return
  pendingSelectionPoint = end
  event.preventDefault()
  if (selectionFrame) return
  selectionFrame = window.requestAnimationFrame(() => {
    selectionFrame = 0
    if (!selectionDrag || !pendingSelectionPoint || !root.value) return
    activeTextSelection = selectPdfRange(selectionDrag.anchor, pendingSelectionPoint)
  })
}

function handleSelectionMouseUp(event: MouseEvent): void {
  if (!selectionDrag || !root.value) return
  if (!selectionDrag.moved) {
    selectionDrag = null
    pendingSelectionPoint = null
    return
  }
  const candidate = pointerInsideReader(event)
    ? pdfSelectionPointAt(root.value, event.clientX, event.clientY, 'after', selectionDrag.pageIndex)
    : null
  const end = candidate?.pageIndex === selectionDrag.pageIndex ? candidate : pendingSelectionPoint
  if (end) activeTextSelection = selectPdfRange(selectionDrag.anchor, end)
  else activeTextSelection = null
  selectionDrag = null
  pendingSelectionPoint = null
  if (selectionFrame) {
    window.cancelAnimationFrame(selectionFrame)
    selectionFrame = 0
  }
  if (!activeTextSelection) return
  const result = activeTextSelection
  window.setTimeout(() => dispatchSentenceAnalysis(result), 30)
}

function scheduleRender(): void {
  const width = root.value?.clientWidth || 0
  if (Math.abs(width - lastLayoutWidth) < 10) return
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => void relayoutPages(), 160)
}

async function resetDocuments(): Promise<void> {
  textInteractionReady.value = false
  firstPageReady.value = false
  inkManager?.resetPages()
  layoutToken += 1
  pageObserver?.disconnect()
  for (const view of pageViews) view.token += 1
  for (const document of documentCache.values()) {
    try { await document.destroy() } catch {}
  }
  documentCache.clear()
  pageViews.splice(0, pageViews.length)
  if (pagesHost.value) pagesHost.value.innerHTML = ''
}

watch(() => [props.segments.map(segment => segment.id).join(','), scopeKey.value], async () => {
  await loadInkRecords()
  loading.value = true
  textInteractionReady.value = false
  firstPageReady.value = false
  error.value = ''
  await resetDocuments()
  await nextTick()
  await buildPages()
})
watch(() => props.zoom, () => {
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => void relayoutPages(), 40)
})
watch(() => [props.activeInkTool, props.inkColor, props.inkLineWidth, props.eraserSize], applyInkSettings)

onMounted(() => {
  createInkManager()
  applyInkSettings()
  void loadInkRecords()
  window.addEventListener('dblclick', handlePdfDoubleClick, true)
  window.addEventListener('mousemove', handleSelectionMouseMove, true)
  window.addEventListener('mouseup', handleSelectionMouseUp, true)
  loading.value = true
  resizeObserver = new ResizeObserver(scheduleRender)
  if (root.value) resizeObserver.observe(root.value)
  void nextTick().then(buildPages)
})

onBeforeUnmount(() => {
  window.removeEventListener('dblclick', handlePdfDoubleClick, true)
  window.removeEventListener('mousemove', handleSelectionMouseMove, true)
  window.removeEventListener('mouseup', handleSelectionMouseUp, true)
  layoutToken += 1
  for (const view of pageViews) view.token += 1
  resizeObserver?.disconnect()
  pageObserver?.disconnect()
  if (resizeTimer) window.clearTimeout(resizeTimer)
  if (selectionFrame) window.cancelAnimationFrame(selectionFrame)
  inkManager?.destroy()
  inkManager = null
  void resetDocuments()
})
</script>

<template>
  <section ref="root" class="segment-pdf-pane" :data-text-interaction-ready="textInteractionReady ? '1' : '0'" :data-no-sentence-lookup="activeInkTool !== 'select' ? '' : undefined" :data-word-lookup-ignore="activeInkTool !== 'select' ? '' : undefined" :class="{ 'ink-active': activeInkTool !== 'select' }" @scroll.passive="syncActiveInkPage" @mousedown="handleSelectionMouseDown" @selectstart="handleSelectionSelectStart">
    <div v-if="loading && !pageReferences.length" class="pdf-pane-state">正在读取原始 PDF…</div>
    <div v-else-if="error && !pageViews.length" class="pdf-pane-state error"><strong>PDF 原文加载失败</strong><span>{{ error }}</span></div>
    <div v-else-if="!pageReferences.length" class="pdf-pane-state"><strong>暂无可显示的{{ label }}</strong><span>请先导入或标注对应内容片段。</span></div>
    <div ref="pagesHost" class="segment-pdf-pages"></div>
    <div v-if="!loading && !error && pageViews.length && !textInteractionReady" class="pdf-text-ready-mask"><span class="pdf-loading-spinner"></span><span>正在准备文字交互…</span></div>
    <div v-if="(renderingCount > 0 || loading) && !firstPageReady" class="pdf-loading-overlay"><span class="pdf-loading-spinner"></span><span>正在加载 PDF 原版页面…</span></div>
    <div v-if="renderingCount > 0" class="pdf-rendering-pill">正在渲染可见页面…</div>
    <div v-if="error && pageViews.length" class="pdf-inline-error">{{ error }}</div>
    <div class="pdf-text-note">PDF 原版页面仅用于显示；文字层用于选中、查词和句子分析。</div>
  </section>
</template>

<style scoped>
.segment-pdf-pane { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 16px 17px 34px; background: #e9e5df; overscroll-behavior: contain; scroll-behavior: auto; }
.pdf-pane-state { min-height: 55vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); font-size: 10px; text-align: center; }.pdf-pane-state strong { color: var(--text-secondary); font-size: 12px; }.pdf-pane-state.error { color: var(--danger); }
.segment-pdf-pages { width: 100%; min-width: min-content; display: flex; flex-direction: column; align-items: center; gap: 18px; }
:global(.segment-pdf-page-wrap) { display: flex; flex-direction: column; align-items: center; gap: 5px; }
:global(.segment-pdf-page-label) { max-width: 100%; overflow: hidden; color: #8b817a; font-family: var(--font-mono); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
:global(.segment-pdf-page-shell) { position: relative; flex-shrink: 0; overflow: hidden; background: #fff; box-shadow: 0 7px 24px rgba(44,36,32,.14); }
:global(.segment-pdf-page-shell canvas) { position: relative; z-index: 1; display: block; }
:global(.segment-pdf-text-layer) { position: absolute; inset: 0; z-index: 3; overflow: hidden; line-height: 1; opacity: 1; }
:global(.segment-pdf-text-layer span), :global(.segment-pdf-text-layer br) { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0% 0%; }
:global(.segment-pdf-text-layer ::selection) { background: rgba(37,99,235,.34); }
:global(.segment-pdf-text-layer .endOfContent) { display: block; position: absolute; inset: 100% 0 0; z-index: -1; cursor: default; user-select: none; }
.pdf-loading-overlay { position:absolute; inset:0; z-index:20; display:flex; align-items:center; justify-content:center; gap:9px; color:var(--text-secondary); background:rgba(233,229,223,.92); font-size:11px; }.pdf-loading-spinner { width:18px; height:18px; border:2px solid rgba(217,119,6,.2); border-top-color:var(--accent); border-radius:50%; animation:pdf-pane-spin .7s linear infinite; }@keyframes pdf-pane-spin { to { transform:rotate(360deg); } }
.pdf-rendering-pill { position: sticky; bottom: 8px; width: fit-content; margin: 10px auto 0; padding: 5px 9px; border-radius: 999px; color: var(--accent-dim); background: rgba(255,250,241,.96); box-shadow: 0 4px 14px rgba(44,36,32,.12); font-size: 8px; }
.pdf-text-ready-mask { position:absolute; inset:0; z-index:21; display:flex; align-items:center; justify-content:center; gap:9px; color:var(--text-secondary); background:rgba(233,229,223,.84); font-size:10px; }
.pdf-inline-error { margin: 8px auto 0; color: var(--danger); font-size: 8px; text-align: center; }

.pdf-text-note { margin: 12px auto 0; color: #8b817a; font-size: 7px; text-align: center; }
@media (max-width: 900px) { .segment-pdf-pane { padding: 12px 9px 28px; } }
</style>

