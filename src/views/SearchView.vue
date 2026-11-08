<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'

const query = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const selectedWord = ref<any>(null)
const vocabAdded = ref<Record<number, boolean>>({})
const history = ref<any[]>([])
const playingAudioKey = ref('')
const audioNotice = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchRequestId = 0

watch(query, (val) => {
  const requestId = ++searchRequestId
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!val.trim()) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    try {
      const found = await window.cet4Api.searchWords(val.trim())
      if (requestId === searchRequestId) results.value = found
    } catch {
      if (requestId === searchRequestId) results.value = []
    } finally {
      if (requestId === searchRequestId) loading.value = false
    }
  }, 250)
})

onUnmounted(() => {
  searchRequestId += 1
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
})

async function loadHistory() {
  history.value = await window.cet4Api.getLookupHistory(30)
}

async function selectWord(word: any) {
  const opening = selectedWord.value?.id !== word.id
  selectedWord.value = opening ? word : null
  if (opening) {
    await window.cet4Api.recordLookup({
      word: word.word,
      meaningCn: word.meaning_cn,
      phoneticUs: word.phonetic_us,
      source: 'search',
      context: word.example_sentence
    })
    await loadHistory()
  }
}

function searchFromHistory(item: any) {
  query.value = item.word
}

async function deleteHistory(id: number) {
  await window.cet4Api.deleteLookupHistory(id)
  await loadHistory()
}

async function clearHistory() {
  await window.cet4Api.clearLookupHistory()
  history.value = []
}

onMounted(loadHistory)

async function speak(text: string, accent: PronunciationAccent = 'us', key = text): Promise<void> {
  const audioKey = key + ':' + accent
  if (playingAudioKey.value === audioKey) {
    stopWordPronunciation()
    playingAudioKey.value = ''
    return
  }
  playingAudioKey.value = audioKey
  audioNotice.value = ''
  try {
    await playWordPronunciation(text, accent)
  } catch (error) {
    audioNotice.value = (error as Error).message || '发音播放失败，请稍后重试'
    window.setTimeout(() => { if (audioNotice.value) audioNotice.value = '' }, 2600)
  } finally {
    if (playingAudioKey.value === audioKey) playingAudioKey.value = ''
  }
}

async function addToVocab(w: any) {
  await window.cet4Api.addVocabWord({
    wordId: w.id,
    wordText: w.word,
    meaningCn: w.meaning_cn,
    phoneticUs: w.phonetic_us,
    source: 'search'
  })
  vocabAdded.value[w.id] = true
}
</script>

