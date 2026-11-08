import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface Word {
  id: number
  word: string
  phonetic_us: string
  meaning_cn: string
  pos: string
  example_sentence: string
  level: string
  frequency: number
  tags: string
}

interface WordLearning {
  word_id: number
  familiarity: number
  interval_days: number
  ease_factor: number
  status: string
  correct_count: number
  wrong_count: number
}

export const useWordStore = defineStore('word', () => {
  const words = ref<Word[]>([])
  const currentIndex = ref(0)
  const sessionWords = ref<Word[]>([])
  const isLoading = ref(false)

  const currentWord = computed(() => sessionWords.value[currentIndex.value] ?? null)
  const progress = computed(() => ({
    current: currentIndex.value + 1,
    total: sessionWords.value.length
  }))

  async function loadNewWords(limit = 20) {
    isLoading.value = true
    try {
      sessionWords.value = await window.cet4Api.getNewWords(limit)
      currentIndex.value = 0
    } finally {
      isLoading.value = false
    }
  }

  async function loadReviewWords(limit = 30) {
    isLoading.value = true
    try {
      sessionWords.value = await window.cet4Api.getReviewWords(limit)
      currentIndex.value = 0
    } finally {
      isLoading.value = false
    }
  }

  function nextWord() {
    if (currentIndex.value < sessionWords.value.length - 1) {
      currentIndex.value++
    }
  }

  return {
    words,
    currentIndex,
    sessionWords,
    isLoading,
    currentWord,
    progress,
    loadNewWords,
    loadReviewWords,
    nextWord
  }
})
