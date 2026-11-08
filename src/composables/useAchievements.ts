import { ref, computed } from 'vue'

interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  condition: (stats: any, plan: any) => boolean
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_word',
    title: '初出茅庐',
    description: '完成第一个单词的学习',
    icon: '🌱',
    condition: (stats) => (stats?.wordsLearned ?? 0) >= 1
  },
  {
    id: 'streak_3',
    title: '持之以恒',
    description: '连续学习 3 天',
    icon: '🔥',
    condition: (stats) => (stats?.streakDays ?? 0) >= 3
  },
  {
    id: 'streak_7',
    title: '一周之星',
    description: '连续学习 7 天',
    icon: '⭐',
    condition: (stats) => (stats?.streakDays ?? 0) >= 7
  },
  {
    id: 'words_50',
    title: '词汇新手',
    description: '累计学习 50 个单词',
    icon: '📗',
    condition: (stats) => (stats?.wordsLearned ?? 0) >= 50
  },
  {
    id: 'words_100',
    title: '词汇达人',
    description: '累计学习 100 个单词',
    icon: '📘',
    condition: (stats) => (stats?.wordsLearned ?? 0) >= 100
  },
  {
    id: 'mastered_20',
    title: '略有所成',
    description: '掌握 20 个单词',
    icon: '🎯',
    condition: (stats) => (stats?.wordsMastered ?? 0) >= 20
  },
  {
    id: 'mastered_50',
    title: '融会贯通',
    description: '掌握 50 个单词',
    icon: '🏆',
    condition: (stats) => (stats?.wordsMastered ?? 0) >= 50
  },
  {
    id: 'perfect_day',
    title: '完美一天',
    description: '完成一次每日计划',
    icon: '✨',
    condition: (_stats, plan) => plan?.is_completed === 1
  }
]

const STORAGE_KEY = 'cet4-achievements'

function loadUnlocked(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveUnlocked(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

export function useAchievements() {
  const unlockedIds = ref<string[]>(loadUnlocked())
  const newUnlock = ref<string | null>(null)

  function checkAndUnlock(stats: any, plan: any) {
    for (const a of ACHIEVEMENTS) {
      if (unlockedIds.value.includes(a.id)) continue
      if (a.condition(stats, plan)) {
        unlockedIds.value.push(a.id)
        newUnlock.value = a.id
        saveUnlocked([...unlockedIds.value])
        return a
      }
    }
    return null
  }

  function clearNewUnlock() {
    newUnlock.value = null
  }

  const unlockedAchievements = computed(() =>
    ACHIEVEMENTS.filter(a => unlockedIds.value.includes(a.id))
  )

  const lockedAchievements = computed(() =>
    ACHIEVEMENTS.filter(a => !unlockedIds.value.includes(a.id))
  )

  const totalUnlocked = computed(() => unlockedIds.value.length)
  const totalCount = computed(() => ACHIEVEMENTS.length)

  return {
    ACHIEVEMENTS,
    unlockedIds,
    unlockedAchievements,
    lockedAchievements,
    totalUnlocked,
    totalCount,
    newUnlock,
    checkAndUnlock,
    clearNewUnlock
  }
}
