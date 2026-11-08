<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { playWordPronunciation, stopWordPronunciation, type PronunciationAccent } from '../composables/useWordPronunciation'
import { useRouter } from 'vue-router'
import { useStudyStore } from '../stores/study.store'
import { useEncouragement } from '../composables/useEncouragement'
import { useAchievements } from '../composables/useAchievements'
import StreakIndicator from '../components/study/StreakIndicator.vue'
import DailyTaskCard from '../components/study/DailyTaskCard.vue'

const router = useRouter()
const studyStore = useStudyStore()
const { encouragementText, absenceAlert } = useEncouragement()
const { unlockedAchievements, totalUnlocked, totalCount, newUnlock, checkAndUnlock, clearNewUnlock } = useAchievements()

const yesterdayWords = ref<any[]>([])
const showYesterday = ref(false)
const playingAudioKey = ref('')
const audioNotice = ref('')

const hour = new Date().getHours()
const isEvening = hour >= 20

onMounted(async () => {
  await studyStore.loadDashboard()
  const unlocked = checkAndUnlock(studyStore.dashboardStats, studyStore.todayPlan)
  if (unlocked) {
    setTimeout(() => clearNewUnlock(), 4000)
  }
  // 加载昨日学过的词用于复习
  const yw = await window.cet4Api.getYesterdayWords(10)
  yesterdayWords.value = yw
})

function startStudy() { router.push('/study') }
function startReview() { router.push('/review') }
function startListening() { router.push('/listening') }
function startReading() { router.push('/reading') }
async function completeToday() { await studyStore.completeTodayPlan() }

async function speak(text: string, accent: PronunciationAccent, key: string) {
  const audioKey = key + ':' + accent
  if (playingAudioKey.value === audioKey) { stopWordPronunciation(); playingAudioKey.value = ''; return }
  playingAudioKey.value = audioKey; audioNotice.value = ''
  try { await playWordPronunciation(text, accent) }
  catch (error) { audioNotice.value = (error as Error).message || '发音播放失败'; window.setTimeout(() => { audioNotice.value = '' }, 2200) }
  finally { if (playingAudioKey.value === audioKey) playingAudioKey.value = '' }
}

onUnmounted(stopWordPronunciation)
function getTodayDate(): string {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }
  return now.toLocaleDateString('zh-CN', options)
}
</script>

