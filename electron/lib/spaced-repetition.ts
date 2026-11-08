/**
 * SM-2 间隔重复算法 (SuperMemo 2)
 *
 * 根据用户对单词的熟悉度评分，计算下一次复习时间。
 *
 * 熟悉度 (quality 0-5):
 *   0 - 完全不认识
 *   1 - 看过但忘了（模糊）
 *   2 - 勉强记得
 *   3 - 一般（能想起来）
 *   4 - 熟悉
 *   5 - 完全掌握
 */

interface Sm2Input {
  quality: number       // 0-5 熟悉度评分
  interval: number      // 当前间隔天数
  easeFactor: number    // EF 因子 (默认 2.5, 最低 1.3)
  consecutiveCorrect: number // 连续正确次数
}

interface Sm2Result {
  interval: number
  easeFactor: number
  nextReviewDate: string
  status: 'new' | 'learning' | 'review' | 'mastered'
}

export function calculateNextReview(input: Sm2Input): Sm2Result {
  const { quality, interval: prevInterval, easeFactor: prevEF, consecutiveCorrect } = input

  // 计算新的 EF 因子
  let newEF = prevEF
  if (quality >= 3) {
    newEF = prevEF + (0.1 - (3 - quality) * (0.08 + (3 - quality) * 0.02))
  } else {
    newEF = prevEF - 0.2
  }
  if (newEF < 1.3) newEF = 1.3

  // 计算新的间隔
  let newInterval: number
  let status: Sm2Result['status']

  if (quality === 0) {
    // 完全不认识：当天再出现
    newInterval = 0
    status = 'learning'
  } else if (quality === 1 || quality === 2) {
    // 模糊/勉强：1天后复习
    newInterval = 1
    status = 'learning'
  } else if (consecutiveCorrect >= 5 && quality >= 4) {
    // 连续正确 5 次以上且熟悉：标记为掌握
    newInterval = prevInterval * newEF
    status = 'mastered'
  } else {
    // quality 3-5：正常间隔递进
    if (prevInterval === 0) {
      newInterval = 1
    } else if (prevInterval === 1) {
      newInterval = 3
    } else {
      newInterval = prevInterval * newEF
    }
    status = 'review'
  }

  // 计算下次复习日期
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + Math.round(newInterval))
  const nextReviewDate = nextDate.toISOString()

  return {
    interval: newInterval,
    easeFactor: newEF,
    nextReviewDate,
    status
  }
}

/**
 * 检测顽固词：连续错误 3 次以上的单词需要额外强化。
 */
export function isStubbornWord(wrongCount: number, consecutiveWrong: number): boolean {
  return wrongCount >= 3 || consecutiveWrong >= 2
}

/**
 * 计算每日建议新词数量：
 * 基于可用学习时长和单个单词平均耗时。
 */
export function calculateDailyNewWords(
  availableMinutes: number,
  avgSecondsPerWord: number = 15
): number {
  const totalSeconds = availableMinutes * 60
  const newWordsTime = totalSeconds * 0.5 // 一半时间学新词
  return Math.max(5, Math.round(newWordsTime / avgSecondsPerWord))
}
