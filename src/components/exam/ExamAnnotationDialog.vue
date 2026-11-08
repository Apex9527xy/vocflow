<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

const props = defineProps<{ open: boolean; collection: ExamCollectionDetail | null }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'updated', collection: ExamCollectionDetail): void }>()
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./assets/pdf.worker.min.mjs', window.location.href).href

interface DrawRect { x: number; y: number; width: number; height: number }
const sourcePath = ref('')
const pageNumber = ref(1)
const pageCount = ref(0)
const loading = ref(false)
const rendering = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const canvas = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLElement | null>(null)
const rect = ref<DrawRect | null>(null)
const drawingStart = ref<{ x: number; y: number } | null>(null)
const role = ref<CollectionContentType>('paper')
const paperNo = ref<number | null>(1)
const audioSlot = ref<'A' | 'B' | null>(null)
let pdfDocument: any = null
let renderToken = 0

const sourceFiles = computed(() => props.collection?.sourceFiles || [])
const pendingSegments = computed(() => props.collection?.segments.filter(segment => segment.status === 'pending_review') || [])
const roleOptions: Array<{ value: CollectionContentType; label: string }> = [
  { value: 'paper', label: '真题题干' }, { value: 'answer', label: '答案' },
  { value: 'analysis', label: '解析' }, { value: 'listening_script', label: '听力原文' }
]
const roleLabels: Record<CollectionContentType, string> = { paper: '真题题干', answer: '答案', analysis: '解析', listening_script: '听力原文' }
function confidencePercent(value: number): number { return Math.round(value * 100) }

function paperNoForSegment(segment: ExamContentSegmentRecord): number | null {
  return props.collection?.papers.find(paper => paper.id === segment.paper_id)?.paper_no || null
}

async function loadPdf(): Promise<void> {
  if (!sourcePath.value) return
  loading.value = true
  errorMessage.value = ''
  if (pdfDocument) { try { await pdfDocument.destroy() } catch {} }
  pdfDocument = null
  try {
    const result = await window.cet4Api.readCollectionSourcePdf(sourcePath.value)
    if (!result.success || !result.data) throw new Error(result.message || '无法读取原 PDF')
    pdfDocument = await pdfjsLib.getDocument({ data: result.data }).promise
    pageCount.value = pdfDocument.numPages
    pageNumber.value = 1
    await nextTick()
    await renderPage()
  } catch (error) {
    errorMessage.value = (error as Error).message || 'PDF 加载失败'
  } finally { loading.value = false }
}

async function renderPage(): Promise<void> {
  if (!pdfDocument || !canvas.value || !overlay.value) return
  const token = ++renderToken
  rendering.value = true
  try {
    const page = await pdfDocument.getPage(pageNumber.value)
    if (token !== renderToken) return
    const viewport = page.getViewport({ scale: 1.25 })
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    canvas.value.width = Math.floor(viewport.width * ratio)
    canvas.value.height = Math.floor(viewport.height * ratio)
    canvas.value.style.width = `${viewport.width}px`
    canvas.value.style.height = `${viewport.height}px`
    overlay.value.style.width = `${viewport.width}px`
    overlay.value.style.height = `${viewport.height}px`
    const context = canvas.value.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建 PDF 画布')
    await page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise
    rect.value = null
  } catch (error) {
    errorMessage.value = (error as Error).message || 'PDF 页面渲染失败'
  } finally { if (token === renderToken) rendering.value = false }
}

async function changePage(delta: number): Promise<void> {
  const next = Math.max(1, Math.min(pageCount.value || 1, pageNumber.value + delta))
  if (next === pageNumber.value) return
  pageNumber.value = next
  await nextTick()
  await renderPage()
}

