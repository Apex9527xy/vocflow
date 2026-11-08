import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useStudyStore = defineStore('study', () => {
  const streakDays = ref(0)
  const todayWordsLearned = ref(0)
  const todayWordsReviewed = ref(0)
  const totalStudyMinutes = ref(0)
  const todayPlan = ref<any>(null)
  const dashboardStats = ref<any>(null)
  const sessionId = ref<number | null>(null)
  const sessionStartTime = ref<number>(0)

  const listeningMinutes = ref(0)
  const readingMinutes = ref(0)

  const isTodayComplete = computed(() => todayPlan.value?.is_completed === 1)

  async function loadDashboard() {
    const [stats, plan] = await Promise.all([
      window.cet4Api.getDashboardStats(),
      window.cet4Api.getTodayPlan()
    ])
    dashboardStats.value = stats
    todayPlan.value = plan
    streakDays.value = stats?.streakDays ?? 0
    todayWordsLearned.value = stats?.todayWordsLearned ?? 0
    todayWordsReviewed.value = stats?.todayWordsReviewed ?? 0
  }

  async function completeTodayPlan() {
    await window.cet4Api.completePlan()
    todayPlan.value = { ...todayPlan.value, is_completed: 1 }
  }

  async function startSession(type: string) {
    const result = await window.cet4Api.startSession(type)
    sessionId.value = result.sessionId
    sessionStartTime.value = Date.now()
  }

  async function endSession(wordsStudied: number) {
    if (!sessionId.value) return
    const duration = Math.round((Date.now() - sessionStartTime.value) / 1000)
    await window.cet4Api.updateSession({ wordsStudied, durationSeconds: duration })
  }

  async function updateSessionProgress(wordsStudied: number) {
    if (!sessionId.value) return
    const duration = Math.round((Date.now() - sessionStartTime.value) / 1000)
    await window.cet4Api.updateSession({ wordsStudied, durationSeconds: duration })
  }

  async function rateWord(wordId: number, familiarity: number) {
    const correct = familiarity >= 3
    await window.cet4Api.updateWordProgress({ wordId, familiarity, correct })
    if (familiarity >= 3) {
      todayWordsLearned.value++
    }
    todayWordsReviewed.value++
  }

  return {
    streakDays,
    todayWordsLearned,
    todayWordsReviewed,
    totalStudyMinutes,
    todayPlan,
    listeningMinutes,
    readingMinutes,
    dashboardStats,
    sessionId,
    isTodayComplete,
    loadDashboard,
    completeTodayPlan,
    startSession,
    endSession,
    updateSessionProgress,
    rateWord
  }
})
