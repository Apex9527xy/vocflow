<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import ExamDocumentPane from './ExamDocumentPane.vue'
import { examPaperTypeLabel, examSeasonLabel } from '../../lib/examMetadata'

const props = defineProps<{ set: ExamSetRecord }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const hasAudio = computed(() => Boolean(props.set.resources.audio))
const hasAnalysis = computed(() => Boolean(props.set.resources.analysis))
const showAnalysis = ref(props.set.reader_mode === 'compare' && Boolean(props.set.resources.analysis))
const zoom = ref(0.92)
const audioElement = ref<HTMLAudioElement | null>(null)
const audioUrl = ref('')
const audioLoading = ref(false)
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const errorMessage = ref('')

const categoryText = computed(() => examPaperTypeLabel(props.set.paper_type))
const seasonText = computed(() => examSeasonLabel(props.set.season))
const subtitle = computed(() => [categoryText.value, props.set.year ? `${props.set.year} 年` : '年份未分类', seasonText.value, props.set.set_no ? `第 ${props.set.set_no} 套` : ''].filter(Boolean).join(' · '))
const audioTime = computed(() => {
  const format = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
  return `${format(currentTime.value)} / ${duration.value ? format(duration.value) : '--:--'}`
})
const audioProgress = computed(() => duration.value ? Math.min(100, (currentTime.value / duration.value) * 100) : 0)

async function ensureAudio(): Promise<void> {
  if (audioUrl.value) return
  if (!hasAudio.value) throw new Error('尚未导入配套音频')
  audioLoading.value = true
  try {
    const result = await window.cet4Api.getExamResourceData({ paperId: props.set.id, role: 'audio' })
    if (!result.success || result.data == null) throw new Error(result.message || '音频加载失败')
    const rawData: unknown = result.data
    let raw: Uint8Array
    if (rawData instanceof Uint8Array) raw = rawData
    else if (rawData instanceof ArrayBuffer) raw = new Uint8Array(rawData)
    else raw = new Uint8Array(Object.values(rawData as Record<string, number>))
    const audioBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    const blob = new Blob([audioBuffer], { type: result.mimeType || 'audio/mpeg' })
    audioUrl.value = URL.createObjectURL(blob)
    await nextTick()
  } finally {
    audioLoading.value = false
  }
}

async function toggleAudio(): Promise<void> {
  errorMessage.value = ''
  try {
    await ensureAudio()
    const audio = audioElement.value
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      playing.value = false
    } else {
      await audio.play()
      playing.value = true
    }
  } catch (error) {
    errorMessage.value = (error as Error).message || '无法播放音频'
  }
}

function updateAudioState(): void {
  const audio = audioElement.value
  if (!audio) return
  playing.value = !audio.paused
  currentTime.value = audio.currentTime || 0
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
}

function toggleAnalysis(): void {
  if (!hasAnalysis.value) return
  showAnalysis.value = !showAnalysis.value
  void window.cet4Api.saveExamReaderState({
    paperId: props.set.id,
    mode: showAnalysis.value ? 'compare' : 'single'
  })
}

function changeZoom(delta: number): void {
  zoom.value = Math.min(1.6, Math.max(0.55, Number((zoom.value + delta).toFixed(2))))
}

function closeReader(): void {
  audioElement.value?.pause()
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeReader()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  void window.cet4Api.saveExamReaderState({ paperId: props.set.id, mode: showAnalysis.value ? 'compare' : 'single' })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  audioElement.value?.pause()
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
})
</script>