<template>
  <div class="dashboard">
    <header class="dash-header">
      <div>
        <div class="dash-date">{{ getTodayDate() }}</div>
        <h1 class="dash-title heading-display">今日学习</h1>
      </div>
      <StreakIndicator :days="studyStore.streakDays" />
    </header>

    <div class="encouragement">
      <span class="enc-text">{{ encouragementText }}</span>
    </div>

    <div v-if="absenceAlert" class="absence-alert">
      <span class="absence-icon">⚠</span>
      <span>{{ absenceAlert }}</span>
    </div>

    <section class="achievements" v-if="unlockedAchievements.length > 0">
      <div class="section-label">已解锁成就 <span class="count">{{ totalUnlocked }}/{{ totalCount }}</span></div>
      <div class="badge-row">
        <div v-for="a in unlockedAchievements" :key="a.id" class="badge" :title="a.description">
          <span class="badge-icon">{{ a.icon }}</span>
          <span class="badge-name">{{ a.title }}</span>
        </div>
      </div>
    </section>

    <div v-if="newUnlock" class="toast">
      解锁成就！
    </div>

    <section class="stats-row">
      <div class="stat-card">
        <div class="stat-value">{{ studyStore.dashboardStats?.wordsLearned ?? 0 }}</div>
        <div class="stat-label">已学习</div>
      </div>
      <div class="stat-card">
        <div class="stat-value accent">{{ studyStore.dashboardStats?.wordsMastered ?? 0 }}</div>
        <div class="stat-label">已掌握</div>
      </div>
      <div class="stat-card">
        <div class="stat-value warm">{{ studyStore.dashboardStats?.reviewDue ?? 0 }}</div>
        <div class="stat-label">待复习</div>
      </div>
    </section>

    <section class="tasks-section">
      <div class="section-label">今日任务</div>
      <div class="task-grid">
        <DailyTaskCard title="新学单词" :current="studyStore.todayWordsLearned" :target="studyStore.todayPlan?.new_words_target ?? 20" unit="个" icon="◎" />
        <DailyTaskCard title="复习单词" :current="studyStore.todayWordsReviewed" :target="studyStore.todayPlan?.review_words_target ?? 30" unit="个" icon="↻" />
        <DailyTaskCard title="听力训练" :current="studyStore.listeningMinutes" :target="studyStore.todayPlan?.listening_minutes ?? 10" unit="分钟" icon="♪" />
      </div>
    </section>

    <!-- 睡前提醒 -->
    <div v-if="isEvening && !studyStore.isTodayComplete" class="evening-reminder">
      <span class="evening-icon">☽</span>
      <div class="evening-text">
        <strong>睡前复习提醒</strong>
        <p>睡前回顾今天学的单词，有助于将短期记忆转化为长期记忆。</p>
      </div>
    </div>

    <!-- 昨日回顾 -->
    <section v-if="yesterdayWords.length > 0" class="yesterday-section">
      <div class="section-label" @click="showYesterday = !showYesterday" style="cursor: pointer;">
        昨日学习回顾 <span class="toggle-arrow" :class="{ open: showYesterday }">›</span>
      </div>
      <div v-if="audioNotice" class="audio-notice">{{ audioNotice }}</div>
      <div v-if="showYesterday" class="yesterday-list">
        <div v-for="w in yesterdayWords" :key="(w as any).id" class="yesterday-word">
          <span class="yw-text">{{ (w as any).word }}</span>
          <span class="yw-phonetic">{{ (w as any).phonetic_us }}</span>
          <span class="yw-meaning">{{ (w as any).meaning_cn }}</span>
          <button class="yw-speak" :class="{ playing: playingAudioKey === ((w as any).id + ':us') }" @click.stop="speak((w as any).word, 'us', String((w as any).id))">🔊 美</button><button class="yw-speak" :class="{ playing: playingAudioKey === ((w as any).id + ':uk') }" @click.stop="speak((w as any).word, 'uk', String((w as any).id))">🔊 英</button>
        </div>
        <button class="btn ghost" @click="startReview" style="margin-top: 10px; width: auto;">开始今日复习</button>
      </div>
    </section>

    <section class="actions">
      <button class="btn primary" @click="startStudy">开始学习新单词</button>
      <button class="btn secondary" @click="startReview">开始复习</button>
    </section>

    <section class="extra-actions">
      <button class="btn ghost" @click="startListening">♪ 听力训练</button>
      <button class="btn ghost" @click="startReading">◇ 阅读训练</button>
    </section>

    <section class="complete" v-if="!studyStore.isTodayComplete">
      <button class="btn complete-btn" @click="completeToday">完成今日计划</button>
    </section>
    <section class="complete done" v-else>
      <div class="done-badge">今日计划已完成</div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 680px;
  margin: 0 auto;
}

.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.dash-date {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.dash-title {
  font-size: 26px;
  color: var(--text-primary);
  font-weight: 400;
}

.encouragement {
  padding: 14px 20px;
  margin-bottom: 28px;
  border-left: 2px solid var(--accent);
  background: rgba(217, 119, 6, 0.03);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.enc-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  font-style: italic;
}

.absence-alert {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px; margin-bottom: 20px;
  background: rgba(232, 107, 107, 0.06); border-radius: var(--radius-md);
  border: 1px solid rgba(232, 107, 107, 0.12);
  font-size: 13px; color: var(--danger);
}
.absence-icon { font-size: 14px; }

.achievements {
  margin-bottom: 28px;
}

.section-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: 600;
  margin-bottom: 12px;
}

