import type { DbWrapper } from '../wrapper'

export class DailyPlanRepository {
  constructor(private db: DbWrapper) {}

  getToday() {
    const today = new Date().toISOString().slice(0, 10)
    let plan = this.db.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').get(today)
    if (!plan) {
      plan = this.createTodayPlan(today)
    }
    return plan
  }

  private createTodayPlan(today: string) {
    const targets = this.calculateAdaptiveTargets()
    this.db.run(
      `INSERT INTO daily_plans (plan_date, new_words_target, review_words_target, listening_minutes, reading_minutes)
       VALUES (@plan_date, @new_words_target, @review_words_target, @listening_minutes, @reading_minutes)`,
      {
        '@plan_date': today,
        '@new_words_target': targets.newWords,
        '@review_words_target': targets.reviewWords,
        '@listening_minutes': targets.listening,
        '@reading_minutes': targets.reading
      }
    )
    return this.db.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').get(today)
  }

  private calculateAdaptiveTargets(): { newWords: number; reviewWords: number; listening: number; reading: number } {
    // 默认值
    let newWords = 20
    let reviewWords = 30
    let listening = 10
    let reading = 10

    try {
      // 1. 检查顽固词数量
      const stubbornRow = this.db
        .prepare("SELECT COUNT(*) as count FROM word_learning WHERE wrong_count >= 3")
        .get() as { count: number } | undefined
      const stubbornCount = stubbornRow?.count ?? 0

      // 2. 检查待复习单词数量
      const now = new Date().toISOString()
      const reviewDueRow = this.db
        .prepare("SELECT COUNT(*) as count FROM word_learning WHERE next_review_at <= ? AND status != 'mastered'")
        .get(now) as { count: number } | undefined
      const reviewDue = reviewDueRow?.count ?? 0

      // 3. 检查最近7天的完成率
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weekStr = weekAgo.toISOString().slice(0, 10)
      const weekStats = this.db
        .prepare(
          `SELECT AVG(CASE WHEN is_completed = 1 THEN 1.0 ELSE 0.0 END) as completion_rate,
                  AVG(words_learned) as avg_learned,
                  AVG(words_reviewed) as avg_reviewed
           FROM daily_stats WHERE stat_date >= ?`
        )
        .get(weekStr) as { completion_rate: number; avg_learned: number; avg_reviewed: number } | undefined

      const completionRate = weekStats?.completion_rate ?? 0
      const avgLearned = weekStats?.avg_learned ?? 0

      // 4. 根据顽固词调整复习量
      if (stubbornCount > 20) {
        reviewWords = Math.min(50, 30 + Math.floor(stubbornCount / 5))
      } else if (stubbornCount > 10) {
        reviewWords = 35
      }

      // 5. 根据待复习量调整
      if (reviewDue > 50) {
        reviewWords = Math.min(60, reviewWords + 10)
      }

      // 6. 根据完成率调整新词量
      if (completionRate >= 0.8 && avgLearned >= 20) {
        // 完成率高，可以增加新词
        newWords = Math.min(35, 20 + 5)
      } else if (completionRate < 0.4) {
        // 完成率低，减少新词
        newWords = Math.max(10, 15)
        reviewWords = Math.max(20, reviewWords - 5)
      }

      // 7. 根据已学单词总量调整
      const totalLearnedRow = this.db
        .prepare("SELECT COUNT(*) as count FROM word_learning WHERE status != 'new'")
        .get() as { count: number } | undefined
      const totalLearned = totalLearnedRow?.count ?? 0

      // 学习后期减少新词，增加复习
      if (totalLearned > 800) {
        newWords = Math.max(10, newWords - 5)
        reviewWords = Math.min(50, reviewWords + 5)
      }

    } catch (err) {
      console.error('calculateAdaptiveTargets error:', err)
    }

    return { newWords, reviewWords, listening, reading }
  }

  updateTodayTargets(targets: { newWordsTarget: number; reviewWordsTarget: number; listeningMinutes: number; readingMinutes: number }) {
    const today = new Date().toISOString().slice(0, 10)
    // 如果今天的计划不存在，先创建
    let plan = this.db.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').get(today)
    if (!plan) {
      this.createTodayPlan(today)
    }
    // 更新为用户设置的目标
    this.db.run(
      `UPDATE daily_plans SET
        new_words_target = @new,
        review_words_target = @review,
        listening_minutes = @listen,
        reading_minutes = @read
      WHERE plan_date = @date`,
      {
        '@new': targets.newWordsTarget,
        '@review': targets.reviewWordsTarget,
        '@listen': targets.listeningMinutes,
        '@read': targets.readingMinutes,
        '@date': today
      }
    )
    return this.db.prepare('SELECT * FROM daily_plans WHERE plan_date = ?').get(today)
  }

  complete() {
    const today = new Date().toISOString().slice(0, 10)
    this.db.run(
      'UPDATE daily_plans SET is_completed = 1, completed_at = @now WHERE plan_date = @date',
      {
        '@now': new Date().toISOString(),
        '@date': today
      }
    )
    this.updateDailyStats(today)
  }

  private updateDailyStats(today: string) {
    const learnedRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM word_learning
         WHERE date(last_review_at) = ? AND status != 'new'`
      )
      .get(today) as { count: number } | undefined
    const wordsLearned = learnedRow?.count ?? 0

    const reviewedRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM word_learning
         WHERE date(last_review_at) = ? AND status = 'review'`
      )
      .get(today) as { count: number } | undefined
    const wordsReviewed = reviewedRow?.count ?? 0

    const masteredRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM word_learning
         WHERE date(last_review_at) = ? AND status = 'mastered'`
      )
      .get(today) as { count: number } | undefined
    const wordsMastered = masteredRow?.count ?? 0

    this.db.run(
      `INSERT INTO daily_stats (stat_date, words_learned, words_reviewed, words_mastered)
       VALUES (@date, @learned, @reviewed, @mastered)
       ON CONFLICT(stat_date) DO UPDATE SET
         words_learned = excluded.words_learned,
         words_reviewed = excluded.words_reviewed,
         words_mastered = excluded.words_mastered`,
      {
        '@date': today,
        '@learned': wordsLearned,
        '@reviewed': wordsReviewed,
        '@mastered': wordsMastered
      }
    )
  }
}
