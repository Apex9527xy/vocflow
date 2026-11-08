<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'
import { useRouter } from 'vue-router'

const router = useRouter()
const wrongWords = ref<any[]>([])
const savedWords = ref<any[]>([])
const isLoading = ref(true)
const selectedWord = ref<any>(null)
const showMeaning = ref(false)
const activeTab = ref<'wrong' | 'saved'>('wrong')
const playingAccent = ref<'' | PronunciationAccent>('')
const audioNotice = ref('')
const displayWords = computed(() => activeTab.value === 'wrong' ? wrongWords.value : savedWords.value)

onMounted(async () => {
  try {
    const [wrong, saved] = await Promise.all([window.cet4Api.getWeakWords(200), window.cet4Api.getVocabWords()])
    wrongWords.value = Array.isArray(wrong) ? wrong : []
    savedWords.value = Array.isArray(saved) ? saved : []
  } finally { isLoading.value = false }
})
function startReinforce() { router.push('/review') }
function switchTab(tab: 'wrong' | 'saved') { activeTab.value = tab; selectedWord.value = null; showMeaning.value = false }
function selectWord(word: any) { selectedWord.value = word; showMeaning.value = false }
function wordText(word: any): string { return word?.word_text || word?.word || '' }
function wordMeaning(word: any): string { return word?.meaning_cn || '' }
function wordPhonetic(word: any): string { return word?.phonetic_us || '' }
async function deleteSavedWord(id: number) { await window.cet4Api.deleteVocabWord(id); savedWords.value = savedWords.value.filter(item => item.id !== id); if (selectedWord.value?.id === id) selectedWord.value = null }
async function speak(text: string, accent: PronunciationAccent) {
  if (playingAccent.value === accent) { stopWordPronunciation(); playingAccent.value = ''; return }
  playingAccent.value = accent; audioNotice.value = ''
  try { await playWordPronunciation(text, accent) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2200) }
  finally { if (playingAccent.value === accent) playingAccent.value = '' }
}
onUnmounted(stopWordPronunciation)
</script>

<template>
  <div class="wrong-view">
    <div class="page-header">
      <div><h1 class="heading-display">错词与收藏</h1><p class="subtitle">集中攻克顽固词汇，同时管理查词收藏</p></div>
      <button v-if="activeTab === 'wrong' && wrongWords.length > 0" class="btn danger" @click="startReinforce">专项强化</button>
    </div>
    <div class="word-tabs"><button type="button" :class="{ active: activeTab === 'wrong' }" @click="switchTab('wrong')">错词 {{ wrongWords.length }}</button><button type="button" :class="{ active: activeTab === 'saved' }" @click="switchTab('saved')">收藏词汇 {{ savedWords.length }}</button></div>
    <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
    <div v-if="isLoading" class="loading">加载中…</div>
    <div v-else-if="displayWords.length === 0" class="empty"><div class="empty-icon">{{ activeTab === 'wrong' ? '✓' : '☆' }}</div><div class="empty-title">{{ activeTab === 'wrong' ? '没有错词' : '还没有收藏词汇' }}</div><div class="empty-desc">{{ activeTab === 'wrong' ? '你还没有答错过任何单词' : '在任意位置双击查词并点击“收藏词汇”后，会显示在这里' }}</div></div>
    <div v-else class="split">
      <div class="word-list">
        <div class="list-head">共 {{ displayWords.length }} 个{{ activeTab === 'wrong' ? '错词' : '收藏词' }}</div>
        <div v-for="word in displayWords" :key="word.id" class="word-item" :class="{ active: selectedWord?.id === word.id, stubborn: activeTab === 'wrong' && word.wrong_count >= 3 }" @click="selectWord(word)">
          <div class="wi-main"><span class="wi-word">{{ wordText(word) }}</span><span v-if="activeTab === 'wrong' && word.wrong_count >= 3" class="stubborn-tag">顽固</span></div>
          <div class="wi-meta"><template v-if="activeTab === 'wrong'"><span class="wi-wrong">错 {{ word.wrong_count }} 次</span><span class="wi-fam">熟悉度 {{ word.familiarity ?? 0 }}/5</span></template><template v-else><span class="wi-fam">{{ word.source || '查词收藏' }}</span><span class="wi-fam">{{ word.created_at?.slice(0,10) }}</span></template></div>
        </div>
      </div>
      <div class="detail" v-if="selectedWord">
        <div class="d-head"><span class="d-word">{{ wordText(selectedWord) }}</span><div class="audio-actions"><button class="speak-btn" :class="{ playing: playingAccent === 'us' }" @click="speak(wordText(selectedWord), 'us')">🔊 美</button><button class="speak-btn" :class="{ playing: playingAccent === 'uk' }" @click="speak(wordText(selectedWord), 'uk')">🔊 英</button></div></div>
        <div class="d-phonetic" v-if="wordPhonetic(selectedWord)">{{ wordPhonetic(selectedWord) }}</div>
        <div class="d-meaning" v-if="activeTab === 'saved' || showMeaning || selectedWord.wrong_count < 2">{{ wordMeaning(selectedWord) }}</div>
        <button v-if="activeTab === 'wrong' && !showMeaning && selectedWord.wrong_count >= 2" class="btn primary sm" @click="showMeaning = true">显示释义</button>
        <div class="d-example" v-if="selectedWord.example_sentence || selectedWord.context"><div class="ex-label">{{ selectedWord.context ? '收藏语境' : '例句' }}</div>{{ selectedWord.context || selectedWord.example_sentence }}</div>
        <div class="d-stats" v-if="activeTab === 'wrong'"><div class="ds"><span class="ds-num wrong">{{ selectedWord.wrong_count }}</span><span class="ds-label">错误</span></div><div class="ds"><span class="ds-num">{{ selectedWord.familiarity ?? 0 }}</span><span class="ds-label">熟悉度</span></div><div class="ds"><span class="ds-num ok">{{ selectedWord.correct_count ?? 0 }}</span><span class="ds-label">正确</span></div></div>
        <button v-else class="btn ghost saved-remove" type="button" @click="deleteSavedWord(selectedWord.id)">移除收藏</button>
      </div>
      <div class="detail empty-detail" v-else><span class="detail-hint">← 点击左侧单词查看详情</span></div>
    </div>
  </div>
