<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'

const userInput = ref('')
const result = ref<'correct' | 'wrong' | null>(null)
const currentWord = ref<any>(null)
const isLoading = ref(false)
const playCount = ref(0)
const speed = ref(0.8)
const score = ref({ correct: 0, total: 0 })
const showHint = ref(false)
const showMeaningHint = ref(false)
const accent = ref<PronunciationAccent>('us')
const playingAccent = ref<'' | PronunciationAccent>('')
const audioNotice = ref('')

async function loadWord() {
  isLoading.value = true; result.value = null; userInput.value = ''
  playCount.value = 0; showHint.value = false; showMeaningHint.value = false
  const words = await window.cet4Api.getNewWords(1)
  currentWord.value = words[0] ?? null; isLoading.value = false
  if (currentWord.value) setTimeout(() => speak(currentWord.value.word, accent.value), 300)
}

async function speak(text: string, selectedAccent: PronunciationAccent = accent.value) {
  accent.value = selectedAccent
  if (playingAccent.value === selectedAccent) { stopWordPronunciation(); playingAccent.value = ''; return }
  playingAccent.value = selectedAccent; audioNotice.value = ''
  try { await playWordPronunciation(text, selectedAccent, speed.value) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2200) }
  finally { if (playingAccent.value === selectedAccent) playingAccent.value = '' }
  playCount.value++
}

onUnmounted(stopWordPronunciation)
function replay() { if (currentWord.value) void speak(currentWord.value.word, accent.value) }

function checkAnswer() {
  if (!currentWord.value) return
  const answer = userInput.value.trim().toLowerCase()
  const correct = answer === currentWord.value.word.toLowerCase()
  result.value = correct ? 'correct' : 'wrong'
  if (correct) score.value.correct++
  else setTimeout(() => speak(currentWord.value.word, accent.value), 500)
  score.value.total++
}

function skipWord() {
  if (!currentWord.value) return
  result.value = 'wrong'; score.value.total++; void speak(currentWord.value.word, accent.value)
}

const wordHint = computed(() => {
  if (!currentWord.value) return ''
  const w = currentWord.value.word
  if (w.length <= 2) return w
  return w[0] + '_ '.repeat(w.length - 2).trim() + w[w.length - 1]
})
</script>

<template>
  <div class="listen-view">
    <div class="page-header">
      <h1 class="heading-display">听力训练</h1>
      <p class="subtitle">听发音 · 拼写单词 · 强化听觉记忆</p>
    </div>

    <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
    <div class="toolbar">
      <div class="speed-bar">
        <span class="speed-label">语速</span>
        <button :class="{ active: speed === 0.5 }" @click="speed = 0.5">0.5×</button>
        <button :class="{ active: speed === 0.75 }" @click="speed = 0.75">0.75×</button>
        <button :class="{ active: speed === 0.8 }" @click="speed = 0.8">正常</button>
        <button :class="{ active: speed === 1.0 }" @click="speed = 1.0">1.0×</button>
      </div>
      <div class="score" v-if="score.total > 0">
        <span class="score-val">{{ score.correct }}</span>/{{ score.total }}
      </div>
    </div>

    <div class="card" v-if="!currentWord && !isLoading">
      <p class="card-title">听力拼写训练</p>
      <p class="card-desc">听单词发音，拼写出你听到的单词。可选语速、首尾字母提示和释义提示。</p>
      <button class="btn primary" @click="loadWord">开始训练</button>
    </div>

    <div class="card" v-else-if="isLoading"><p class="loading-text">加载中…</p></div>

    <div class="card" v-else>
      <div class="speaker">
        <button class="speak-btn" :class="{ playing: playingAccent === 'us' }" @click="speak(currentWord.word, 'us')"><span class="speak-icon">🔊</span>美式发音</button>
        <button class="speak-btn" :class="{ playing: playingAccent === 'uk' }" @click="speak(currentWord.word, 'uk')"><span class="speak-icon">🔊</span>英式发音</button>
        <span class="play-count" v-if="playCount > 0">× {{ playCount }}</span>
      </div>

      <div class="hints" v-if="!result">
        <button class="hint-btn" :class="{ active: showHint }" @click="showHint = !showHint">
          {{ showHint ? wordHint : '首尾字母' }}
        </button>
        <button class="hint-btn" :class="{ active: showMeaningHint }" @click="showMeaningHint = !showMeaningHint">
          {{ showMeaningHint ? currentWord.meaning_cn : '释义提示' }}
        </button>
      </div>

      <input
        v-model="userInput"
        type="text"
        placeholder="输入你听到的单词…"
        @keyup.enter="checkAnswer"
        :disabled="result !== null"
        class="word-input"
        autofocus
      />

      <div class="result" v-if="result !== null">
        <div class="res correct" v-if="result === 'correct'">
          <span class="res-icon">✓</span> 正确
        </div>
        <div class="res wrong" v-else>
          <span class="res-icon">✕</span>
          <div class="res-detail">
            <div class="res-word">{{ currentWord.word }}</div>
            <div class="res-phonetic" v-if="currentWord.phonetic_us">{{ currentWord.phonetic_us }}</div>
            <div class="res-meaning">{{ currentWord.meaning_cn }}</div>
          </div>
        </div>
      </div>

      <div class="controls" v-if="result === null">
        <button class="btn primary" @click="checkAnswer" :disabled="!userInput.trim()">确认</button>
        <button class="btn ghost" @click="skipWord">跳过</button>
      </div>
      <div class="controls" v-else>
        <button class="btn primary" @click="loadWord">下一题</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.listen-view { max-width: 580px; margin: 0 auto; }

