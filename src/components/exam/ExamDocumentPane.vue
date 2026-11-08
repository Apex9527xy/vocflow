<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

const props = defineProps<{
  paperId: number
  role: ExamResourceRoleKey
  label: string
  resource: ExamResourceRecord | null
  zoom: number
}>()

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', window.location.href).href

interface PageView {
  number: number
  wrap: HTMLElement
  shell: HTMLElement
  canvas: HTMLCanvasElement
  layer: HTMLElement
  baseWidth: number
  baseHeight: number
  viewportWidth: number
  viewportHeight: number
  renderKey: string
  rendering: boolean
}

const root = ref<HTMLElement | null>(null)
const pdfHost = ref<HTMLElement | null>(null)
const loading = ref(false)
const renderingCount = ref(0)
const error = ref('')
const kind = ref<'pdf' | 'text' | 'empty'>('empty')
const textContent = ref('')
const pageCount = ref(0)
let pdfDocument: any = null
let layoutToken = 0
let textToken = 0
let resizeObserver: ResizeObserver | null = null
let pageObserver: IntersectionObserver | null = null
let resizeTimer = 0
let lastLayoutWidth = 0
const pageViews = new Map<number, PageView>()

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if ((value as any)?.buffer instanceof ArrayBuffer) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return new Uint8Array(Object.values(value as Record<string, number> || {}))
}

function paragraphs(): string[] {
  const content = textContent.value.trim()
  if (!content) return []
  return content.split(/\n{2,}/).map(part => part.trim()).filter(Boolean).slice(0, 1000)
}

function availableWidth(): number {
  return Math.max(280, (root.value?.clientWidth || 720) - 38)
}

function scaledViewport(baseViewport: any): any {
  const fitScale = Math.min(2, availableWidth() / baseViewport.width)
  return { scale: Math.max(0.2, fitScale * props.zoom) }
}

function captureScrollAnchor(): { number: number; ratio: number; top: number } | null {
  const host = root.value
  if (!host || !pageViews.size) return null
  const hostTop = host.getBoundingClientRect().top
  let closest: PageView | null = null
  let closestTop = Number.POSITIVE_INFINITY
  for (const view of pageViews.values()) {
    const top = view.wrap.getBoundingClientRect().top - hostTop
    if (Math.abs(top) < Math.abs(closestTop)) {
      closest = view
      closestTop = top
    }
  }
  if (!closest) return null
  return {
    number: closest.number,
    ratio: Math.min(1, Math.max(0, -closestTop / Math.max(1, closest.wrap.offsetHeight))),
    top: host.scrollTop
  }
}

function restoreScrollAnchor(anchor: { number: number; ratio: number; top: number } | null): void {
  const host = root.value
  if (!host) return
  const view = anchor ? pageViews.get(anchor.number) : null
  if (!view) {
    host.scrollTop = Math.min(anchor?.top || 0, host.scrollHeight)
    return
  }
  const hostTop = host.getBoundingClientRect().top
  const pageTop = view.wrap.getBoundingClientRect().top - hostTop + host.scrollTop
  host.scrollTop = Math.max(0, pageTop + view.wrap.offsetHeight * anchor!.ratio)
}

function makePageView(number: number, width: number, height: number): PageView {
  const wrap = document.createElement('section')
  wrap.className = 'exam-pdf-page-wrap'
  wrap.dataset.pageNumber = String(number)
  const pageLabel = document.createElement('div')
  pageLabel.className = 'exam-pdf-page-label'
  pageLabel.textContent = `第 ${number} 页`
  const shell = document.createElement('div')
  shell.className = 'exam-pdf-page-shell'
  shell.style.width = `${width}px`
  shell.style.height = `${height}px`
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(width))
  canvas.height = Math.max(1, Math.floor(height))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.style.display = 'block'
  const layer = document.createElement('div')
  layer.className = 'exam-pdf-text-layer'
  layer.style.width = `${width}px`
  layer.style.height = `${height}px`
  shell.appendChild(canvas)
  shell.appendChild(layer)
  wrap.appendChild(pageLabel)
  wrap.appendChild(shell)
  const view: PageView = {
    number,
    wrap,
    shell,
    canvas,
    layer,
    baseWidth: width,
    baseHeight: height,
    viewportWidth: width,
    viewportHeight: height,
    renderKey: '',
    rendering: false
  }
  pageObserver?.observe(wrap)
  return view
}

