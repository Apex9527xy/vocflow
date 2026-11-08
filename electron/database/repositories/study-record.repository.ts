import type { DbWrapper } from '../wrapper'

export class StudyRecordRepository {
  constructor(private db: DbWrapper) {}

  getByWordId(wordId: number) {
    return this.db.prepare('SELECT * FROM word_learning WHERE word_id = ?').get(wordId)
  }

  upsert(params: {
    word_id: number
    familiarity: number
    correct_count: number
    wrong_count: number
    last_review_at: string
    next_review_at: string
    interval_days: number
    ease_factor: number
    status: string
    consecutive_correct: number
  }) {
    // 使用 excluded.column 引用待插入的值，避免每个参数在 SQL 中重复出现
    return this.db.run(
      `INSERT INTO word_learning
         (word_id, familiarity, correct_count, wrong_count, last_review_at,
          next_review_at, interval_days, ease_factor, status, consecutive_correct)
       VALUES (@word_id, @familiarity, @correct_count, @wrong_count, @last_review_at,
               @next_review_at, @interval_days, @ease_factor, @status, @consecutive_correct)
       ON CONFLICT(word_id) DO UPDATE SET
         familiarity = excluded.familiarity,
         correct_count = excluded.correct_count,
         wrong_count = excluded.wrong_count,
         last_review_at = excluded.last_review_at,
         next_review_at = excluded.next_review_at,
         interval_days = excluded.interval_days,
         ease_factor = excluded.ease_factor,
         status = excluded.status,
         consecutive_correct = excluded.consecutive_correct`,
      {
        '@word_id': params.word_id,
        '@familiarity': params.familiarity,
        '@correct_count': params.correct_count,
        '@wrong_count': params.wrong_count,
        '@last_review_at': params.last_review_at,
        '@next_review_at': params.next_review_at,
        '@interval_days': params.interval_days,
        '@ease_factor': params.ease_factor,
        '@status': params.status,
        '@consecutive_correct': params.consecutive_correct
      }
    )
  }

  getWeakWords(limit: number) {
    return this.db
      .prepare(
        `SELECT w.*, wl.wrong_count, wl.familiarity, wl.status
         FROM words w
         JOIN word_learning wl ON w.id = wl.word_id
         WHERE wl.wrong_count > 0
         ORDER BY wl.wrong_count DESC, wl.familiarity ASC
         LIMIT ?`
      )
      .all(limit)
  }

  countByStatus(status: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM word_learning WHERE status = ?')
      .get(status) as { count: number } | undefined
    return row?.count ?? 0
  }

  countReviewDue(): number {
    const now = new Date().toISOString()
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM word_learning
         WHERE next_review_at <= ? AND status != 'mastered'`
      )
      .get(now) as { count: number } | undefined
    return row?.count ?? 0
  }
}
