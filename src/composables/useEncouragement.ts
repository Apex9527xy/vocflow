import { computed } from 'vue'
import { useStudyStore } from '../stores/study.store'

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const MESSAGES = {
  streak: [
    '坚持就是胜利，你已经连续学习 {days} 天了！',
    '{days} 天的坚持，离习惯养成越来越近了。',
    '每一个坚持的日子都值得骄傲 —— 第 {days} 天。',
    '连续 {days} 天，你的努力四级会看到的。',
    '第 {days} 天打卡！坚持一个月，四级必过。'
  ],
  almostDone: [
    '还差 {remaining} 个单词就完成今天的目标了。',
    '最后 {remaining} 个，坚持一下！',
    '今日目标近在眼前，再加把劲。',
    '胜利就在眼前，还差 {remaining} 个！'
  ],
  absence: [
    '你已经 {days} 天没学习了，今天至少背 20 个单词吧。',
    '已经 {days} 天没来了，别让之前的坚持白费。',
    '休息了 {days} 天，是时候重新开始了。',
    '{days} 天的空白，今天就把它补上。'
  ],
  encouragement: [
    '今天状态不错，继续保持！',
    '能坚持到现在很不容易，你做得很好。',
    '不要断，坚持一个月就能过四级。',
    '每一个单词都是通往四级的一步。',
    '今天的努力，是明天的底气。',
    '慢慢来，比较快。'
  ],
  morning: [
    '早上好！新的一天从背单词开始。',
    '早起学习，效率最高。今天的目标是 {target} 个新词。',
    '清晨是记忆的黄金时间，开始吧。'
  ],
  night: [
    '睡前复习一下今天学的单词，有助于记忆巩固。',
    '晚上好，完成今日目标了吗？',
    '睡前回顾是抗遗忘的关键，别忘了复习。'
  ]
}

export function useEncouragement() {
  const studyStore = useStudyStore()

  const encouragementText = computed(() => {
    const stats = studyStore.dashboardStats
    const plan = studyStore.todayPlan
    if (!stats) return '准备好了吗？开始今天的学习吧。'

    const streakDays = stats.streakDays
    const hour = new Date().getHours()

    // 有连续学习天数
    if (streakDays >= 3) {
      return pick(MESSAGES.streak).replace('{days}', String(streakDays))
    }

    // 检查是否接近完成目标
    if (plan) {
      const newTarget = plan.new_words_target ?? 20
      const reviewTarget = plan.review_words_target ?? 30
      const newDone = studyStore.todayWordsLearned
      const reviewDone = studyStore.todayWordsReviewed

      const newRemaining = Math.max(0, newTarget - newDone)
      const reviewRemaining = Math.max(0, reviewTarget - reviewDone)

      if (newRemaining > 0 && newRemaining <= 5) {
        return pick(MESSAGES.almostDone).replace('{remaining}', String(newRemaining))
      }
      if (reviewRemaining > 0 && reviewRemaining <= 5) {
        return pick(MESSAGES.almostDone).replace('{remaining}', String(reviewRemaining))
      }
    }

    // 早上/晚上特定消息
    if (hour >= 6 && hour < 10) {
      const msg = pick(MESSAGES.morning)
      if (plan) return msg.replace('{target}', String(plan.new_words_target ?? 20))
      return msg
    }
    if (hour >= 21) {
      return pick(MESSAGES.night)
    }

    // 缺勤提醒 (streakDays === 0 意味着今天还没学或断了)
    if (streakDays === 0) {
      return pick(MESSAGES.absence).replace('{days}', '1')
    }

    // 默认鼓励
    return pick(MESSAGES.encouragement)
  })

  // 用于 Dashboard 的缺勤天数提醒（独立于 streak 计算）
  const absenceAlert = computed(() => {
    const stats = studyStore.dashboardStats
    if (!stats) return null

    // streakDays === 0 且有历史学习记录说明断签了
    if (stats.streakDays === 0 && stats.wordsLearned > 0) {
      return '学习不能断，今天重新开始吧！'
    }
    return null
  })

  return { encouragementText, absenceAlert }
}