async function buildPageStructure(token: number): Promise<void> {
  const host = pdfHost.value
  if (!pdfDocument || !host || kind.value !== 'pdf') return
  const anchor = captureScrollAnchor()
  pageObserver?.disconnect()
  pageObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const number = Number((entry.target as HTMLElement).dataset.pageNumber || 0)
      const view = pageViews.get(number)
      if (view) void renderPage(view)
    }
  }, { root: root.value, rootMargin: '900px 0px' })

  host.innerHTML = ''
  pageViews.clear()
  const fragment = document.createDocumentFragment()
  for (let number = 1; number <= pageCount.value; number += 1) {
    if (token !== layoutToken) return
    const page = await pdfDocument.getPage(number)
    const baseViewport = page.getViewport({ scale: 1 })
    const viewport = page.getViewport(scaledViewport(baseViewport))
    const view = makePageView(number, viewport.width, viewport.height)
    view.baseWidth = baseViewport.width
    view.baseHeight = baseViewport.height
    pageViews.set(number, view)
    fragment.appendChild(view.wrap)
  }
  if (token !== layoutToken) return
  host.appendChild(fragment)
  lastLayoutWidth = root.value?.clientWidth || 0
  await nextTick()
  restoreScrollAnchor(anchor)
  renderNearbyPages()
}

async function relayoutPages(): Promise<void> {
  if (!pdfDocument || kind.value !== 'pdf' || !pageViews.size) return
  const token = ++layoutToken
  const anchor = captureScrollAnchor()
  for (const view of pageViews.values()) {
    if (token !== layoutToken) return
    const page = await pdfDocument.getPage(view.number)
    const baseViewport = page.getViewport({ scale: 1 })
    const viewport = page.getViewport(scaledViewport(baseViewport))
    view.viewportWidth = viewport.width
    view.viewportHeight = viewport.height
    view.shell.style.width = `${viewport.width}px`
    view.shell.style.height = `${viewport.height}px`
    view.canvas.style.width = `${viewport.width}px`
    view.canvas.style.height = `${viewport.height}px`
    view.layer.style.width = `${viewport.width}px`
    view.layer.style.height = `${viewport.height}px`
    const nextKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
    if (view.renderKey !== nextKey) view.renderKey = ''
  }
  lastLayoutWidth = root.value?.clientWidth || 0
  await nextTick()
  restoreScrollAnchor(anchor)
  renderNearbyPages()
}

function renderNearbyPages(): void {
  const host = root.value
  if (!host) return
  const hostRect = host.getBoundingClientRect()
  for (const view of pageViews.values()) {
    const rect = view.wrap.getBoundingClientRect()
    if (rect.bottom >= hostRect.top - 900 && rect.top <= hostRect.bottom + 900) void renderPage(view)
  }
}

async function renderPage(view: PageView): Promise<void> {
  if (!pdfDocument || kind.value !== 'pdf' || view.rendering) return
  const viewport = pdfDocument ? await pdfDocument.getPage(view.number).then((page: any) => page.getViewport(scaledViewport(page.getViewport({ scale: 1 })))) : null
  if (!viewport) return
  const renderKey = `${Math.round(viewport.width)}x${Math.round(viewport.height)}`
  if (view.renderKey === renderKey) return
  view.rendering = true
  renderingCount.value += 1
  const token = ++viewToken[view.number] || 1
  try {
    const page = await pdfDocument.getPage(view.number)
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
    if (token !== viewToken[view.number] || kind.value !== 'pdf') {
      replacement.remove()
      return
    }
    view.canvas.remove()
    replacement.style.visibility = ''
    view.canvas = replacement
    view.viewportWidth = viewport.width
    view.viewportHeight = viewport.height
    view.layer.style.width = `${viewport.width}px`
    view.layer.style.height = `${viewport.height}px`
    const content = await page.getTextContent()
    if (token !== viewToken[view.number]) return
    view.layer.innerHTML = ''
    const task = pdfjsLib.renderTextLayer({
      textContentSource: content,
      container: view.layer,
      viewport,
      textDivs: [],
      isOffscreenCanvasSupported: true
    })
    await task.promise
    view.renderKey = renderKey
  } catch (renderError) {
    if (token === viewToken[view.number] && kind.value === 'pdf') {
      error.value = (renderError as Error).message || 'PDF 渲染失败'
    }
  } finally {
    view.rendering = false
    renderingCount.value = Math.max(0, renderingCount.value - 1)
    if (token === viewToken[view.number] && view.renderKey !== renderKey) view.renderKey = ''
  }
}

