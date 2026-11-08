<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWordStore } from '../stores/word.store'
import { useStudyStore } from '../stores/study.store'
import WordCard from '../components/word/WordCard.vue'

const router = useRouter()
const wordStore = useWordStore()
const studyStore = useStudyStore()
const isComplete = ref(false)
const wordsStudied = ref(0)
const wordCardRef = ref<InstanceType<typeof WordCard> | null>(null)

onMounted(async () => {
  await studyStore.loadDashboard()
  await studyStore.startSession('new_words')
  const target = studyStore.todayPlan?.new_words_target ?? 20
  await wordStore.loadNewWords(target)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => { window.removeEventListener('keydown', onKeydown) })

function onKeydown(e: KeyboardEvent) {
  if (isComplete.value || wordStore.isLoading) return
  if (e.key === ' ') { e.preventDefault(); wordCardRef.value?.flip() }
  else if (e.key >= '0' && e.key <= '4') { e.preventDefault(); rateWord(Number(e.key)) }
}

async function rateWord(familiarity: number) {
  const word = wordStore.currentWord
  if (!word) return
  await studyStore.rateWord(word.id, familiarity)
  wordsStudied.value++
  await studyStore.updateSessionProgress(wordsStudied.value)
  if (wordStore.currentIndex >= wordStore.sessionWords.length - 1) { isComplete.value = true }
  else { wordStore.nextWord() }
}

function backToDashboard() { router.push('/') }
</script>

<template>
  <div class="study-view">
    <div v-if="wordStore.isLoading" class="loading">加载中…</div>

    <template v-else-if="isComplete">
      <div class="complete-card">
        <div class="complete-icon">✓</div>
        <div class="complete-title heading-display">学习完成</div>
        <div class="complete-desc">今天完成了 {{ wordsStudied }} 个新单词的学习</div>
        <button class="btn primary" @click="backToDashboard">返回首页</button>
      </div>
    </template>

    <template v-else-if="wordStore.currentWord">
      <div class="study-header">
        <span class="progress-label">新词学习</span>
        <span class="progress-count">{{ wordStore.progress.current }}/{{ wordStore.progress.total }}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: (wordStore.progress.current / wordStore.progress.total) * 100 + '%' }" />
      </div>

      <WordCard
        ref="wordCardRef"
        :word="wordStore.currentWord.word"
        :phonetic="wordStore.currentWord.phonetic_us ?? ''"
        :meaning="wordStore.currentWord.meaning_cn"
        :example="wordStore.currentWord.example_sentence ?? ''"
      />

      <div class="rating-area">
        <div class="rating-label">你对这个单词的熟悉程度？</div>
        <div class="rating-hint">空格翻牌 · 0-4 评分</div>
        <div class="rating-btns">
          <button class="rate-btn r0" @click="rateWord(0)"><span class="key">0</span>不认识</button>
          <button class="rate-btn r1" @click="rateWord(1)"><span class="key">1</span>模糊</button>
          <button class="rate-btn r2" @click="rateWord(2)"><span class="key">2</span>勉强</button>
          <button class="rate-btn r3" @click="rateWord(3)"><span class="key">3</span>一般</button>
          <button class="rate-btn r4" @click="rateWord(4)"><span class="key">4</span>熟悉</button>
        </div>
      </div>
    </template>

    <div v-else class="empty">
      <div class="empty-icon">◎</div>
      <div class="empty-text">暂无新词需要学习</div>
      <button class="btn primary" @click="backToDashboard">返回首页</button>
    </div>
  </div>
</template>

<style scoped>
.study-view {
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.study-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-weight: 600;
}

.progress-count {
  font-size: 12px;
  color: var(--accent);
  font-family: var(--font-mono);
}

.progress-track {
  height: 3px;
  background: rgba(44, 36, 32, 0.05);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.rating-area {
  text-align: center;
}

.rating-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.rating-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0 14px;
  opacity: 0.6;
}

.rating-btns {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.rate-btn {
  padding: 10px 24px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  gap: 6px;
}

.rate-btn:hover {
  background: var(--bg-card-hover);
  transform: translateY(-1px);
}

.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  background: rgba(44, 36, 32, 0.05);
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.rate-btn.r0:hover { border-color: var(--danger); color: var(--danger); }
.rate-btn.r1:hover { border-color: var(--warning); color: var(--warning); }
.rate-btn.r2:hover { border-color: var(--warning); color: var(--warning); }
.rate-btn.r3:hover { border-color: var(--success); color: var(--success); }
.rate-btn.r4:hover { border-color: var(--accent); color: var(--accent); }

.complete-card, .empty {
  text-align: center;
  padding: 80px 20px;
}

.complete-icon {
  font-size: 48px;
  color: var(--accent);
  margin-bottom: 16px;
  font-weight: 300;
}

.empty-icon {
  font-size: 48px;
  color: var(--text-muted);
  margin-bottom: 16px;
  opacity: 0.4;
}

.complete-title {
  font-size: 28px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.complete-desc, .empty-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.btn.primary {
  padding: 12px 32px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: var(--bg-primary);
  font-size: 14px;
  font-weight: 600;
}

.btn.primary:hover {
  background: var(--accent-light);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.loading {
  text-align: center;
  color: var(--text-muted);
  padding: 80px;
  font-size: 14px;
}
</style>
