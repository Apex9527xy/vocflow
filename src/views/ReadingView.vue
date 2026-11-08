<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'

type Mode = 'words' | 'passage'
const mode = ref<Mode>('words')
const words = ref<any[]>([])
const currentIndex = ref(0)
const isLoading = ref(false)
const showMeaning = ref(false)
const playingAccent = ref<'' | PronunciationAccent>('')
const audioNotice = ref('')
const currentWord = computed(() => words.value[currentIndex.value] ?? null)

// 短文阅读模式
const passages = ref<any[]>([])
const passageIndex = ref(0)
const showPassageAnswer = ref(false)
const selectedAnswer = ref<number | null>(null)
const selectedTopic = ref('all')
const topics = ref<{ topic: string; count: number }[]>([])
const passageLoading = ref(false)

const currentPassage = computed(() => passages.value[passageIndex.value])

onMounted(async () => {
  topics.value = await window.cet4Api.getReadingTopics()
})

async function loadPassages() {
  passageLoading.value = true
  const topic = selectedTopic.value === 'all' ? undefined : selectedTopic.value
  passages.value = await window.cet4Api.getReadingPassages({ topic, limit: 20 })
  passageIndex.value = 0
  showPassageAnswer.value = false
  selectedAnswer.value = null
  passageLoading.value = false
}

async function loadWords() {
  isLoading.value = true; showMeaning.value = false
  words.value = await window.cet4Api.getNewWords(10)
  currentIndex.value = 0; isLoading.value = false
}

function nextWord() { showMeaning.value = false; if (currentIndex.value < words.value.length - 1) currentIndex.value++ }
function prevWord() { showMeaning.value = false; if (currentIndex.value > 0) currentIndex.value-- }

async function speakWord(accent: PronunciationAccent) {
  if (!currentWord.value) return
  if (playingAccent.value === accent) { stopWordPronunciation(); playingAccent.value = ''; return }
  playingAccent.value = accent; audioNotice.value = ''
  try { await playWordPronunciation(currentWord.value.word, accent) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2200) }
  finally { if (playingAccent.value === accent) playingAccent.value = '' }
}

onUnmounted(stopWordPronunciation)
function selectPassageOption(idx: number) {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) return
  if (showPassageAnswer.value) return
  selectedAnswer.value = idx
  showPassageAnswer.value = true
}

function nextPassage() {
  showPassageAnswer.value = false
  selectedAnswer.value = null
  if (passageIndex.value < passages.value.length - 1) passageIndex.value++
  else passageIndex.value = 0
}

function switchMode(m: Mode) {
  mode.value = m
  if (m === 'words' && words.value.length === 0) loadWords()
  if (m === 'passage' && passages.value.length === 0) loadPassages()
}

function switchTopic(t: string) {
  selectedTopic.value = t
  loadPassages()
}

// JSON 导入
const importStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const importMsg = ref('')

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importStatus.value = 'loading'
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const arr = Array.isArray(data) ? data : data.passages ?? []
    const result = await window.cet4Api.importReadingPassages(arr)
    importStatus.value = result.success ? 'success' : 'error'
    importMsg.value = result.message
    if (result.success) topics.value = await window.cet4Api.getReadingTopics()
  } catch (e: any) {
    importStatus.value = 'error'
    importMsg.value = '解析失败: ' + e.message
  }
  input.value = ''
  setTimeout(() => { importStatus.value = 'idle'; importMsg.value = '' }, 3000)
}
</script>

