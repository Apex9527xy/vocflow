<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExamSegmentPdfPane from './ExamSegmentPdfPane.vue'
import PdfInkToolRail from '../PdfInkToolRail.vue'
import type { PdfInkTool } from '../../lib/pdf-ink'
import { examPaperTypeLabel, examSeasonLabel } from '../../lib/examMetadata'

const props = defineProps<{ collectionId: number; type?: string }>()
const appIconUrl = new URL('./assets/icon.png', window.location.href).href
const emit = defineEmits<{ (event: 'close'): void; (event: 'annotate', collection: ExamCollectionDetail): void }>()

const collection = ref<ExamCollectionDetail | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const activePaperNo = ref(1)
const activeAudioSlot = ref<'A' | 'B'>('A')
const showAnalysis = ref(false)
const readerZoom = ref(1)
const activeInkTool = ref<PdfInkTool>('select')
const inkColor = ref('#ef4444')
const inkLineWidth = ref(3)
const inkEraserSize = ref(20)
const audioElement = ref<HTMLAudioElement | null>(null)
const audioUrl = ref('')
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const playbackRates = [0.75, 1, 1.25, 1.5, 2]
type SeekStep = 1 | 2 | 5
const seekStep = ref<SeekStep>(2)
const seekSteps: SeekStep[] = [1, 2, 5]
const isMiddleSchool = computed(() => props.type === 'middleSchool')
const visibleAudioSlots = computed<Array<'A' | 'B'>>(() => isMiddleSchool.value ? ['A'] : ['A', 'B'])

const paperTabs = computed(() => [1, 2, 3].map(no => ({ no, paper: collection.value?.papers.find(item => item.paper_no === no) || null })))
const activePaper = computed(() => isMiddleSchool.value ? (collection.value?.papers[0] || null) : (collection.value?.papers.find(item => item.paper_no === activePaperNo.value) || null))
const activeSegments = computed(() => collection.value?.segments.filter(segment => (segment.paper_id === activePaper.value?.id || segment.paper_id == null) && ['auto_confirmed', 'confirmed'].includes(segment.status)) || [])
const examSegments = computed(() => activeSegments.value.filter(segment => segment.content_type === 'paper'))
const analysisSegments = computed(() => activeSegments.value.filter(segment => segment.content_type === 'analysis' && (!segment.audio_slot || segment.audio_slot === activeAudioSlot.value)))
const pendingSegments = computed(() => collection.value?.segments.filter(segment => segment.status === 'pending_review') || [])
const audioForSlot = computed(() => collection.value?.audio.find(item => item.audio_slot === activeAudioSlot.value) || null)
const audioTime = computed(() => `${formatTime(currentTime.value)} / ${duration.value ? formatTime(duration.value) : '--:--'}`)
const audioProgress = computed(() => duration.value ? Math.min(100, currentTime.value / duration.value * 100) : 0)
const audioProgressStyle = computed(() => ({ '--audio-progress': `${audioProgress.value}%` }))
const paperTitle = computed(() => activePaper.value ? `${activePaper.value.title} · 卷${activePaper.value.paper_no}` : '尚未导入该套卷子')
const examTypeLabel = computed(() => examPaperTypeLabel(collection.value?.exam_type))
const seasonLabel = computed(() => examSeasonLabel(collection.value?.session))

