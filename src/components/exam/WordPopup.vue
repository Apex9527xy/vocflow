<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../../composables/useWordPronunciation'

const props = defineProps<{
  word: string
  x: number
  y: number
  context?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const result = ref<any>(null)
const loading = ref(false)
const notFound = ref(false)
const addedToVocab = ref(false)
const playingAccent = ref<'' | PronunciationAccent>('')
const audioNotice = ref('')
let lookupRequestId = 0
let outsideClickTimer: ReturnType<typeof setTimeout> | null = null
let addedTimer: ReturnType<typeof setTimeout> | null = null

async function lookup() {
  if (!props.word) return
  const requestId = ++lookupRequestId
  loading.value = true
  notFound.value = false
  result.value = null

  try {
    const results = await window.cet4Api.searchWords(props.word)
    if (requestId !== lookupRequestId) return
    if (results && results.length > 0) {
      // 精确匹配优先
      const exact = results.find((r: any) => r.word?.toLowerCase() === props.word.toLowerCase())
      result.value = exact || results[0]
    } else {
      notFound.value = true
    }
  } catch {
    if (requestId === lookupRequestId) notFound.value = true
  } finally {
    if (requestId === lookupRequestId) loading.value = false
  }
}

async function speak(accent: PronunciationAccent) {
  if (!result.value?.word) return
  if (playingAccent.value === accent) { stopWordPronunciation(); playingAccent.value = ''; return }
  playingAccent.value = accent; audioNotice.value = ''
  try { await playWordPronunciation(result.value.word, accent) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2200) }
  finally { if (playingAccent.value === accent) playingAccent.value = '' }
}

async function addToVocab() {
  if (!result.value) return
  await window.cet4Api.addVocabWord({
    wordId: result.value.id,
    wordText: result.value.word,
    meaningCn: result.value.meaning_cn,
    phoneticUs: result.value.phonetic_us,
    source: 'exam',
    context: props.context
  })
  addedToVocab.value = true
  if (addedTimer) clearTimeout(addedTimer)
  addedTimer = setTimeout(() => {
    addedToVocab.value = false
    addedTimer = null
  }, 2000)
}

function handleClickOutside(e: MouseEvent) {
  const popup = document.querySelector('.word-popup')
  if (popup && !popup.contains(e.target as Node)) {
    emit('close')
  }
}

watch(() => props.word, () => {
  if (props.word) lookup()
}, { immediate: true })

// 挂载时监听外部点击
onMounted(() => {
  outsideClickTimer = setTimeout(() => {
    document.addEventListener('click', handleClickOutside)
    outsideClickTimer = null
  }, 100)
})
onUnmounted(() => {
  lookupRequestId += 1
  if (outsideClickTimer) clearTimeout(outsideClickTimer)
  if (addedTimer) clearTimeout(addedTimer)
  document.removeEventListener('click', handleClickOutside)
  stopWordPronunciation()
})
</script>

<template>
  <div
    class="word-popup"
    :style="{ left: x + 'px', top: y + 'px' }"
    @click.stop
  >
    <div v-if="loading" class="popup-loading">查询中...</div>

    <div v-else-if="notFound" class="popup-empty">
      <div class="popup-word">{{ word }}</div>
      <div class="popup-hint">词库中未找到该词</div>
    </div>

    <div v-else-if="result" class="popup-content">
      <div class="popup-header">
        <span class="popup-word">{{ result.word }}</span>
        <div class="audio-actions"><button class="speak-btn" :class="{ playing: playingAccent === 'us' }" @click="speak('us')">🔊 美</button><button class="speak-btn" :class="{ playing: playingAccent === 'uk' }" @click="speak('uk')">🔊 英</button></div>
      </div>
      <div v-if="result.phonetic_us" class="popup-phonetic">{{ result.phonetic_us }}</div>
      <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
      <div class="popup-meaning">{{ result.meaning_cn }}</div>
      <div v-if="result.pos" class="popup-pos">{{ result.pos }}</div>
      <div v-if="result.example_sentence" class="popup-example">{{ result.example_sentence }}</div>
      <div v-if="result.frequency" class="popup-freq">
        频率：<span class="freq-stars">{{ '★'.repeat(result.frequency) }}{{ '☆'.repeat(5 - result.frequency) }}</span>
      </div>
      <button class="vocab-btn" :class="{ added: addedToVocab }" @click="addToVocab">
        {{ addedToVocab ? '✓ 已收藏' : '+ 收藏' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.word-popup {
  position: fixed;
  z-index: 9999;
  min-width: 220px;
  max-width: 340px;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(44, 36, 32, 0.12), 0 2px 8px rgba(44, 36, 32, 0.06);
  padding: 14px 16px;
  animation: popupIn 0.15s ease-out;
}

@keyframes popupIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.popup-loading, .popup-empty {
  text-align: center;
  padding: 8px 0;
}

.popup-loading {
  font-size: 12px;
  color: var(--text-muted);
}

.popup-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.popup-word {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.audio-actions { display:flex; gap:5px; }.speak-btn.playing { animation:popup-audio-pulse .7s infinite alternate; background:rgba(217,119,6,.18); }.audio-notice { margin:5px 0; color:#9a3412; font-size:10px; }@keyframes popup-audio-pulse{to{transform:scale(1.06);opacity:.72}}
.speak-btn {
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  background: rgba(217, 119, 6, 0.08);
  color: var(--accent);
}

.speak-btn:hover {
  background: rgba(217, 119, 6, 0.15);
}

.popup-phonetic {
  font-size: 13px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-bottom: 8px;
}

.popup-meaning {
  font-size: 14px;
  color: var(--accent);
  font-weight: 500;
  margin-bottom: 4px;
  line-height: 1.5;
}

.popup-pos {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.popup-example {
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
  line-height: 1.5;
  padding: 6px 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-top: 6px;
}

.popup-freq {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

.freq-stars {
  color: var(--accent);
  letter-spacing: 1px;
}

.vocab-btn {
  width: 100%;
  margin-top: 8px;
  padding: 6px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: rgba(217, 119, 6, 0.06);
  border: 1px solid rgba(217, 119, 6, 0.15);
  transition: all var(--transition-fast);
}

.vocab-btn:hover {
  background: rgba(217, 119, 6, 0.12);
}

.vocab-btn.added {
  color: var(--success);
  background: rgba(107, 203, 119, 0.08);
  border-color: rgba(107, 203, 119, 0.15);
}
</style>
