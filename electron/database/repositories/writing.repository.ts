import type { DbWrapper } from '../wrapper'

export interface WritingHistory {
  id: number
  topic: string
  prompt: string | null
  essay_text: string
  word_count: number
  total_score: number
  keyword_score: number
  structure_score: number
  length_score: number
  feedback_json: string | null
  created_at: string
}

export class WritingRepository {
  constructor(private db: DbWrapper) {}

  saveEssay(data: {
    topic: string
    prompt?: string
    essay_text: string
    word_count: number
    total_score: number
    keyword_score: number
    structure_score: number
    length_score: number
    feedback?: string[]
  }): number {
    const result = this.db.run(
      `INSERT INTO writing_history (topic, prompt, essay_text, word_count, total_score, keyword_score, structure_score, length_score, feedback_json)
       VALUES (@topic, @prompt, @essay_text, @word_count, @total_score, @keyword_score, @structure_score, @length_score, @feedback_json)`,
      {
        '@topic': data.topic,
        '@prompt': data.prompt ?? null,
        '@essay_text': data.essay_text,
        '@word_count': data.word_count,
        '@total_score': data.total_score,
        '@keyword_score': data.keyword_score,
        '@structure_score': data.structure_score,
        '@length_score': data.length_score,
        '@feedback_json': data.feedback ? JSON.stringify(data.feedback) : null
      }
    )
    return result.lastInsertRowid
  }

  getHistory(limit = 20): WritingHistory[] {
    return this.db.prepare(
      'SELECT * FROM writing_history ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as WritingHistory[]
  }

  getHistoryByTopic(topic: string, limit = 10): WritingHistory[] {
    return this.db.prepare(
      'SELECT * FROM writing_history WHERE topic = ? ORDER BY created_at DESC LIMIT ?'
    ).all(topic, limit) as WritingHistory[]
  }

  deleteHistory(id: number): boolean {
    const result = this.db.run('DELETE FROM writing_history WHERE id = @id', { '@id': id })
    return result.changes > 0
  }

  getHistoryCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM writing_history').get() as { count: number } | undefined
    return row?.count ?? 0
  }

  getAverageScore(): number {
    const row = this.db.prepare(
      'SELECT AVG(total_score) as avg_score FROM writing_history'
    ).get() as { avg_score: number | null } | undefined
    return row?.avg_score ?? 0
  }
}