<template>
  <div class="reading-view">
    <div class="page-header">
      <h1 class="heading-display">阅读训练</h1>
      <p class="subtitle">词汇精读 · 短文理解</p>
    </div>

    <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
    <div class="mode-bar">
      <button :class="{ active: mode === 'words' }" @click="switchMode('words')">词汇精读</button>
      <button :class="{ active: mode === 'passage' }" @click="switchMode('passage')">短文理解</button>
    </div>

    <!-- 词汇精读模式 -->
    <template v-if="mode === 'words'">
      <div class="card" v-if="!words.length && !isLoading">
        <p class="start-title">阅读例句，加深对单词的理解</p>
        <button class="btn primary" @click="loadWords">开始阅读</button>
      </div>

      <div class="card" v-else-if="isLoading"><p class="loading-text">加载中…</p></div>

      <div class="card" v-else-if="currentWord">
        <div class="word-area">
          <div class="word-row">
            <span class="word-text">{{ currentWord.word }}</span>
            <div class="audio-actions"><button class="speak-btn" :class="{ playing: playingAccent === 'us' }" @click="speakWord('us')">🔊 美</button><button class="speak-btn" :class="{ playing: playingAccent === 'uk' }" @click="speakWord('uk')">🔊 英</button></div>
          </div>
          <div class="phonetic" v-if="currentWord.phonetic_us">{{ currentWord.phonetic_us }}</div>
          <span class="pos" v-if="currentWord.pos">{{ currentWord.pos }}</span>
        </div>

        <div class="example" v-if="currentWord.example_sentence">
          <div class="ex-label">例句</div>
          <div class="ex-text">{{ currentWord.example_sentence }}</div>
        </div>

        <div class="meaning-area" v-if="showMeaning">
          <div class="meaning-text">{{ currentWord.meaning_cn }}</div>
        </div>

        <div class="controls">
          <button v-if="!showMeaning" class="btn primary" @click="showMeaning = true">显示释义</button>
          <button class="btn ghost" @click="prevWord" :disabled="currentIndex === 0">← 上一词</button>
          <span class="progress">{{ currentIndex + 1 }}/{{ words.length }}</span>
          <button class="btn ghost" @click="nextWord" :disabled="currentIndex >= words.length - 1">下一词 →</button>
        </div>
      </div>

      <div class="card" v-else>
        <p>已浏览完所有单词</p>
        <button class="btn primary" @click="loadWords" style="margin-top: 12px;">重新开始</button>
      </div>
    </template>

    <!-- 短文理解模式 -->
    <template v-if="mode === 'passage'">
      <div class="topic-bar">
        <button :class="{ active: selectedTopic === 'all' }" @click="switchTopic('all')">全部</button>
        <button v-for="t in topics" :key="t.topic" :class="{ active: selectedTopic === t.topic }" @click="switchTopic(t.topic)">
          {{ t.topic }} ({{ t.count }})
        </button>
      </div>

      <div class="import-row">
        <label class="import-btn">
          + 导入文章
          <input type="file" accept=".json" style="display:none" @change="handleImport" />
        </label>
        <span v-if="importMsg" class="import-msg" :class="importStatus">{{ importMsg }}</span>
      </div>

      <div v-if="passageLoading" class="loading">加载中…</div>

      <template v-else-if="passages.length > 0">
        <div class="passage-meta">
          <span class="passage-num">第 {{ passageIndex + 1 }} / {{ passages.length }} 篇</span>
        </div>

        <div class="card" v-if="currentPassage">
          <div class="passage-title">{{ currentPassage.title }}</div>
          <div class="passage-text">{{ currentPassage.content }}</div>

          <div class="question-area" v-if="currentPassage.question">
            <div class="question-text">{{ currentPassage.question }}</div>
            <div class="options-list">
              <button
                v-for="(opt, i) in JSON.parse(currentPassage.options_json || '[]')"
                :key="i"
                class="option-btn"
                :class="{
                  selected: selectedAnswer === i,
                  correct: showPassageAnswer && i === currentPassage.answer,
                  wrong: showPassageAnswer && selectedAnswer === i && i !== currentPassage.answer
                }"
                @click="selectPassageOption(i)"
              >
                <span class="opt-letter">{{ String.fromCharCode(65 + i) }}</span>
                {{ opt }}
              </button>
            </div>
          </div>

          <div class="controls">
            <button class="btn primary" @click="nextPassage">{{ passageIndex < passages.length - 1 ? '下一篇' : '重新开始' }}</button>
          </div>
        </div>
      </template>

      <div v-else class="card">
        <p class="start-title">暂无文章数据</p>
        <p style="font-size:12px;color:var(--text-muted);text-align:center;">点击上方「导入文章」添加 JSON 格式的阅读材料</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reading-view { max-width: 660px; margin: 0 auto; }

.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.mode-bar { display: flex; gap: 6px; margin-bottom: 18px; }
.mode-bar button {
  padding: 7px 18px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--glass-border);
}
.mode-bar button.active { background: var(--accent); color: var(--bg-primary); border-color: var(--accent); }

.topic-bar { display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; }
.topic-bar button {
  padding: 5px 14px; border-radius: 4px; font-size: 11px; font-weight: 600;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--glass-border);
  letter-spacing: 0.5px;
}
.topic-bar button.active { background: rgba(217, 119, 6, 0.08); color: var(--accent); border-color: rgba(217, 119, 6, 0.2); }

.import-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.import-btn {
  padding: 5px 14px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600;
  color: var(--accent); background: rgba(217, 119, 6, 0.06); border: 1px solid rgba(217, 119, 6, 0.15);
  cursor: pointer; transition: all var(--transition-fast);
}
.import-btn:hover { background: rgba(217, 119, 6, 0.12); }
.import-msg { font-size: 11px; }
.import-msg.success { color: var(--success); }
.import-msg.error { color: var(--danger); }