const viewToken: Record<number, number> = {}

function scheduleRelayout(force = false): void {
  if (!pdfDocument || kind.value !== 'pdf') return
  const width = root.value?.clientWidth || 0
  if (!force && Math.abs(width - lastLayoutWidth) < 10) return
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => { void relayoutPages() }, 160)
}

async function loadResource(): Promise<void> {
  textToken += 1
  layoutToken += 1
  pageObserver?.disconnect()
  if (pdfDocument) { try { await pdfDocument.destroy() } catch {} }
  pdfDocument = null
  pageViews.clear()
  if (pdfHost.value) pdfHost.value.innerHTML = ''
  pageCount.value = 0
  error.value = ''
  if (!props.resource) {
    kind.value = 'empty'
    textContent.value = ''
    loading.value = false
    return
  }
  loading.value = true
  try {
    const result = await window.cet4Api.getExamResourceData({ paperId: props.paperId, role: props.role })
    if (!result.success || result.data == null) throw new Error(result.message || '资源加载失败')
    if (result.kind === 'pdf') {
      kind.value = 'pdf'
      const assetBase = new URL('./assets/pdfjs/', window.location.href).href
      pdfDocument = await pdfjsLib.getDocument({
        data: toBytes(result.data),
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        useSystemFonts: true
      }).promise
      pageCount.value = pdfDocument.numPages
      loading.value = false
      await nextTick()
      const token = layoutToken
      await buildPageStructure(token)
    } else {
      kind.value = 'text'
      textContent.value = typeof result.data === 'string' ? result.data : ''
      loading.value = false
    }
  } catch (loadError) {
    error.value = (loadError as Error).message || '资源加载失败'
    loading.value = false
  }
}

onMounted(() => {
  resizeObserver = new ResizeObserver(() => scheduleRelayout())
  if (root.value) resizeObserver.observe(root.value)
  void loadResource()
})
watch(() => [props.paperId, props.role, props.resource?.file_hash], () => { void loadResource() })
watch(() => props.zoom, () => scheduleRelayout(true))

onBeforeUnmount(() => {
  layoutToken += 1
  textToken += 1
  for (const number of Object.keys(viewToken)) viewToken[Number(number)] += 1
  resizeObserver?.disconnect()
  pageObserver?.disconnect()
  if (resizeTimer) window.clearTimeout(resizeTimer)
  if (pdfDocument) void pdfDocument.destroy()
})

defineExpose({
  scrollTop: () => root.value?.scrollTop || 0,
  setScrollTop: (value: number) => { if (root.value) root.value.scrollTop = value }
})
</script>

