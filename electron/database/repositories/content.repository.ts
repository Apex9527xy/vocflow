import type { DbWrapper } from '../wrapper'

export interface ReadingPassage {
  id: number
  title: string
  content: string
  topic: string | null
  difficulty: number
  question: string | null
  options_json: string | null
  answer: number | null
  source: string
}

export interface TranslationSentence {
  id: number
  en: string
  cn: string
  keywords_en: string | null
  keywords_cn: string | null
  topic: string | null
  source: string
}

export class ContentRepository {
  constructor(private db: DbWrapper) {}

  // ========== 阅读文章 ==========

  getReadingPassages(topic?: string, limit = 50): ReadingPassage[] {
    let sql = 'SELECT * FROM reading_passages WHERE 1=1'
    const params: unknown[] = []
    if (topic && topic !== 'all') {
      sql += ' AND topic = ?'
      params.push(topic)
    }
    sql += ' ORDER BY RANDOM() LIMIT ?'
    params.push(limit)
    return this.db.prepare(sql).all(...params) as ReadingPassage[]
  }

  getReadingPassageById(id: number): ReadingPassage | undefined {
    return this.db.prepare('SELECT * FROM reading_passages WHERE id = ?').get(id) as ReadingPassage | undefined
  }

  getReadingTopics(): { topic: string; count: number }[] {
    return this.db.prepare(
      'SELECT topic, COUNT(*) as count FROM reading_passages GROUP BY topic ORDER BY count DESC'
    ).all() as { topic: string; count: number }[]
  }

  insertReadingPassage(passage: {
    title: string
    content: string
    topic?: string
    difficulty?: number
    question?: string
    options?: string[]
    answer?: number
    source?: string
  }): number {
    const result = this.db.run(
      `INSERT INTO reading_passages (title, content, topic, difficulty, question, options_json, answer, source)
       VALUES (@title, @content, @topic, @difficulty, @question, @options_json, @answer, @source)`,
      {
        '@title': passage.title,
        '@content': passage.content,
        '@topic': passage.topic ?? null,
        '@difficulty': passage.difficulty ?? 1,
        '@question': passage.question ?? null,
        '@options_json': passage.options ? JSON.stringify(passage.options) : null,
        '@answer': passage.answer ?? null,
        '@source': passage.source ?? 'custom'
      }
    )
    return result.lastInsertRowid
  }

  insertReadingPassages(passages: Array<{
    title: string
    content: string
    topic?: string
    difficulty?: number
    question?: string
    options?: string[]
    answer?: number
  }>): number {
    let count = 0
    for (const p of passages) {
      this.insertReadingPassage(p)
      count++
    }
    return count
  }

  deleteReadingPassage(id: number): boolean {
    const result = this.db.run('DELETE FROM reading_passages WHERE id = @id', { '@id': id })
    return result.changes > 0
  }

  getReadingCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM reading_passages').get() as { count: number } | undefined
    return row?.count ?? 0
  }

  // ========== 翻译句子 ==========

  getTranslationSentences(topic?: string, limit = 50): TranslationSentence[] {
    let sql = 'SELECT * FROM translation_sentences WHERE 1=1'
    const params: unknown[] = []
    if (topic && topic !== 'all') {
      sql += ' AND topic = ?'
      params.push(topic)
    }
    sql += ' ORDER BY RANDOM() LIMIT ?'
    params.push(limit)
    return this.db.prepare(sql).all(...params) as TranslationSentence[]
  }

  getTranslationTopics(): { topic: string; count: number }[] {
    return this.db.prepare(
      `SELECT topic, COUNT(*) as count FROM translation_sentences GROUP BY topic ORDER BY count DESC`
    ).all() as { topic: string; count: number }[]
  }

  insertTranslationSentence(sentence: {
    en: string
    cn: string
    keywords_en?: string[]
    keywords_cn?: string[]
    topic?: string
    source?: string
  }): number {
    const result = this.db.run(
      `INSERT INTO translation_sentences (en, cn, keywords_en, keywords_cn, topic, source)
       VALUES (@en, @cn, @keywords_en, @keywords_cn, @topic, @source)`,
      {
        '@en': sentence.en,
        '@cn': sentence.cn,
        '@keywords_en': sentence.keywords_en ? JSON.stringify(sentence.keywords_en) : null,
        '@keywords_cn': sentence.keywords_cn ? JSON.stringify(sentence.keywords_cn) : null,
        '@topic': sentence.topic ?? null,
        '@source': sentence.source ?? 'custom'
      }
    )
    return result.lastInsertRowid
  }

  insertTranslationSentences(sentences: Array<{
    en: string
    cn: string
    keywords_en?: string[]
    keywords_cn?: string[]
    topic?: string
  }>): number {
    let count = 0
    for (const s of sentences) {
      this.insertTranslationSentence(s)
      count++
    }
    return count
  }

  deleteTranslationSentence(id: number): boolean {
    const result = this.db.run('DELETE FROM translation_sentences WHERE id = @id', { '@id': id })
    return result.changes > 0
  }

  getTranslationCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM translation_sentences').get() as { count: number } | undefined
    return row?.count ?? 0
  }
}
