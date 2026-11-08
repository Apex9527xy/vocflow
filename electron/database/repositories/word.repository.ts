import type { DbWrapper } from '../wrapper'

export class WordRepository {
  constructor(private db: DbWrapper) { }

  getWords(limit: number, offset: number, level?: string): unknown[] {
    let sql = 'SELECT * FROM words WHERE 1=1'
    const params: unknown[] = []
    if (level) {
      sql += ' AND level = ?'
      params.push(level)
    }
    sql += ' ORDER BY frequency DESC, RANDOM() LIMIT ? OFFSET ?'
    params.push(limit, offset)
    return this.db.prepare(sql).all(...params)
  }

  getDictionaryEntries(): Array<{ word: string; pos: string | null; meaning_cn: string | null }> {
    return this.db.prepare(
      `SELECT word, pos, meaning_cn
       FROM words
       WHERE word IS NOT NULL AND meaning_cn IS NOT NULL`
    ).all() as Array<{ word: string; pos: string | null; meaning_cn: string | null }>
  }

  getById(id: number) {
    return this.db.prepare('SELECT * FROM words WHERE id = ?').get(id)
  }

  getNewWords(limit: number) {
    return this.db
      .prepare(
        `SELECT w.* FROM words w
         LEFT JOIN word_learning wl ON w.id = wl.word_id
         WHERE (wl.word_id IS NULL OR wl.status = 'new')
           AND EXISTS (
             SELECT 1 FROM word_book_words wbw
             JOIN word_books wb ON wb.id = wbw.book_id
             WHERE wbw.word_id = w.id AND wb.enabled = 1
           )
         ORDER BY w.frequency DESC, RANDOM()
         LIMIT ?`
      )
      .all(limit)
  }

  getReviewWords(limit: number) {
    const now = new Date().toISOString()
    return this.db
      .prepare(
        `SELECT w.*, wl.familiarity, wl.correct_count, wl.wrong_count,
                wl.interval_days, wl.ease_factor, wl.consecutive_correct
         FROM words w
         JOIN word_learning wl ON w.id = wl.word_id
         WHERE wl.next_review_at <= ? AND wl.status != 'mastered'
           AND EXISTS (
             SELECT 1 FROM word_book_words wbw
             JOIN word_books wb ON wb.id = wbw.book_id
             WHERE wbw.word_id = w.id AND wb.enabled = 1
           )
         ORDER BY wl.next_review_at ASC
         LIMIT ?`
      )
      .all(now, limit)
  }

  searchWords(query: string, limit: number = 20): unknown[] {
    const q = `%${query}%`
    return this.db
      .prepare(
        `SELECT w.*, wl.familiarity, wl.correct_count, wl.wrong_count
         FROM words w
         LEFT JOIN word_learning wl ON w.id = wl.word_id
         WHERE w.word LIKE ? OR w.meaning_cn LIKE ? OR w.phonetic_us LIKE ?
         ORDER BY w.frequency DESC
         LIMIT ?`
      )
      .all(q, q, q, limit)
  }

  getWordsByDate(date: string, limit: number = 10): unknown[] {
    return this.db
      .prepare(
        `SELECT w.*, wl.familiarity, wl.correct_count, wl.wrong_count
         FROM words w
         JOIN word_learning wl ON w.id = wl.word_id
         WHERE date(wl.last_review_at) = ?
         ORDER BY wl.last_review_at DESC
         LIMIT ?`
      )
      .all(date, limit)
  }

  countAll(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM words').get() as { count: number } | undefined
    return row?.count ?? 0
  }