<template>
  <div class="search-view">
    <div class="page-header">
      <h1 class="heading-display">查词</h1>
      <p class="subtitle">搜索单词、释义或音标</p>
    </div>

    <div class="search-box">
      <input
        v-model="query"
        type="text"
        placeholder="输入英文单词或中文释义…"
        class="search-input"
        autofocus
      />
      <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
      <div class="search-count" v-if="query.trim()">
        {{ loading ? '搜索中…' : `${results.length} 个结果` }}
      </div>
    </div>

    <div class="results-list" v-if="results.length > 0">
      <div
        v-for="w in results"
        :key="w.id"
        class="word-card"
        :class="{ expanded: selectedWord?.id === w.id }"
        @click="selectWord(w)"
      >
        <div class="word-main">
          <div class="word-left">
            <span class="word-text">{{ w.word }}</span>
            <span class="word-phonetic" v-if="w.phonetic_us">{{ w.phonetic_us }}</span>
          </div>
          <div class="word-right">
            <span class="word-pos" v-if="w.pos">{{ w.pos }}</span>
            <span class="word-meaning">{{ w.meaning_cn }}</span>
          </div>
        </div>

        <div class="word-detail" v-if="selectedWord?.id === w.id">
          <div class="detail-row" v-if="w.example_sentence">
            <span class="detail-label">例句</span>
            <span class="detail-value example">{{ w.example_sentence }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">词频</span>
            <span class="detail-value">{{ w.frequency ?? '—' }} / 5</span>
          </div>
          <div class="detail-row" v-if="w.tags">
            <span class="detail-label">标签</span>
            <span class="detail-value tags">{{ w.tags }}</span>
          </div>
          <div class="detail-row" v-if="w.familiarity !== undefined && w.familiarity !== null">
            <span class="detail-label">熟悉度</span>
            <span class="detail-value">{{ w.familiarity }} / 5</span>
          </div>
          <div class="pronunciation-actions"><button class="speak-btn" :class="{ playing: playingAudioKey === (w.id + ':us') }" @click.stop="speak(w.word, 'us', String(w.id))">🔊 美</button><button class="speak-btn" :class="{ playing: playingAudioKey === (w.id + ':uk') }" @click.stop="speak(w.word, 'uk', String(w.id))">🔊 英</button></div>
          <button class="vocab-btn" :class="{ added: vocabAdded[w.id] }" @click.stop="addToVocab(w)">
            {{ vocabAdded[w.id] ? '已收藏' : '+ 收藏词汇' }}
          </button>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else-if="query.trim() && !loading">
      <div class="empty-icon">∅</div>
      <div class="empty-text">未找到匹配的单词</div>
    </div>


    <section class="history-section" v-else-if="!query.trim()">
      <div class="history-header">
        <div>
          <div class="history-title">查询历史</div>
          <div class="history-subtitle">最近查过的单词会自动保存在这里</div>
        </div>
        <button v-if="history.length" class="history-clear" @click="clearHistory">清空记录</button>
      </div>

      <div v-if="history.length" class="history-list">
        <div v-for="item in history" :key="item.id" class="history-item" @click="searchFromHistory(item)">
          <div class="history-main">
            <div class="history-word-row">
              <strong>{{ item.word }}</strong>
              <span v-if="item.phonetic_us" class="history-phonetic">{{ item.phonetic_us }}</span>
              <span v-if="item.lookup_count > 1" class="history-count">×{{ item.lookup_count }}</span>
            </div>
            <div class="history-meaning">{{ item.meaning_cn || '暂无本地释义' }}</div>
          </div>
          <span class="history-source">{{ item.source || '查词' }}</span>
          <button class="history-icon-btn" :class="{ playing: playingAudioKey === (item.id + ':us') }" title="美式发音" @click.stop="speak(item.word, 'us', 'history-us-' + item.id)">🔊美</button><button class="history-icon-btn" :class="{ playing: playingAudioKey === (item.id + ':uk') }" title="英式发音" @click.stop="speak(item.word, 'uk', 'history-uk-' + item.id)">🔊英</button>
          <button class="history-delete" title="删除这条记录" @click.stop="deleteHistory(item.id)">×</button>
        </div>
      </div>

      <div v-else class="hint-state compact-hint">
        <div class="hint-icon">⌕</div>
        <div class="hint-text">输入关键词开始搜索，查过的词会记录在这里</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.search-view { max-width: 700px; margin: 0 auto; }

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.search-box { margin-bottom: 24px; position: relative; }

.search-input {
  width: 100%; padding: 14px 18px; padding-right: 80px; border-radius: var(--radius-md);
  border: 1px solid var(--glass-border); background: var(--bg-card);
  color: var(--text-primary); font-size: 15px; outline: none;
  transition: border-color var(--transition-fast);
}
.search-input:focus { border-color: var(--accent); }
.search-input::placeholder { color: var(--text-muted); }

.search-count {
  position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--text-muted); letter-spacing: 0.5px;
  pointer-events: none;
}

.results-list { display: flex; flex-direction: column; gap: 4px; }

.word-card {
  background: var(--bg-card); border-radius: var(--radius-md);
  padding: 14px 18px; border: 1px solid var(--glass-border);
  cursor: pointer; transition: all var(--transition-fast);
}
.word-card:hover { background: var(--bg-card-hover); }
.word-card.expanded {
  border-color: rgba(217, 119, 6, 0.2);
  background: rgba(217, 119, 6, 0.02);
}

.word-main { display: flex; justify-content: space-between; align-items: center; gap: 16px; }