function relativePoint(event: PointerEvent): { x: number; y: number } {
  const bounds = overlay.value!.getBoundingClientRect()
  return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
}
function startDraw(event: PointerEvent): void {
  if (event.button !== 0 || !overlay.value) return
  const point = relativePoint(event)
  drawingStart.value = point
  rect.value = { x: point.x, y: point.y, width: 0, height: 0 }
  overlay.value.setPointerCapture(event.pointerId)
  event.preventDefault()
}
function moveDraw(event: PointerEvent): void {
  if (!drawingStart.value) return
  const point = relativePoint(event)
  rect.value = { x: Math.min(drawingStart.value.x, point.x), y: Math.min(drawingStart.value.y, point.y), width: Math.abs(point.x - drawingStart.value.x), height: Math.abs(point.y - drawingStart.value.y) }
  event.preventDefault()
}
function endDraw(event: PointerEvent): void {
  drawingStart.value = null
  if (overlay.value?.hasPointerCapture(event.pointerId)) overlay.value.releasePointerCapture(event.pointerId)
  if (rect.value && (rect.value.width < 0.005 || rect.value.height < 0.005)) rect.value = null
}

async function saveManualSegment(): Promise<void> {
  if (!props.collection || !sourcePath.value || !rect.value) {
    errorMessage.value = '请先在 PDF 页面上框选一个区域'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const result = await window.cet4Api.createManualExamSegment({
      collectionId: props.collection.id,
      sourceFilePath: sourcePath.value,
      pageNo: pageNumber.value,
      rects: [{ pageNo: pageNumber.value, ...rect.value }],
      contentType: role.value,
      paperNo: role.value === 'paper' || role.value === 'answer' || role.value === 'analysis' ? paperNo.value : null,
      audioSlot: role.value === 'analysis' || role.value === 'listening_script' ? audioSlot.value : null
    })
    if (!result.success || !result.collection) throw new Error(result.message || '标注保存失败')
    successMessage.value = `已保存 ${roleLabels[role.value]}片段`
    rect.value = null
    emit('updated', result.collection)
  } catch (error) {
    errorMessage.value = (error as Error).message || '标注保存失败'
  } finally { saving.value = false }
}

async function confirmPending(segment: ExamContentSegmentRecord): Promise<void> {
  saving.value = true
  try {
    const result = await window.cet4Api.updateExamSegment({ segmentId: segment.id, contentType: segment.content_type, status: 'confirmed', paperNo: paperNoForSegment(segment), audioSlot: segment.audio_slot })
    if (!result.success || !result.collection) throw new Error(result.message || '确认失败')
    emit('updated', result.collection)
    successMessage.value = '片段角色已确认'
  } catch (error) {
    errorMessage.value = (error as Error).message || '确认失败'
  } finally { saving.value = false }
}

async function removePending(segment: ExamContentSegmentRecord): Promise<void> {
  const result = await window.cet4Api.deleteExamSegment(segment.id)
  if (!result.success) return
  const refreshed = props.collection ? await window.cet4Api.getExamCollection(props.collection.id) : null
  if (refreshed?.collection) emit('updated', refreshed.collection)
}