</template>

<style scoped>
.wrong-view { max-width: 900px; margin: 0 auto; }.word-tabs { display:flex; gap:5px; margin:-8px 0 16px; padding:4px; width:fit-content; border:1px solid var(--glass-border); border-radius:9px; background:var(--bg-secondary); }.word-tabs button { padding:7px 12px; border-radius:7px; color:var(--text-muted); background:transparent; font-size:11px; font-weight:700; }.word-tabs button.active { color:#fff; background:var(--accent); }.saved-remove { margin-top:12px; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.word-tabs { display:flex; gap:6px; margin: -8px 0 16px; padding:4px; width:fit-content; border-radius:9px; background:var(--bg-secondary); border:1px solid var(--glass-border); }.word-tabs button { padding:7px 12px; border-radius:7px; color:var(--text-muted); background:transparent; font-size:11px; font-weight:700; }.word-tabs button.active { color:#fff; background:var(--accent); }.saved-remove { margin-top:12px; }.page-header h1 { font-size: 26px; font-weight: 400; color: var(--text-primary); margin-bottom: 2px; }
.subtitle { font-size: 13px; color: var(--text-muted); }

.btn.danger {
  padding: 9px 18px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600;
  background: var(--gradient-danger); color: #fff;
}
.btn.danger:hover { box-shadow: 0 4px 12px rgba(232, 107, 107, 0.2); }

.btn.primary.sm { padding: 8px 20px; border-radius: var(--radius-sm); font-size: 13px; background: var(--accent); color: var(--bg-primary); font-weight: 600; margin-bottom: 16px; }

.loading { text-align: center; color: var(--text-muted); padding: 80px; }

.empty { text-align: center; padding: 80px 20px; }
.empty-icon { font-size: 48px; color: var(--accent); margin-bottom: 12px; opacity: 0.5; }
.empty-title { font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: var(--text-muted); }

.split {
  display: grid; grid-template-columns: 300px 1fr; gap: 14px;
  height: calc(100vh - 160px);
}

.word-list {
  background: var(--bg-card); border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border); overflow-y: auto;
}

.list-head {
  padding: 12px 16px; font-size: 11px; color: var(--text-muted);
  border-bottom: 1px solid var(--glass-border); letter-spacing: 0.5px;
  position: sticky; top: 0; background: var(--bg-card); z-index: 1;
}

.word-item {
  padding: 10px 16px; cursor: pointer;
  border-bottom: 1px solid rgba(44, 36, 32, 0.03);
  transition: background var(--transition-fast);
}
.word-item:hover { background: var(--bg-card-hover); }
.word-item.active { background: rgba(217, 119, 6, 0.04); border-left: 2px solid var(--accent); }

.wi-main { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.wi-word { font-size: 14px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); }
.stubborn-tag { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: rgba(232, 107, 107, 0.12); color: var(--danger); font-weight: 600; letter-spacing: 0.5px; }

.wi-meta { display: flex; gap: 12px; font-size: 11px; }
.wi-wrong { color: var(--danger); }
.wi-fam { color: var(--text-muted); }

.detail {
  background: var(--bg-card); border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border); padding: 28px; overflow-y: auto;
}

.empty-detail { display: flex; align-items: center; justify-content: center; }
.detail-hint { font-size: 13px; color: var(--text-muted); }

.d-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.d-word { font-size: 32px; font-weight: 700; color: var(--text-primary); font-family: var(--font-display); }
.audio-actions { display:flex; gap:5px; }.speak-btn.playing { animation:wrong-audio-pulse .7s infinite alternate; background:rgba(217,119,6,.18); }.audio-notice { margin-bottom:12px; color:#9a3412; font-size:11px; }@keyframes wrong-audio-pulse{to{transform:scale(1.06);opacity:.72}}
.speak-btn { font-size: 11px; padding: 4px 10px; border-radius: var(--radius-sm); background: rgba(217, 119, 6, 0.08); color: var(--accent); }
.speak-btn:hover { background: rgba(217, 119, 6, 0.15); }

.d-phonetic { font-size: 14px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 14px; }
.d-meaning { font-size: 20px; color: var(--accent); margin-bottom: 18px; font-weight: 500; }

.d-example {
  background: var(--bg-primary); border-radius: var(--radius-md);
  padding: 16px; font-size: 13px; color: var(--text-secondary);
  line-height: 1.7; margin-bottom: 20px; border: 1px solid var(--glass-border);
}
.ex-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; font-weight: 600; }

.d-stats { display: flex; gap: 28px; }
.ds { text-align: center; }
.ds-num { display: block; font-size: 24px; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); }
.ds-num.wrong { color: var(--danger); }
.ds-num.ok { color: var(--success); }
.ds-label { font-size: 11px; color: var(--text-muted); }
</style>