.word-left { display: flex; align-items: baseline; gap: 10px; }
.word-text { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.word-phonetic { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

.word-right { display: flex; align-items: center; gap: 10px; text-align: right; }
.word-pos {
  font-size: 10px; color: var(--accent); text-transform: uppercase;
  letter-spacing: 1px; font-weight: 600; padding: 2px 6px;
  border: 1px solid rgba(217, 119, 6, 0.15); border-radius: 3px;
}
.word-meaning { font-size: 13px; color: var(--text-secondary); }

.word-detail {
  margin-top: 14px; padding-top: 14px;
  border-top: 1px solid var(--glass-border);
  display: flex; flex-direction: column; gap: 8px;
}

.detail-row { display: flex; gap: 12px; align-items: baseline; }
.detail-label {
  font-size: 10px; color: var(--text-muted); text-transform: uppercase;
  letter-spacing: 1px; font-weight: 600; width: 48px; flex-shrink: 0;
}
.detail-value { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.detail-value.example { font-style: italic; color: var(--text-muted); }
.detail-value.tags { font-family: var(--font-mono); font-size: 11px; }

.speak-btn {
  margin-top: 6px; align-self: flex-start;
  padding: 5px 14px; border-radius: var(--radius-sm); font-size: 11px;
  font-weight: 600; background: rgba(217, 119, 6, 0.06); color: var(--accent);
  border: 1px solid rgba(217, 119, 6, 0.12);
  letter-spacing: 1px; text-transform: uppercase;
}
.speak-btn:hover { background: rgba(217, 119, 6, 0.12); }.speak-btn.playing,.history-icon-btn.playing { animation: audio-pulse .75s ease-in-out infinite alternate; background: rgba(217,119,6,.16); }.pronunciation-actions { display:flex; gap:6px; margin-top:6px; }.audio-notice { position:absolute; right:16px; top:52px; z-index:5; padding:6px 9px; border-radius:7px; color:#9a3412; background:#fff7ed; border:1px solid rgba(245,158,11,.25); font-size:10px; }@keyframes audio-pulse { to { transform: scale(1.06); opacity:.72; } }

.vocab-btn {
  margin-top: 6px; align-self: flex-start;
  padding: 5px 14px; border-radius: var(--radius-sm); font-size: 11px;
  font-weight: 600; background: rgba(107, 203, 119, 0.06); color: var(--success);
  border: 1px solid rgba(107, 203, 119, 0.12);
  letter-spacing: 0.5px;
}
.vocab-btn:hover { background: rgba(107, 203, 119, 0.12); }
.vocab-btn.added { opacity: 0.5; cursor: default; }

.history-section {
  margin-top: 4px;
  padding: 16px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}
.history-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  margin-bottom: 10px;
}
.history-title { color: var(--text-primary); font-size: 13px; font-weight: 700; letter-spacing: 0.5px; }
.history-subtitle { margin-top: 2px; color: var(--text-muted); font-size: 10px; }
.history-clear {
  padding: 4px 9px; border-radius: 6px; color: var(--danger);
  background: rgba(220, 38, 38, 0.05); font-size: 10px;
}
.history-clear:hover { background: rgba(220, 38, 38, 0.1); }
.history-list { display: grid; gap: 3px; }
.history-item {
  display: grid; grid-template-columns: minmax(0, 1fr) auto 32px 32px 25px;
  align-items: center; gap: 7px; padding: 8px 7px; border-radius: 8px;
  cursor: pointer; transition: background var(--transition-fast);
}
.history-item:hover { background: var(--bg-secondary); }
.history-word-row { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.history-word-row strong { color: var(--text-primary); font-family: var(--font-display); font-size: 14px; }
.history-phonetic { color: var(--text-muted); font-family: var(--font-mono); font-size: 10px; }
.history-count { padding: 1px 4px; border-radius: 4px; color: var(--accent-dim); background: rgba(217, 119, 6, 0.08); font-size: 8px; }
.history-meaning {
  margin-top: 2px; overflow: hidden; color: var(--text-secondary); font-size: 11px;
  text-overflow: ellipsis; white-space: nowrap;
}
.history-source { color: var(--text-muted); font-size: 8px; white-space: nowrap; }
.history-icon-btn, .history-delete {
  width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); background: transparent; font-size: 10px;
}
.history-icon-btn:hover { color: var(--accent); background: rgba(217, 119, 6, 0.08); }
.history-delete { font-size: 16px; }
.history-delete:hover { color: var(--danger); background: rgba(220, 38, 38, 0.07); }
.compact-hint { padding: 28px 12px 12px; }

.empty-state, .hint-state {
  text-align: center; padding: 60px 20px; color: var(--text-muted);
}
.empty-icon, .hint-icon { font-size: 32px; margin-bottom: 12px; opacity: 0.4; }
.empty-text, .hint-text { font-size: 13px; }
</style>