function close(): void { if (!saving.value) emit('close') }
watch(() => props.open, async open => {
  if (!open) return
  errorMessage.value = ''
  successMessage.value = ''
  sourcePath.value = sourceFiles.value[0]?.path || ''
  pageNumber.value = 1
  rect.value = null
  await nextTick()
  if (sourcePath.value) await loadPdf()
})
watch(sourceFiles, files => { if (!sourcePath.value && files[0]?.path) { sourcePath.value = files[0].path; void loadPdf() } })
onBeforeUnmount(() => { renderToken++; if (pdfDocument) void pdfDocument.destroy() })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="annotation-overlay" @click.self="close">
      <section class="annotation-dialog">
        <header>
          <div><span>MANUAL ANNOTATION</span><h2>PDF 内容片段标注</h2><p>在原始 PDF 上框选区域，只记录区域与角色，不修改原文件。</p></div>
          <button class="close" :disabled="saving" @click="close">×</button>
        </header>
        <div class="annotation-body">
          <aside class="annotation-controls">
            <label><span>原 PDF</span><select v-model="sourcePath" @change="loadPdf"><option v-for="file in sourceFiles" :key="file.path" :value="file.path">{{ file.fileName }}</option></select></label>
            <label><span>内容角色</span><select v-model="role"><option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
            <label><span>归属卷子</span><select v-model.number="paperNo"><option :value="null">不绑定</option><option v-for="n in 3" :key="n" :value="n">卷 {{ n }}</option></select></label>
            <label><span>音频标记</span><select v-model="audioSlot"><option :value="null">不区分</option><option value="A">A</option><option value="B">B</option></select></label>
            <div class="page-nav"><button type="button" :disabled="pageNumber <= 1 || loading" @click="changePage(-1)">‹ 上一页</button><strong>{{ pageNumber }} / {{ pageCount || '…' }}</strong><button type="button" :disabled="pageNumber >= pageCount || loading" @click="changePage(1)">下一页 ›</button></div>
            <div class="selection-info"><span>当前框选</span><b v-if="rect">{{ Math.round(rect.x * 100) }}%, {{ Math.round(rect.y * 100) }}%<br>{{ Math.round(rect.width * 100) }}% × {{ Math.round(rect.height * 100) }}%</b><b v-else>请在 PDF 上拖动鼠标框选</b></div>
            <button class="save-segment" type="button" :disabled="saving || !rect || !sourcePath" @click="saveManualSegment">{{ saving ? '保存中…' : '保存当前标注' }}</button>
            <p v-if="errorMessage" class="message error">{{ errorMessage }}</p><p v-if="successMessage" class="message success">{{ successMessage }}</p>

            <section v-if="pendingSegments.length" class="pending-list">
              <h3>待核对片段 {{ pendingSegments.length }}</h3>
              <article v-for="segment in pendingSegments" :key="segment.id">
                <div><b>第 {{ segment.page_no }} 页</b><span>{{ confidencePercent(segment.confidence) }}%</span></div>
                <select v-model="segment.content_type"><option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select>
                <pre>{{ segment.text_excerpt || '无原生文字' }}</pre>
                <div class="pending-actions"><button type="button" :disabled="saving" @click="confirmPending(segment)">确认当前角色</button><button type="button" class="danger" @click="removePending(segment)">删除</button></div>
              </article>
            </section>
          </aside>

          <main class="pdf-stage">
            <div v-if="loading" class="stage-state">正在加载 PDF…</div>
            <div v-else-if="!sourcePath" class="stage-state">该合集还没有可标注的原始 PDF</div>
            <div v-else class="page-surface" :class="{ rendering }">
              <canvas ref="canvas"></canvas>
              <div ref="overlay" class="draw-overlay" @pointerdown="startDraw" @pointermove="moveDraw" @pointerup="endDraw" @pointercancel="endDraw">
                <div v-if="rect" class="selection-box" :style="{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }"></div>
              </div>
            </div>
          </main>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.annotation-overlay { position: fixed; inset: 0; z-index: 97000; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(32,25,20,.45); backdrop-filter: blur(5px); }
