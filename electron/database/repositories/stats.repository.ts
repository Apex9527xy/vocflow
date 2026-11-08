import type { DbWrapper } from '../wrapper'

export class StatsRepository {
  constructor(private db: DbWrapper) {}

  getDashboard() {
    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM words').get() as { count: number } | undefined
    const totalWords = totalRow?.count ?? 0

    const learnedRow = this.db
      .prepare("SELECT COUNT(*) as count FROM word_learning WHERE status != 'new'")
      .get() as { count: number } | undefined
    const wordsLearned = learnedRow?.count ?? 0

    const masteredRow = this.db
      .prepare("SELECT COUNT(*) as count FROM word_learning WHERE status = 'mastered'")
      .get() as { count: number } | undefined
    const wordsMastered = masteredRow?.count ?? 0

    const reviewRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM word_learning
         WHERE next_review_at <= ? AND status != 'mastered'`
      )
      .get(new Date().toISOString()) as { count: number } | undefined
    const reviewDue = reviewRow?.count ?? 0

    const streakDays = this.calculateStreak()

    const today = new Date().toISOString().slice(0, 10)
    const newWordsRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(words_studied), 0) as count
         FROM study_sessions WHERE session_date = ? AND session_type = 'new_words'`
      )
      .get(today) as { count: number } | undefined
    const todayWordsLearned = newWordsRow?.count ?? 0

    const reviewWordsRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(words_studied), 0) as count
         FROM study_sessions WHERE session_date = ? AND session_type = 'review'`
      )
      .get(today) as { count: number } | undefined
    const todayWordsReviewed = reviewWordsRow?.count ?? 0

    return { totalWords, wordsLearned, wordsMastered, reviewDue, streakDays, todayWordsLearned, todayWordsReviewed }
  }

  getHeatmap(days = 90) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const dateStr = since.toISOString().slice(0, 10)

    return this.db
      .prepare(
        `SELECT stat_date, words_learned, words_reviewed, total_study_minutes
         FROM daily_stats WHERE stat_date >= ? ORDER BY stat_date ASC`
      )
      .all(dateStr)
  }

  getWeekStats() {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const dateStr = weekAgo.toISOString().slice(0, 10)

    return this.db
      .prepare(
        `SELECT stat_date, words_learned, words_reviewed, words_mastered, total_study_minutes
         FROM daily_stats WHERE stat_date >= ? ORDER BY stat_date ASC`
      )
      .all(dateStr)
  }

  getSkillAnalysis() {
    // 按词频标签分析薄弱环节
    const tagStats = this.db
      .prepare(
        `SELECT w.tags, COUNT(*) as total,
                SUM(CASE WHEN wl.wrong_count > 0 THEN 1 ELSE 0 END) as weak_count,
                SUM(CASE WHEN wl.status = 'mastered' THEN 1 ELSE 0 END) as mastered_count,
                AVG(COALESCE(wl.wrong_count, 0)) as avg_wrong,
                AVG(COALESCE(wl.familiarity, 0)) as avg_familiarity
         FROM words w
         LEFT JOIN word_learning wl ON w.id = wl.word_id
         WHERE w.tags IS NOT NULL AND w.tags != ''
         GROUP BY w.tags`
      )
      .all() as Array<{ tags: string; total: number; weak_count: number; mastered_count: number; avg_wrong: number; avg_familiarity: number }>

    // 归类到技能维度
    const skills: Record<string, { total: number; weak: number; mastered: number; avgFam: number }> = {
      listening: { total: 0, weak: 0, mastered: 0, avgFam: 0 },
      reading: { total: 0, weak: 0, mastered: 0, avgFam: 0 },
      translation: { total: 0, weak: 0, mastered: 0, avgFam: 0 },
      writing: { total: 0, weak: 0, mastered: 0, avgFam: 0 }
    }

    for (const row of tagStats) {
      const tags: string[] = row.tags.split(',').map((t: string) => t.trim())
      for (const tag of tags) {
        if (tag.includes('听力')) {
          skills.listening.total += row.total; skills.listening.weak += row.weak_count; skills.listening.mastered += row.mastered_count; skills.listening.avgFam += row.avg_familiarity
        } else if (tag.includes('阅读')) {
          skills.reading.total += row.total; skills.reading.weak += row.weak_count; skills.reading.mastered += row.mastered_count; skills.reading.avgFam += row.avg_familiarity
        } else if (tag.includes('翻译')) {
          skills.translation.total += row.total; skills.translation.weak += row.weak_count; skills.translation.mastered += row.mastered_count; skills.translation.avgFam += row.avg_familiarity
        } else if (tag.includes('写作')) {
          skills.writing.total += row.total; skills.writing.weak += row.weak_count; skills.writing.mastered += row.mastered_count; skills.writing.avgFam += row.avg_familiarity
        }
      }
    }

    // 计算每个技能的掌握率
    const result: Array<{ name: string; key: string; total: number; weak: number; mastered: number; masteryRate: number; weakRate: number }> = []
    const nameMap: Record<string, string> = { listening: '听力词汇', reading: '阅读词汇', translation: '翻译词汇', writing: '写作词汇' }

    for (const [key, val] of Object.entries(skills)) {
      const total = Math.round(val.total / 4) // 词可能被多个标签计数，取近似
      const masteryRate = total > 0 ? Math.round((val.mastered / (total || 1)) * 100) : 0
      const weakRate = total > 0 ? Math.round((val.weak / (total || 1)) * 100) : 0
      result.push({ name: nameMap[key], key, total, weak: val.weak, mastered: val.mastered, masteryRate, weakRate })
    }

    return result
  }

  getEfficiencyTrend(days = 14) {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const dateStr = since.toISOString().slice(0, 10)

    return this.db
      .prepare(
        `SELECT stat_date, words_learned, words_reviewed, total_study_minutes,
                CASE WHEN total_study_minutes > 0
                  THEN ROUND(CAST((words_learned + words_reviewed) AS FLOAT) / total_study_minutes, 2)
                  ELSE 0
                END as efficiency
         FROM daily_stats WHERE stat_date >= ? ORDER BY stat_date ASC`
      )
      .all(dateStr)
  }

  getMemoryDistribution(): { status: string; count: number }[] {
    return this.db.prepare(
      `SELECT status, COUNT(*) as count FROM word_learning GROUP BY status`
    ).all() as { status: string; count: number }[]
  }

  private calculateStreak(): number {
    const rows = this.db
      .prepare('SELECT stat_date FROM daily_stats ORDER BY stat_date DESC LIMIT 60')
      .all() as Array<{ stat_date: string }>

    if (rows.length === 0) return 0

    const today = new Date().toISOString().slice(0, 10)
    let streak = 0
    const checkDate = new Date(today)

    for (const row of rows) {
      const rowDate = row.stat_date.slice(0, 10)
      const expected = checkDate.toISOString().slice(0, 10)

      if (rowDate === expected) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else if (rowDate < expected) {
        break
      }
    }

    return streak
  }
}