<template>
  <section ref="root" class="exam-document-pane" :class="{ 'text-mode': kind === 'text' }">
    <header class="pane-head">
      <div>
        <span>{{ role === 'analysis' ? 'ANALYSIS' : 'EXAM TEXT' }}</span>
        <strong>{{ label }}</strong>
      </div>
      <small>{{ kind === 'pdf' ? `${pageCount} 页` : kind === 'text' ? '文本模式' : '' }}</small>
    </header>
    <div v-if="loading" class="pane-state"><i class="pane-spinner"></i><span>正在加载{{ label }}…</span></div>
    <div v-else-if="error" class="pane-state error"><strong>{{ label }}加载失败</strong><span>{{ error }}</span></div>
    <div v-else-if="kind === 'empty'" class="pane-state"><strong>尚未导入{{ label }}</strong><span>可以回到真题卡片单独补充这份资源。</span></div>
    <template v-else-if="kind === 'pdf'">
      <div ref="pdfHost" class="exam-pdf-pages"></div>
      <div v-if="renderingCount > 0" class="rendering-pill">正在渲染可见页面…</div>
    </template>
    <article v-else class="exam-text-document">
      <p v-for="(paragraph, index) in paragraphs()" :key="index">{{ paragraph }}</p>
    </article>
  </section>
</template>

<style scoped>
.exam-document-pane { position: relative; min-width: 0; min-height: 0; height: 100%; overflow: auto; padding: 16px 18px 40px; background: #e9e5df; overscroll-behavior: contain; scroll-behavior: auto; }
.pane-head { position: sticky; top: -16px; z-index: 12; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -16px -18px 13px; padding: 9px 16px; border-bottom: 1px solid rgba(61,51,45,.11); background: rgba(255,252,247,.96); backdrop-filter: blur(12px); }
.pane-head > div { display: flex; align-items: baseline; gap: 8px; }
.pane-head span { color: var(--accent); font-family: var(--font-mono); font-size: 7px; font-weight: 800; letter-spacing: 1px; }
.pane-head strong { color: var(--text-primary); font-size: 11px; }
.pane-head small { color: var(--text-muted); font-size: 8px; }
.pane-state { min-height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); font-size: 10px; text-align: center; }
.pane-state strong { color: var(--text-secondary); font-size: 12px; }
.pane-state.error { color: var(--danger); }
.pane-spinner { width: 21px; height: 21px; border: 2px solid rgba(217,119,6,.18); border-top-color: var(--accent); border-radius: 50%; animation: pane-spin .75s linear infinite; }
@keyframes pane-spin { to { transform: rotate(360deg); } }
.exam-pdf-pages { width: 100%; min-width: min-content; display: flex; flex-direction: column; align-items: center; gap: 18px; }
:global(.exam-pdf-page-wrap) { display: flex; flex-direction: column; align-items: center; gap: 5px; }
:global(.exam-pdf-page-label) { color: #8b817a; font-family: var(--font-mono); font-size: 8px; }
:global(.exam-pdf-page-shell) { position: relative; flex-shrink: 0; overflow: hidden; background: #fff; box-shadow: 0 7px 24px rgba(44,36,32,.14); }
:global(.exam-pdf-page-shell canvas) { position: relative; z-index: 1; display: block; }
:global(.exam-pdf-text-layer) { position: absolute; inset: 0; z-index: 2; overflow: hidden; line-height: 1; opacity: 1; }
:global(.exam-pdf-text-layer span), :global(.exam-pdf-text-layer br) { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0% 0%; }
:global(.exam-pdf-text-layer ::selection) { background: rgba(37,99,235,.34); }
:global(.exam-pdf-text-layer .endOfContent) { display: block; position: absolute; inset: 100% 0 0; z-index: -1; cursor: default; user-select: none; }
.rendering-pill { position: sticky; bottom: 8px; width: fit-content; margin: 8px auto 0; padding: 5px 9px; border-radius: 999px; color: var(--accent-dim); background: rgba(255,250,241,.95); box-shadow: 0 4px 14px rgba(44,36,32,.12); font-size: 8px; }
.exam-text-document { width: min(820px, 100%); min-height: calc(100% - 10px); margin: 0 auto; padding: 44px 52px 70px; background: #fffdf9; box-shadow: 0 7px 24px rgba(44,36,32,.13); color: #2d2723; font-size: 15px; line-height: 1.85; user-select: text; }
.exam-text-document p { margin-bottom: 1.05em; text-align: justify; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .exam-document-pane { padding: 12px 10px 32px; } .pane-head { top: -12px; margin: -12px -10px 10px; } .exam-text-document { padding: 30px 24px 50px; } }
</style>