.annotation-dialog { width: min(1380px, 98vw); height: min(900px, 95vh); display: flex; flex-direction: column; overflow: hidden; border-radius: 15px; background: var(--bg-card); border: 1px solid rgba(255,255,255,.55); box-shadow: 0 30px 100px rgba(30,22,17,.3); }
header { display: flex; justify-content: space-between; padding: 15px 19px 12px; border-bottom: 1px solid var(--glass-border); }
header span { color: var(--accent); font-family: var(--font-mono); font-size: 8px; font-weight: 800; letter-spacing: 1.2px; } header h2 { margin-top: 3px; font-family: var(--font-display); font-size: 19px; color: var(--text-primary); } header p { margin-top: 3px; color: var(--text-muted); font-size: 8px; }
header .close { width: 28px; height: 28px; border-radius: 50%; color: var(--text-muted); background: transparent; font-size: 18px; }
.annotation-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px minmax(0,1fr); }
.annotation-controls { min-height: 0; overflow-y: auto; padding: 13px; border-right: 1px solid var(--glass-border); background: var(--bg-secondary); }
.annotation-controls > label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 9px; }.annotation-controls label span { color: var(--text-muted); font-size: 8px; font-weight: 700; }.annotation-controls select { width: 100%; padding: 7px; border: 1px solid var(--glass-border); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); outline: none; font-size: 9px; }
.page-nav { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 11px 0; }.page-nav button { padding: 5px 7px; border-radius: 5px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-card); font-size: 8px; }.page-nav strong { color: var(--text-muted); font-family: var(--font-mono); font-size: 8px; }
.selection-info { padding: 9px; border-radius: 7px; border: 1px dashed var(--glass-border); background: var(--bg-card); display: flex; flex-direction: column; gap: 4px; }.selection-info span { color: var(--text-muted); font-size: 7px; }.selection-info b { color: var(--text-secondary); font-family: var(--font-mono); font-size: 8px; line-height: 1.5; }
.save-segment { width: 100%; margin-top: 10px; padding: 9px; border-radius: 8px; color: #fff; background: var(--accent); font-size: 9px; font-weight: 700; }.save-segment:disabled { opacity: .4; cursor: default; }
.message { margin-top: 8px; padding: 6px 7px; border-radius: 5px; font-size: 8px; }.message.error { color: var(--danger); background: rgba(220,38,38,.05); }.message.success { color: #047857; background: rgba(16,185,129,.06); }
.pending-list { margin-top: 14px; padding-top: 11px; border-top: 1px solid var(--glass-border); }.pending-list h3 { color: var(--text-primary); font-size: 10px; margin-bottom: 6px; }.pending-list article { margin-bottom: 7px; padding: 7px; border-radius: 7px; border: 1px solid var(--glass-border); background: var(--bg-card); }.pending-list article > div:first-child { display: flex; justify-content: space-between; color: var(--text-muted); font-size: 7px; }.pending-list article > div:first-child b { color: var(--text-secondary); }.pending-list select { width: 100%; margin-top: 5px; padding: 5px; border: 1px solid var(--glass-border); border-radius: 5px; background: var(--bg-secondary); color: var(--text-primary); font-size: 8px; }.pending-list pre { max-height: 55px; overflow: hidden; margin-top: 4px; color: var(--text-muted); white-space: pre-wrap; font-family: var(--font-sans); font-size: 7px; line-height: 1.45; }
.pending-actions { display: flex; gap: 4px; margin-top: 5px; }.pending-actions button { flex: 1; padding: 4px; border-radius: 4px; color: var(--accent); background: rgba(217,119,6,.07); font-size: 7px; font-weight: 700; }.pending-actions button.danger { color: var(--danger); background: rgba(220,38,38,.05); }
.pdf-stage { min-width: 0; min-height: 0; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 22px; background: #dedad3; }
.stage-state { min-height: 60vh; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 10px; }
.page-surface { position: relative; flex-shrink: 0; background: #fff; box-shadow: 0 10px 35px rgba(35,28,23,.18); }.page-surface canvas { display: block; }.page-surface.rendering { opacity: .7; }
.draw-overlay { position: absolute; inset: 0; z-index: 4; cursor: crosshair; touch-action: none; }.selection-box { position: absolute; border: 2px solid #d97706; background: rgba(245,158,11,.2); box-shadow: 0 0 0 9999px rgba(20,15,12,.12); pointer-events: none; }
@media (max-width: 900px) { .annotation-dialog { height: 96vh; }.annotation-body { grid-template-columns: 230px minmax(0,1fr); }.pdf-stage { padding: 10px; } }
</style>