.section-label .count {
  font-family: var(--font-mono);
  font-weight: 400;
  opacity: 0.6;
  margin-left: 6px;
}

.badge-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--glass-border);
  font-size: 11px;
  transition: all var(--transition-fast);
}

.badge:hover {
  background: var(--bg-card-hover);
}

.badge-icon {
  font-size: 13px;
}

.badge-name {
  color: var(--text-secondary);
  font-weight: 500;
}

.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: var(--bg-primary);
  padding: 10px 24px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  z-index: 100;
  animation: toast-in 0.3s ease, toast-out 0.3s ease 3.5s forwards;
  box-shadow: 0 8px 32px rgba(217, 119, 6, 0.3);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes toast-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 32px;
}

.stat-card {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 18px 16px;
  text-align: center;
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-card);
}

.stat-value {
  font-size: 30px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
  margin-bottom: 4px;
  letter-spacing: -1px;
}

.stat-value.accent {
  color: var(--accent);
}

.stat-value.warm {
  color: var(--warning);
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.tasks-section {
  margin-bottom: 28px;
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.btn {
  padding: 12px 20px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.btn.primary {
  flex: 1;
  background: var(--accent);
  color: var(--bg-primary);
}

.btn.primary:hover {
  background: var(--accent-light);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.btn.secondary {
  flex: 1;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--glass-border);
}

.btn.secondary:hover {
  background: var(--bg-card-hover);
}

/* 睡前提醒 */
.evening-reminder {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px 18px; margin-bottom: 20px;
  background: rgba(240, 168, 96, 0.04); border-radius: var(--radius-md);
  border: 1px solid rgba(240, 168, 96, 0.1);
}
.evening-icon { font-size: 18px; color: var(--warning); margin-top: 2px; }
.evening-text strong { font-size: 13px; color: var(--warning); display: block; margin-bottom: 4px; }
.evening-text p { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 0; }

/* 昨日回顾 */
.yesterday-section { margin-bottom: 20px; }
.toggle-arrow {
  display: inline-block; transition: transform var(--transition-fast);
  font-size: 14px; margin-left: 4px;
}
.toggle-arrow.open { transform: rotate(90deg); }

.yesterday-list {
  display: flex; flex-direction: column; gap: 4px;
  margin-top: 10px; padding: 14px;
  background: var(--bg-card); border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
}
.yesterday-word {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.yesterday-word:hover { background: rgba(255,255,255,0.02); }
.yw-text { font-size: 14px; font-weight: 600; color: var(--text-primary); min-width: 100px; }
.yw-phonetic { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.yw-meaning { font-size: 12px; color: var(--text-secondary); flex: 1; }
.yw-speak.playing { animation:yw-audio-pulse .7s infinite alternate; }.audio-notice { margin-bottom:10px; color:#9a3412; font-size:11px; }@keyframes yw-audio-pulse{to{transform:scale(1.06);opacity:.72}}
.yw-speak {
  font-size: 10px; padding: 3px 8px; border-radius: 3px;
  background: rgba(217, 119, 6, 0.06); color: var(--accent);
  border: none; cursor: pointer;
}
.yw-speak:hover { background: rgba(217, 119, 6, 0.12); }

.extra-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}

.btn.ghost {
  flex: 1;
  padding: 9px 16px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--glass-border);
}

.btn.ghost:hover {
  color: var(--text-secondary);
  border-color: rgba(44, 36, 32, 0.1);
  background: rgba(44, 36, 32, 0.03);
}

.complete {
  text-align: center;
}

.complete-btn {
  background: var(--accent);
  color: var(--bg-primary);
  padding: 11px 32px;
}

.complete-btn:hover {
  background: var(--accent-light);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.done-badge {
  display: inline-block;
  padding: 10px 24px;
  border-radius: var(--radius-md);
  background: rgba(107, 203, 119, 0.06);
  border: 1px solid rgba(107, 203, 119, 0.12);
  font-size: 13px;
  color: var(--success);
  font-weight: 500;
}
</style>