<template>
  <Teleport to="body">
    <section class="exam-reader-overlay">
      <header class="exam-reader-toolbar">
        <button class="reader-back" type="button" @click="closeReader">‹ 返回真题库</button>
        <div class="reader-title-group">
          <strong>{{ set.title }}</strong>
          <span>{{ subtitle }}</span>
        </div>
        <div class="reader-tool-buttons">
          <button class="icon-tool" :class="{ active: playing }" type="button" :disabled="!hasAudio || audioLoading" :title="hasAudio ? (playing ? '暂停音频' : '播放配套音频') : '尚未导入配套音频'" @click="toggleAudio">
            <svg v-if="!playing" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-8v2.1a6 6 0 0 1 0 11.8V20a8 8 0 0 0 0-16z"/></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
          </button>
          <button class="icon-tool analysis-tool" :class="{ active: showAnalysis }" type="button" :disabled="!hasAnalysis" :title="hasAnalysis ? (showAnalysis ? '切回只看真题' : '真题与解析双栏对照') : '尚未导入解析文本'" @click="toggleAnalysis">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v16H4zm9 0h7v16h-7zM6 7h3v2H6zm0 4h3v2H6zm0 4h3v2H6zm9-8h3v2h-3zm0 4h3v2h-3zm0 4h3v2h-3z"/></svg>
          </button>
          <span class="reader-divider"></span>
          <button class="zoom-button" type="button" title="缩小" @click="changeZoom(-0.1)">−</button>
          <button class="zoom-value" type="button" title="恢复 100%" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
          <button class="zoom-button" type="button" title="放大" @click="changeZoom(0.1)">＋</button>
        </div>
      </header>

      <div v-if="hasAudio" class="audio-strip" :class="{ playing }">
        <span>配套音频</span>
        <div class="audio-progress"><div :style="{ width: `${audioProgress}%` }"></div></div>
        <i>{{ audioTime }}</i>
      </div>
      <div v-if="errorMessage" class="reader-error">{{ errorMessage }}</div>

      <main class="exam-reader-panes" :class="{ 'compare-mode': showAnalysis }">
        <ExamDocumentPane class="text-pane" :paper-id="set.id" role="text" label="真题文本" :resource="set.resources.text" :zoom="zoom" />
        <ExamDocumentPane v-if="showAnalysis" class="analysis-pane" :paper-id="set.id" role="analysis" label="解析文本" :resource="set.resources.analysis" :zoom="zoom" />
      </main>

      <audio ref="audioElement" :src="audioUrl" preload="metadata" @timeupdate="updateAudioState" @durationchange="updateAudioState" @play="updateAudioState" @pause="updateAudioState" @ended="updateAudioState"></audio>
    </section>
  </Teleport>
</template>

<style scoped>
.exam-reader-overlay { position: fixed; inset: 0; z-index: 94000; display: flex; flex-direction: column; background: #e9e5df; }
.exam-reader-toolbar { flex-shrink: 0; display: flex; align-items: center; gap: 13px; min-height: 58px; padding: 8px 14px; border-bottom: 1px solid rgba(61,51,45,.13); background: rgba(255,252,247,.97); box-shadow: 0 2px 14px rgba(44,36,32,.08); backdrop-filter: blur(12px); }
.reader-back { flex-shrink: 0; padding: 7px 11px; border: 1px solid rgba(217,119,6,.2); border-radius: 8px; color: var(--accent-dim); background: rgba(217,119,6,.035); font-size: 10px; font-weight: 700; }
.reader-title-group { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.reader-title-group strong { color: var(--text-primary); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.reader-title-group span { color: var(--text-muted); font-size: 8px; }
.reader-tool-buttons { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.icon-tool { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-secondary); background: var(--bg-secondary); }
.icon-tool svg { width: 16px; height: 16px; fill: currentColor; }
.icon-tool:hover:not(:disabled), .icon-tool.active { color: var(--accent); border-color: rgba(217,119,6,.28); background: rgba(217,119,6,.08); }
.icon-tool:disabled { opacity: .28; cursor: default; }
.reader-divider { width: 1px; height: 20px; margin: 0 4px; background: var(--glass-border); }
.zoom-button, .zoom-value { height: 28px; border-radius: 7px; color: var(--text-secondary); background: var(--bg-secondary); border: 1px solid var(--glass-border); font-size: 10px; }
.zoom-button { width: 28px; }
.zoom-value { min-width: 45px; font-family: var(--font-mono); font-size: 8px; }
.audio-strip { flex-shrink: 0; display: flex; align-items: center; gap: 10px; padding: 5px 15px; border-bottom: 1px solid rgba(61,51,45,.09); background: rgba(250,247,242,.96); color: var(--text-muted); font-size: 8px; }
.audio-strip.playing { color: var(--accent-dim); background: rgba(255,250,241,.98); }
.audio-progress { flex: 1; height: 3px; overflow: hidden; border-radius: 2px; background: rgba(44,36,32,.08); }
.audio-progress div { height: 100%; background: var(--accent); transition: width .18s linear; }
.audio-strip i { min-width: 78px; text-align: right; font-family: var(--font-mono); font-style: normal; }
.reader-error { flex-shrink: 0; padding: 6px 15px; color: #b91c1c; background: #fef2f2; border-bottom: 1px solid rgba(220,38,38,.12); font-size: 9px; }
.exam-reader-panes { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
.exam-reader-panes.compare-mode { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.text-pane, .analysis-pane { min-width: 0; min-height: 0; height: 100%; }
.analysis-pane { border-left: 1px solid rgba(61,51,45,.16); }
audio { display: none; }
@media (max-width: 900px) { .exam-reader-toolbar { align-items: flex-start; flex-wrap: wrap; } .reader-title-group { flex-basis: calc(100% - 120px); } .reader-tool-buttons { margin-left: auto; } .exam-reader-panes.compare-mode { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } .analysis-pane { border-left: 0; border-top: 1px solid rgba(61,51,45,.16); } }
</style>