  countByLevel(level: string): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM words WHERE level = ?').get(level) as { count: number } | undefined
    return row?.count ?? 0
  }

  getWordBooks(): unknown[] {
    return this.db.prepare(
      `SELECT wb.*, COUNT(wbw.word_id) AS actual_count
       FROM word_books wb
       LEFT JOIN word_book_words wbw ON wbw.book_id = wb.id
       GROUP BY wb.id
       ORDER BY wb.sort_order ASC, wb.id ASC`
    ).all()
  }

  setWordBookEnabled(slug: string, enabled: boolean): { success: boolean } {
    const result = this.db.prepare('UPDATE word_books SET enabled = ? WHERE slug = ?').run(enabled ? 1 : 0, slug)
    return { success: result.changes > 0 }
  }

  deleteCustomWordbook(slug: string): { success: boolean; message: string } {
    const normalized = String(slug || '').trim()
    if (!normalized.startsWith('custom-')) {
      return { success: false, message: '内置词书不能删除' }
    }
    const book = this.db.prepare('SELECT id, name FROM word_books WHERE slug = ?').get(normalized) as { id?: number; name?: string } | undefined
    if (!book?.id) return { success: false, message: '词书不存在或已经删除' }
    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM word_book_words WHERE book_id = ?').run(book.id)
      this.db.prepare('DELETE FROM word_books WHERE id = ?').run(book.id)
      this.db.exec('COMMIT')
      return { success: true, message: `已删除自定义词书「${book.name || normalized}」` }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  countEnabled(): number {
    const row = this.db.prepare(
      `SELECT COUNT(DISTINCT wbw.word_id) AS count
       FROM word_book_words wbw
       JOIN word_books wb ON wb.id = wbw.book_id
       WHERE wb.enabled = 1`
    ).get() as { count: number } | undefined
    return Number(row?.count ?? 0)
  }
  recordLookup(entry: { word: string; meaningCn?: string; phoneticUs?: string; source?: string; context?: string }): void {
    this.db.run(
      `INSERT INTO lookup_history (word, meaning_cn, phonetic_us, source, context, lookup_count, last_looked_up_at)
       VALUES (@word, @meaning, @phonetic, @source, @context, 1, datetime('now'))
       ON CONFLICT(word) DO UPDATE SET
         meaning_cn = COALESCE(excluded.meaning_cn, lookup_history.meaning_cn),
         phonetic_us = COALESCE(excluded.phonetic_us, lookup_history.phonetic_us),
         source = COALESCE(excluded.source, lookup_history.source),
         context = COALESCE(excluded.context, lookup_history.context),
         lookup_count = lookup_history.lookup_count + 1,
         last_looked_up_at = datetime('now')`,
      {
        '@word': entry.word.trim().toLowerCase(),
        '@meaning': entry.meaningCn ?? null,
        '@phonetic': entry.phoneticUs ?? null,
        '@source': entry.source ?? null,
        '@context': entry.context ?? null
      }
    )
  }

  getLookupHistory(limit = 30): unknown[] {
    return this.db.prepare(
      'SELECT * FROM lookup_history ORDER BY last_looked_up_at DESC, id DESC LIMIT ?'
    ).all(limit)
  }

  deleteLookupHistory(id: number): { success: boolean } {
    const result = this.db.prepare('DELETE FROM lookup_history WHERE id = ?').run(id)
    return { success: result.changes > 0 }
  }

  clearLookupHistory(): { success: boolean } {
    this.db.prepare('DELETE FROM lookup_history').run()
    return { success: true }
  }

  importCustomWordbook(input: {
    name?: string
    stage?: string
    description?: string
    sourceFile?: string
    words: Array<Record<string, unknown>>
  }): { success: boolean; message: string; added: number; slug?: string; name?: string } {
    const clean = (value: unknown) => String(value ?? '').trim()
    const normalizedWords: Array<{
      word: string
      meaning_cn: string
      phonetic_us: string
      pos: string
      example_sentence: string
      frequency: number
      tags: string
    }> = []
    const seen = new Set<string>()

    for (const raw of input.words || []) {
      const word = clean(raw.word)
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/[–—]/g, '-')
      if (word.length < 1 || word.length > 80 || !/^[a-z][a-z'./ -]*$/.test(word) || seen.has(word)) continue
      const meaning = clean(raw.meaning_cn ?? raw.meaning ?? raw.translation)
      if (!meaning) continue
      seen.add(word)
      const rawTags = raw.tags
      normalizedWords.push({
        word,
        meaning_cn: meaning,
        phonetic_us: clean(raw.phonetic_us ?? raw.phonetic),
        pos: clean(raw.pos),
        example_sentence: clean(raw.example_sentence ?? raw.example),
        frequency: Number.isFinite(Number(raw.frequency)) ? Number(raw.frequency) : 0,
        tags: Array.isArray(rawTags) ? rawTags.map(clean).filter(Boolean).join(',') : clean(rawTags)
      })
    }

    if (!normalizedWords.length) {
      return { success: false, message: '没有识别到带中文释义的有效单词', added: 0 }
    }

    const name = (clean(input.name) || '我的自定义词书').slice(0, 80)
    const stage = (clean(input.stage) || '自定义').slice(0, 40)
    const description = (clean(input.description) || `用户导入的自定义词书，共 ${normalizedWords.length} 词`).slice(0, 200)
    const sourceFile = (clean(input.sourceFile) || 'custom-import').slice(0, 200)
    const slug = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    this.db.exec('BEGIN')
    try {
      const maxSort = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM word_books').get() as { value?: number } | undefined
      const sortOrder = Number(maxSort?.value ?? 0) + 10
      const insertBook = this.db.prepare(
        `INSERT INTO word_books
         (slug, name, short_name, stage, description, source_file, word_count, enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      const bookResult = insertBook.run(
        slug,
        name,
        name.slice(0, 8),
        stage,
        description,
        sourceFile,
        normalizedWords.length,
        sortOrder
      )
      const bookId = Number(bookResult.lastInsertRowid)
      if (!bookId) throw new Error('无法创建自定义词书')

      const insertWord = this.db.prepare(
        `INSERT OR IGNORE INTO words
         (word, phonetic_us, meaning_cn, pos, example_sentence, level, frequency, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const findWord = this.db.prepare('SELECT id FROM words WHERE word = ?')
      const insertMembership = this.db.prepare(
        'INSERT OR IGNORE INTO word_book_words (book_id, word_id, position) VALUES (?, ?, ?)'
      )

      let added = 0
      for (const item of normalizedWords) {
        insertWord.run(
          item.word,
          item.phonetic_us,
          item.meaning_cn,
          item.pos,
          item.example_sentence,
          slug,
          item.frequency,
          item.tags || '[]'
        )
        const row = findWord.get(item.word) as { id?: number } | undefined
        const wordId = Number(row?.id ?? 0)
        if (!wordId) continue
        const membership = insertMembership.run(bookId, wordId, added + 1)
        if (membership.changes > 0) added += 1
      }

      this.db.prepare('UPDATE word_books SET word_count = ? WHERE id = ?').run(added, bookId)
      this.db.exec('COMMIT')
      return {
        success: true,
        message: `已导入自定义词书「${name}」，共 ${added} 个单词`,
        added,
        slug,
        name
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  insertWords(words: Array<{
    word: string
    phonetic_us?: string
    meaning_cn: string
    pos?: string
    example_sentence?: string
    level?: string
    frequency?: number
    tags?: string
  }>) {
    for (const w of words) {
      this.db.run(
        `INSERT OR IGNORE INTO words (word, phonetic_us, meaning_cn, pos, example_sentence, level, frequency, tags)
         VALUES (@word, @phonetic_us, @meaning_cn, @pos, @example_sentence, @level, @frequency, @tags)`,
        {
          '@word': w.word,
          '@phonetic_us': w.phonetic_us ?? null,
          '@meaning_cn': w.meaning_cn,
          '@pos': w.pos ?? null,
          '@example_sentence': w.example_sentence ?? null,
          '@level': w.level ?? 'cet4',
          '@frequency': w.frequency ?? 0,
          '@tags': w.tags ?? '[]'
        }
      )
    }
  }
}