.passage-meta { text-align: center; margin-bottom: 12px; }
.passage-num { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.5px; }

.card {
  background: var(--bg-card); border-radius: var(--radius-lg);
  padding: 28px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-card);
}

.start-title { font-size: 15px; color: var(--text-secondary); margin-bottom: 20px; text-align: center; }
.loading-text { color: var(--text-muted); text-align: center; }

/* 词汇精读 */
.word-area { text-align: center; margin-bottom: 20px; }
.word-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
.word-text { font-size: 36px; font-weight: 700; color: var(--text-primary); font-family: var(--font-display); }

.audio-actions { display:flex; gap:5px; }.speak-btn.playing { animation:read-audio-pulse .7s infinite alternate; background:rgba(217,119,6,.18); }.audio-notice { margin-bottom:10px; color:#9a3412; font-size:11px; }@keyframes read-audio-pulse{to{transform:scale(1.06);opacity:.72}}
.speak-btn {
  font-size: 11px; padding: 4px 10px; border-radius: var(--radius-sm);
  background: rgba(217, 119, 6, 0.08); color: var(--accent);
}
.speak-btn:hover { background: rgba(217, 119, 6, 0.15); }

.phonetic { font-size: 14px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 6px; }

.pos {
  font-size: 10px; padding: 2px 8px; border-radius: 3px;
  background: rgba(217, 119, 6, 0.06); color: var(--accent);
  text-transform: uppercase; letter-spacing: 1px;
}

.example {
  background: var(--bg-primary); border-radius: var(--radius-md);
  padding: 16px; margin-bottom: 16px; text-align: left;
  border: 1px solid var(--glass-border);
}
.ex-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; font-weight: 600; }
.ex-text { font-size: 15px; color: var(--text-primary); line-height: 1.8; }

.meaning-area { text-align: center; margin-bottom: 16px; }
.meaning-text { font-size: 20px; color: var(--accent); font-weight: 500; }

/* 短文理解 */
.passage-title {
  font-size: 18px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 14px; font-family: var(--font-display);
}

.passage-text {
  font-size: 14px; color: var(--text-secondary); line-height: 1.9;
  margin-bottom: 24px; padding: 16px;
  background: var(--bg-primary); border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
}

.question-area { margin-bottom: 20px; }
.question-text {
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  margin-bottom: 14px; line-height: 1.6;
}

.options-list { display: flex; flex-direction: column; gap: 2px; }

.option-btn {
  display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: center; gap: 9px;
  width: 100%; padding: 5px 6px; border: 0; border-radius: 8px; font-size: 13px;
  text-align: left; background: transparent; color: var(--text-primary);
  transition: background var(--transition-fast), color var(--transition-fast);
  user-select: text;
}
.option-btn:hover { background: rgba(217, 119, 6, 0.045); }
.option-btn.selected { background: rgba(217, 119, 6, 0.07); color: var(--text-primary); }
.option-btn.correct { background: rgba(22, 163, 74, 0.055); color: var(--success); }
.option-btn.wrong { background: rgba(220, 38, 38, 0.045); color: var(--danger); }

.opt-letter {
  width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(44, 36, 32, 0.16); color: var(--text-secondary);
  background: transparent; font-size: 11px; font-weight: 700; font-family: var(--font-mono);
  flex-shrink: 0; user-select: none; transition: all var(--transition-fast);
}
.option-btn:hover .opt-letter { border-color: var(--accent); color: var(--accent); }
.option-btn.selected .opt-letter { border-color: var(--accent); background: var(--accent); color: #fff; }
.option-btn.correct .opt-letter { border-color: var(--success); background: var(--success); color: #fff; }
.option-btn.wrong .opt-letter { border-color: var(--danger); background: var(--danger); color: #fff; }

.controls { display: flex; align-items: center; gap: 10px; justify-content: center; flex-wrap: wrap; }

.btn.primary { padding: 10px 28px; border-radius: var(--radius-md); font-size: 14px; font-weight: 600; background: var(--accent); color: var(--bg-primary); }
.btn.primary:hover { background: var(--accent-light); box-shadow: 0 4px 16px var(--accent-glow); }

.btn.ghost {
  padding: 8px 16px; border-radius: var(--radius-sm); font-size: 12px;
  background: transparent; color: var(--text-muted); border: 1px solid var(--glass-border);
}
.btn.ghost:hover { color: var(--text-secondary); background: var(--bg-primary); }
.btn.ghost:disabled { opacity: 0.3; }

.progress { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
</style>