.page-header { margin-bottom: 16px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }

.speed-bar { display: flex; align-items: center; gap: 4px; }
.speed-label { font-size: 11px; color: var(--text-muted); margin-right: 4px; letter-spacing: 0.5px; }
.speed-bar button {
  padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--glass-border);
}
.speed-bar button.active { background: var(--accent); color: var(--bg-primary); border-color: var(--accent); }

.score { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
.score-val { color: var(--accent); font-weight: 700; }

.card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 32px; text-align: center;
  border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.card-title { font-size: 16px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500; }
.card-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.6; }
.loading-text { color: var(--text-muted); }

.speaker { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 20px; }

.speak-btn {
  padding: 14px 32px; border-radius: var(--radius-lg); font-size: 16px; font-weight: 600;
  background: var(--accent); color: var(--bg-primary); letter-spacing: 0.3px;
  display: flex; align-items: center; gap: 8px;
}
.speak-btn.playing { animation:listen-audio-pulse .7s infinite alternate; }.audio-notice { margin-bottom:10px; color:#9a3412; font-size:11px; }@keyframes listen-audio-pulse{to{transform:scale(1.04);opacity:.75}}
.speak-btn:hover { background: var(--accent-light); box-shadow: 0 4px 20px var(--accent-glow); }
.speak-icon { font-size: 14px; }

.play-count { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

.hints { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 18px; }
.hint-btn {
  font-size: 11px; padding: 5px 12px; border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03); color: var(--text-muted);
  border: 1px solid var(--glass-border); transition: all var(--transition-fast);
}
.hint-btn:hover { background: rgba(255,255,255,0.05); }
.hint-btn.active {
  background: rgba(217, 119, 6, 0.06); color: var(--accent);
  border-color: rgba(217, 119, 6, 0.15);
}

.word-input {
  width: 100%; max-width: 360px; padding: 14px 18px; border-radius: var(--radius-md);
  border: 1px solid var(--glass-border); background: var(--bg-primary);
  color: var(--text-primary); font-size: 20px; text-align: center;
  letter-spacing: 3px; outline: none; font-family: var(--font-mono);
  transition: border-color var(--transition-fast);
  margin-bottom: 18px;
}
.word-input:focus { border-color: var(--accent); }
.word-input::placeholder { color: var(--text-muted); letter-spacing: 0; font-size: 14px; }

.result { margin-bottom: 18px; }
.res { font-size: 16px; padding: 14px; border-radius: var(--radius-md); font-weight: 600; display: flex; align-items: center; gap: 10px; }
.res.correct { color: var(--success); background: rgba(107, 203, 119, 0.06); justify-content: center; }
.res.wrong { color: var(--warning); background: rgba(240, 168, 96, 0.06); }
.res-icon { font-size: 18px; flex-shrink: 0; }
.res-detail { text-align: left; }
.res-word { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
.res-phonetic { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 2px; }
.res-meaning { font-size: 13px; color: var(--text-secondary); font-weight: 400; }

.controls { display: flex; gap: 10px; justify-content: center; }

.btn.primary { padding: 10px 32px; border-radius: var(--radius-md); font-size: 14px; font-weight: 600; background: var(--accent); color: var(--bg-primary); }
.btn.primary:hover { background: var(--accent-light); box-shadow: 0 4px 16px var(--accent-glow); }
.btn.primary:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }

.btn.ghost { padding: 10px 20px; border-radius: var(--radius-md); font-size: 13px; background: transparent; color: var(--text-muted); border: 1px solid var(--glass-border); }
.btn.ghost:hover { background: var(--bg-primary); }
</style>