function formatTime(value: number): string { return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` }
function hasAudio(slot: 'A' | 'B'): boolean { return Boolean(collection.value?.audio.some(item => item.audio_slot === slot && item.status === 'available')) }
function changeZoom(delta: number): void { readerZoom.value = Math.max(0.6, Math.min(1.8, Math.round((readerZoom.value + delta) * 10) / 10)) }

async function loadCollection(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await window.cet4Api.getExamCollection(props.collectionId)
    if (!result.success || !result.collection) throw new Error(result.message || '真题合集加载失败')
    collection.value = result.collection
    if (isMiddleSchool.value) {
      activePaperNo.value = result.collection.papers[0]?.paper_no || 1
    } else if (!result.collection.papers.some(paper => paper.paper_no === activePaperNo.value)) {
      activePaperNo.value = result.collection.papers[0]?.paper_no || 1
    }
    if (isMiddleSchool.value) activeAudioSlot.value = 'A'
    else if (!hasAudio(activeAudioSlot.value)) activeAudioSlot.value = hasAudio('A') ? 'A' : hasAudio('B') ? 'B' : 'A'
  } catch (error) {
    errorMessage.value = (error as Error).message || '真题合集加载失败'
  } finally { loading.value = false }
}

async function selectAudio(slot: 'A' | 'B'): Promise<void> {
  if (!hasAudio(slot)) {
    const picked = await window.cet4Api.pickCollectionAudio()
    if (!picked.success || picked.canceled || !picked.filePath) return
    const imported = await window.cet4Api.importCollectionAudio({ collectionId: props.collectionId, audioSlot: slot, filePath: picked.filePath })
    if (!imported.success) { errorMessage.value = imported.message; return }
    await loadCollection()
  }
  activeAudioSlot.value = slot
  stopAudio()
  await prepareAudio()
}

async function prepareAudio(): Promise<void> {
  if (!hasAudio(activeAudioSlot.value)) return
  try {
    const result = await window.cet4Api.getCollectionAudioData({ collectionId: props.collectionId, audioSlot: activeAudioSlot.value })
    if (!result.success || !result.data) throw new Error(result.message || '音频加载失败')
    stopAudio()
    const raw = result.data
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    audioUrl.value = URL.createObjectURL(new Blob([buffer], { type: result.mimeType || 'audio/mpeg' }))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  } catch (error) {
    errorMessage.value = (error as Error).message || '音频加载失败'
  }
}

async function togglePlayback(): Promise<void> {
  if (!audioUrl.value) await prepareAudio()
  const audio = audioElement.value
  if (!audio) return
  audio.playbackRate = playbackRate.value
  if (!audio.paused) { audio.pause(); playing.value = false }
  else { await audio.play(); playing.value = true }
}

function stopAudio(): void {
  audioElement.value?.pause()
  playing.value = false
  currentTime.value = 0
  duration.value = 0
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = ''
}

function updateAudioState(): void {
  const audio = audioElement.value
  if (!audio) return
  audio.playbackRate = playbackRate.value
  playing.value = !audio.paused
  currentTime.value = audio.currentTime || 0
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
}

function seekAudio(event: Event): void {
  const audio = audioElement.value
  if (!audio) return
  const next = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(next)) return
  audio.currentTime = Math.max(0, Math.min(next, duration.value || next))
  currentTime.value = audio.currentTime
}

function seekAudioBy(delta: number): void {
  const audio = audioElement.value
  if (!audio) return
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
  const knownDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration.value
  const limit = knownDuration > 0 ? knownDuration : Number.POSITIVE_INFINITY
  audio.currentTime = Math.max(0, Math.min(limit, current + delta))
  currentTime.value = audio.currentTime
  if (!audio.paused) updateAudioState()
}

function changeSeekStep(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (value === 1 || value === 2 || value === 5) seekStep.value = value
}

function changePlaybackRate(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value)) return
  playbackRate.value = Math.max(0.5, Math.min(2, value))
  if (audioElement.value) audioElement.value.playbackRate = playbackRate.value
}

function selectPaper(no: number): void {
  if (!paperTabs.value.find(item => item.no === no)?.paper) return
  activePaperNo.value = no
}

function close(): void { stopAudio(); emit('close') }
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    close()
    return
  }
  const target = event.target
  const isEditing = target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
  if (isEditing || event.ctrlKey || event.metaKey || event.altKey) return

  if (event.code === 'Space' || event.key === ' ') {
    if (event.repeat) return
    event.preventDefault()
    void togglePlayback()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    seekAudioBy(-seekStep.value)
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    seekAudioBy(seekStep.value)
  }
}

onMounted(() => { window.addEventListener('keydown', handleKeydown); void loadCollection() })
onBeforeUnmount(() => { window.removeEventListener('keydown', handleKeydown); stopAudio() })
watch(() => props.collectionId, () => { void loadCollection() })
watch(activeAudioSlot, () => { if (collection.value) void prepareAudio() })
</script>

<template>
  <Teleport to="body">
    <section class="collection-reader-overlay">
      <PdfInkToolRail :tool="activeInkTool" :color="inkColor" :line-width="inkLineWidth" :eraser-size="inkEraserSize" @tool="activeInkTool = $event" @color="inkColor = $event" @line-width="inkLineWidth = $event" @eraser-size="inkEraserSize = $event" />
      <header class="collection-reader-toolbar">
        <div class="reader-brand"><img :src="appIconUrl" alt="VocFlow" /><div><strong>VocFlow</strong><small>真题阅读</small></div></div>
        <button class="back" type="button" @click="close">‹ 返回</button>
        <div class="title-group"><strong>{{ collection?.title || '真题合集' }}</strong><span>{{ examTypeLabel }} · {{ collection?.year || '年份未分类' }} · {{ seasonLabel }} · {{ isMiddleSchool ? '单卷单听力' : `${collection?.papers.length || 0}/3 套` }}</span></div>
        <div class="tool-set">
          <div class="zoom-control"><button type="button" title="缩小 PDF" @click="changeZoom(-0.1)">−</button><span>{{ Math.round(readerZoom * 100) }}%</span><button type="button" title="放大 PDF" @click="changeZoom(0.1)">＋</button></div>
          <button v-for="slot in visibleAudioSlots" :key="slot" class="audio-slot" :class="{ active: activeAudioSlot === slot, missing: !hasAudio(slot) }" type="button" @click="selectAudio(slot)">🔊 {{ slot }}<small>{{ hasAudio(slot) ? '听力' : '导入' }}</small></button>
          <button class="tool-toggle" :class="{ active: showAnalysis }" type="button" :disabled="!analysisSegments.length" @click="showAnalysis = !showAnalysis">⇄ 解析对照</button>
        </div>
      </header>

      <div v-if="hasAudio(activeAudioSlot)" class="audio-line">
        <span class="audio-slot-label">听力 {{ activeAudioSlot }}</span>
        <div class="audio-controls">
          <div class="audio-progress-shell">
            <button class="audio-skip" type="button" :title="`后退 ${seekStep} 秒`" :aria-label="`后退 ${seekStep} 秒`" :disabled="!duration" @click="seekAudioBy(-seekStep)">−{{ seekStep }}s</button>
            <button class="play audio-play" type="button" :disabled="!hasAudio(activeAudioSlot)" :title="playing ? '暂停' : '播放'" :aria-label="playing ? '暂停听力' : '播放听力'" @click="togglePlayback">{{ playing ? '⏸' : '▶' }}</button>
            <input class="audio-scrubber" type="range" min="0" :max="duration || 1" step="0.1" :value="currentTime" :style="audioProgressStyle" :disabled="!duration" aria-label="听力播放进度" @input="seekAudio" />
            <button class="audio-skip" type="button" :title="`前进 ${seekStep} 秒`" :aria-label="`前进 ${seekStep} 秒`" :disabled="!duration" @click="seekAudioBy(seekStep)">+{{ seekStep }}s</button>
          </div>
        </div>
        <b>{{ audioTime }}</b>
        <label class="audio-step"><span>步长</span><select :value="seekStep" aria-label="音频前进后退步长" @change="changeSeekStep"><option v-for="step in seekSteps" :key="step" :value="step">{{ step }}s</option></select></label>
        <label class="audio-speed"><span>倍速</span><select :value="playbackRate" aria-label="音频播放倍速" @change="changePlaybackRate"><option v-for="rate in playbackRates" :key="rate" :value="rate">{{ rate }}×</option></select></label>
      </div>
      <div v-if="errorMessage" class="reader-error">{{ errorMessage }}</div>
      <div v-if="pendingSegments.length" class="pending-banner"><span>有 {{ pendingSegments.length }} 个低置信度片段尚未进入正式阅读区</span><button type="button" @click="collection && emit('annotate', collection)">现在核对</button></div>

      <div v-if="!isMiddleSchool" class="paper-tabs">
        <button v-for="tab in paperTabs" :key="tab.no" type="button" :class="{ active: activePaperNo === tab.no, missing: !tab.paper }" :disabled="!tab.paper" @click="selectPaper(tab.no)">卷 {{ tab.no }}<small>{{ tab.paper ? '可阅读' : '未导入' }}</small></button>
      </div>

      <main class="reader-main" :class="{ compare: showAnalysis }">
        <section class="reading-column paper-column">
          <header><strong>真题题干</strong><span>{{ paperTitle }}</span></header>
          <div v-if="loading" class="column-state">正在加载合集…</div>
          <div v-else-if="!activePaper" class="column-state"><strong>该套卷子尚未导入</strong><span>合集允许缺失卷子，可继续使用其他卷或稍后补充。</span></div>
          <div v-else-if="!examSegments.length" class="column-state"><strong>暂无已确认的真题片段</strong><span>可在“待核对片段”中核对内容区域，或重新批量导入带语义片段的 PDF。</span></div>
          <ExamSegmentPdfPane v-else :collection-id="props.collectionId" :paper-id="activePaper.id" :segments="examSegments" role="paper" label="真题原文" :zoom="readerZoom" :active-ink-tool="activeInkTool" :ink-color="inkColor" :ink-line-width="inkLineWidth" :eraser-size="inkEraserSize" />
        </section>

        <section v-if="showAnalysis" class="reading-column analysis-column">
          <header><strong>对应解析</strong><span>当前听力 {{ activeAudioSlot }}</span></header>
          <div v-if="!analysisSegments.length" class="column-state">当前卷子还没有可用解析片段。</div>
          <ExamSegmentPdfPane v-else :collection-id="props.collectionId" :paper-id="activePaper?.id || 0" :segments="analysisSegments" role="analysis" label="对应解析" :zoom="readerZoom" :active-ink-tool="activeInkTool" :ink-color="inkColor" :ink-line-width="inkLineWidth" :eraser-size="inkEraserSize" />
        </section>
      </main>


      <audio ref="audioElement" :src="audioUrl" @loadedmetadata="updateAudioState" @timeupdate="updateAudioState" @durationchange="updateAudioState" @play="updateAudioState" @pause="updateAudioState" @ended="updateAudioState"></audio>
    </section>
  </Teleport>
</template>

<style scoped>
.collection-reader-overlay { position: fixed; inset: 0; z-index: 94000; isolation: isolate; display: flex; flex-direction: column; background: #e9e5df; color: var(--text-primary); }
.collection-reader-toolbar { position: relative; z-index: 30; overflow: visible; box-sizing: border-box; padding: 8px 170px 8px 14px; flex-shrink: 0; display: flex; gap: 12px; align-items: center; min-height: 58px; border-bottom: 1px solid rgba(61,51,45,.13); background: rgba(255,252,247,.97); box-shadow: 0 2px 14px rgba(44,36,32,.08); backdrop-filter: blur(12px); }
.reader-brand { flex-shrink:0; display:flex; align-items:center; gap:8px; margin-right:2px; }.reader-brand img { width:34px; height:34px; object-fit:contain; border-radius:9px; }.reader-brand div { display:flex; flex-direction:column; line-height:1.15; }.reader-brand strong { color:var(--text-primary); font-family:var(--font-display); font-size:13px; }.reader-brand small { margin-top:2px; color:var(--text-muted); font-size:8px; }
.back { flex-shrink: 0; padding: 7px 11px; border-radius: 8px; border: 1px solid rgba(217,119,6,.2); color: var(--accent-dim); background: rgba(217,119,6,.04); font-size: 9px; font-weight: 700; }
.title-group { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }.title-group strong { color: var(--text-primary); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }.title-group span { color: var(--text-muted); font-size: 8px; }
.tool-set { position: relative; z-index: 40; display: flex; gap: 4px; align-items: center; justify-content: flex-end; flex-wrap: wrap; flex-shrink: 0; }.zoom-control { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--glass-border); border-radius: 7px; background: var(--bg-secondary); }.zoom-control button { width: 24px; height: 24px; border: 0 !important; background: transparent !important; }.zoom-control span { min-width: 34px; color: var(--text-muted); font-family: var(--font-mono); font-size: 7px; text-align: center; }.tool-set button { border: 1px solid var(--glass-border); border-radius: 7px; color: var(--text-secondary); background: var(--bg-secondary); font-size: 8px; font-weight: 700; }
.audio-batch { min-width: 82px; padding: 5px 7px; color: #b45309 !important; border-style: dashed !important; }.audio-slot { min-width: 53px; padding: 5px 7px; }.audio-slot small { display: block; margin-top: 1px; font-size: 6px; color: var(--text-muted); }.audio-slot.active { color: var(--accent); border-color: rgba(217,119,6,.3); background: rgba(217,119,6,.08); }.audio-slot.missing { border-style: dashed; color: #b45309; }
.play { width: 30px; height: 30px; }.audio-play { width: 22px; height: 22px; padding: 0; border: 0 !important; border-radius: 50% !important; color: #fff !important; background: var(--accent) !important; font-size: 10px !important; line-height: 22px; box-shadow: 0 2px 7px rgba(217,119,6,.24); }.audio-play:disabled { opacity: .45; }.tool-toggle { padding: 7px 8px; }.tool-toggle.active { color: var(--accent); border-color: rgba(217,119,6,.3); background: rgba(217,119,6,.08); }.annotate { padding: 7px 9px; color: #fff !important; background: var(--accent) !important; border-color: transparent !important; }
.audio-line { display: flex; gap: 9px; align-items: center; padding: 6px 14px; border-bottom: 1px solid rgba(61,51,45,.08); background: rgba(250,247,242,.95); color: var(--text-muted); font-size: 8px; }
.audio-slot-label { flex-shrink: 0; min-width: 44px; color: var(--text-secondary); font-weight: 700; }
.audio-controls { flex: 1; min-width: 0; display: flex; align-items: center; gap: 5px; }
.audio-progress-shell { flex: 1; min-width: 180px; height: 30px; display: flex; align-items: center; gap: 7px; padding: 0 7px 0 4px; border: 1px solid rgba(217,119,6,.16); border-radius: 999px; background: rgba(255,253,249,.96); box-shadow: inset 0 1px 2px rgba(44,36,32,.04); }
.audio-skip { flex-shrink: 0; min-width: 38px; height: 22px; padding: 0 6px; border: 1px solid rgba(61,51,45,.1); border-radius: 999px; color: var(--text-secondary); background: rgba(255,253,249,.9); font-family: var(--font-mono); font-size: 8px; font-weight: 700; }
.audio-skip:hover:not(:disabled) { color: var(--accent-dim); border-color: rgba(217,119,6,.28); background: rgba(217,119,6,.06); }
.audio-skip:disabled { opacity: .42; cursor: default; }
.audio-scrubber { --audio-progress: 0%; flex: 1; min-width: 80px; height: 14px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
.audio-scrubber:disabled { cursor: default; opacity: .55; }
.audio-scrubber::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: linear-gradient(to right, var(--accent) 0 var(--audio-progress), rgba(44,36,32,.11) var(--audio-progress) 100%); }
.audio-scrubber::-webkit-slider-thumb { width: 13px; height: 13px; margin-top: -4.5px; appearance: none; border: 2px solid #fffdf9; border-radius: 50%; background: var(--accent); box-shadow: 0 1px 5px rgba(44,36,32,.24); }
.audio-line b { min-width: 73px; text-align: right; font-family: var(--font-mono); font-size: 7px; }
.audio-step, .audio-speed { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 7px; border: 1px solid var(--glass-border); border-radius: 7px; background: var(--bg-secondary); font-size: 7px; white-space: nowrap; }
.audio-step select, .audio-speed select { padding: 2px 3px; border: 0; outline: none; color: var(--text-primary); background: transparent; font-family: var(--font-mono); font-size: 8px; cursor: pointer; }
.reader-error { padding: 5px 14px; color: #b91c1c; background: #fef2f2; font-size: 8px; border-bottom: 1px solid rgba(220,38,38,.12); }
.pending-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 14px; border-bottom: 1px solid rgba(245,158,11,.14); color: #b45309; background: rgba(255,251,235,.95); font-size: 8px; }.pending-banner button { padding: 4px 7px; border-radius: 5px; color: #b45309; background: rgba(245,158,11,.1); font-size: 7px; font-weight: 700; }
.paper-tabs { position: relative; z-index: 10; flex-shrink: 0; display: flex; gap: 4px; padding: 7px 13px 0; background: rgba(245,241,235,.95); }.paper-tabs button { padding: 7px 13px; border-radius: 8px 8px 0 0; border: 1px solid transparent; color: var(--text-muted); background: transparent; font-size: 9px; font-weight: 700; }.paper-tabs button small { display: block; margin-top: 1px; font-size: 6px; font-weight: 500; }.paper-tabs button.active { color: var(--accent); background: #fffdf9; border-color: var(--glass-border); border-bottom-color: #fffdf9; }.paper-tabs button.missing { opacity: .38; cursor: default; }
.reader-main { position: relative; z-index: 1; flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr); padding: 0 13px 13px; background: #e9e5df; }.reader-main.compare { grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8px; }
.reading-column { position: relative; z-index: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: #fffdf9; border: 1px solid var(--glass-border); border-radius: 0 0 10px 10px; box-shadow: 0 7px 24px rgba(44,36,32,.12); }.reader-main.compare .reading-column { border-radius: 10px; margin-top: 0; }
.reading-column > header { flex-shrink: 0; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--glass-border); background: rgba(248,245,240,.9); }.reading-column > header strong { color: var(--text-primary); font-size: 10px; }.reading-column > header span { color: var(--text-muted); font-size: 7px; }
.segment-stream { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 28px 45px; }.reading-segment { margin-bottom: 15px; padding: 0 0 13px; border-bottom: 1px dashed var(--glass-border); }.reading-segment:last-child { border-bottom: 0; }.segment-head { display: flex; gap: 7px; align-items: center; margin-bottom: 6px; color: var(--accent); font-family: var(--font-mono); font-size: 7px; }.segment-head i { padding: 2px 5px; border-radius: 5px; color: #047857; background: rgba(16,185,129,.07); font-style: normal; font-family: var(--font-sans); }
.reading-segment p { color: #2d2723; font-size: 13px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; text-align: justify; }.analysis-segment p { color: #4b4038; }
.column-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-muted); font-size: 9px; text-align: center; }.column-state strong { color: var(--text-secondary); font-size: 12px; }
audio { display: none; }
@media (max-width: 1050px) { .collection-reader-toolbar { align-items: flex-start; flex-wrap: wrap; }.title-group { flex-basis: calc(100% - 100px); }.tool-set { margin-left: auto; }.reader-main.compare { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }.reader-drawer { width: min(360px, 78vw); } }
</style>


