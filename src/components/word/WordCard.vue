<script setup lang="ts">
import { ref } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../../composables/useWordPronunciation'

const props = defineProps<{
  word: string
  phonetic: string
  meaning: string
  example: string
}>()

const isFlipped = ref(false)
const playingAccent = ref<'' | PronunciationAccent>('')
const audioNotice = ref('')

function flip() {
  isFlipped.value = !isFlipped.value
}

async function speak(accent: PronunciationAccent = 'us') {
  if (playingAccent.value === accent) { stopWordPronunciation(); playingAccent.value = ''; return }
  playingAccent.value = accent
  audioNotice.value = ''
  try { await playWordPronunciation(props.word, accent) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2400) }
  finally { if (playingAccent.value === accent) playingAccent.value = '' }
}

defineExpose({ flip, speak })
</script>

<template>
  <div class="word-card" :class="{ flipped: isFlipped }" @click="flip">
    <div class="card-inner">
      <div class="card-front">
        <div class="word-display">{{ word }}</div>
        <div class="phonetic-display">{{ phonetic }}</div>
        <div class="word-audio-actions"><button class="speak-btn" :class="{ playing: playingAccent === 'us' }" @click.stop="speak('us')" title="美式发音">🔊 美</button><button class="speak-btn" :class="{ playing: playingAccent === 'uk' }" @click.stop="speak('uk')" title="英式发音">🔊 英</button></div><div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
        <div class="flip-hint">点击翻转 · 空格键</div>
      </div>
      <div class="card-back">
        <div class="word-display small">{{ word }}</div>
        <div class="meaning-display">{{ meaning }}</div>
        <div v-if="example" class="example-display">{{ example }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.word-card {
  perspective: 1000px;
  width: 100%;
  max-width: 480px;
  height: 270px;
  cursor: pointer;
  margin: 0 auto;
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.word-card.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-front,
.card-back {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  padding: 32px;
  box-shadow: var(--shadow-lg);
}

.card-front::before,
.card-back::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--gradient-card);
  pointer-events: none;
}

.card-back {
  transform: rotateY(180deg);
}

.word-display {
  font-size: 46px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}

.word-display.small {
  font-size: 24px;
  margin-bottom: 18px;
  color: var(--text-secondary);
  font-weight: 400;
}

.phonetic-display {
  font-size: 15px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  position: relative;
  z-index: 1;
}

.meaning-display {
  font-size: 22px;
  color: var(--accent);
  text-align: center;
  margin-bottom: 16px;
  font-weight: 500;
  position: relative;
  z-index: 1;
}

.example-display {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
  font-style: italic;
  max-width: 360px;
  line-height: 1.6;
  position: relative;
  z-index: 1;
}

.flip-hint {
  position: absolute;
  bottom: 14px;
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  opacity: 0.6;
}

.speak-btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: rgba(217, 119, 6, 0.08);
  color: var(--accent);
  margin-bottom: 6px;
  position: relative;
  z-index: 1;
  letter-spacing: 0.5px;
}

.word-audio-actions { display:flex; gap:6px; position:relative; z-index:2; }
.speak-btn.playing { animation: word-audio-pulse .7s ease-in-out infinite alternate; background: rgba(217,119,6,.18); }
.audio-notice { position:relative; z-index:2; margin:4px 0; color:#9a3412; font-size:10px; }
@keyframes word-audio-pulse { to { transform: scale(1.07); opacity:.72; } }
.speak-btn:hover {
  background: rgba(217, 119, 6, 0.15);
}
</style>
