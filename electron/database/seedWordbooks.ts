import type { Database as SqlJsDatabase, BindParams } from 'sql.js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'

interface WordBookManifest {
  version: string
  books: Array<{
    slug: string
    name: string
    shortName?: string
    stage?: string
    file: string
    enabled?: number
    sortOrder?: number
    description?: string
  }>
}

interface RawWord {
  word: string
  phonetic_us?: string
  meaning_cn?: string
  pos?: string
  example_sentence?: string
  level?: string
  frequency?: number
  tags?: string
}

interface BookSnapshot {
  id: number
  slug: string
  name: string
  short_name: string | null
  stage: string | null
  description: string | null
  source_file: string | null
  enabled: number
  sort_order: number
  words: RawWord[]
}

interface ProgressRow {
  word: string
  familiarity: number
  correct_count: number
  wrong_count: number
  last_review_at: string | null
  next_review_at: string | null
  interval_days: number
  ease_factor: number
  status: string
  consecutive_correct: number
  created_at: string | null
}

function queryRows(db: SqlJsDatabase, sql: string, params: BindParams = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql)
  if (params && params.length) stmt.bind(params)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function getMeta(db: SqlJsDatabase, key: string): string {
  const stmt = db.prepare('SELECT value FROM app_meta WHERE key = ?')
  stmt.bind([key])
  let value = ''
  if (stmt.step()) value = String(stmt.getAsObject().value ?? '')
  stmt.free()
  return value
}

function setMeta(db: SqlJsDatabase, key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)')
  stmt.run([key, value])
  stmt.free()
}

function normalizeWord(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, '-')
}

function validWord(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && /[a-z]/.test(value) && /^[a-z][a-z'./ -]*$/.test(value)
}

function findManifest(possiblePaths: string[]): string {
  for (const path of possiblePaths) {
    if (existsSync(path)) return path
  }
  return ''
}

export function seedWordbooks(db: SqlJsDatabase, possibleManifestPaths: string[]): boolean {
  const manifestPath = findManifest(possibleManifestPaths)
  if (!manifestPath) {
    console.error('词书清单 manifest.json 未找到:', possibleManifestPaths)
    return false
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as WordBookManifest
  const versionKey = 'pdf-wordbooks-version'
  const currentVersion = getMeta(db, versionKey)
  const wordCountRow = queryRows(db, 'SELECT COUNT(*) AS count FROM words')[0]
  const bookCountRow = queryRows(db, 'SELECT COUNT(*) AS count FROM word_books')[0]
  const currentWordCount = Number(wordCountRow?.count ?? 0)
  const currentBookCount = Number(bookCountRow?.count ?? 0)
  if (currentVersion === manifest.version && currentBookCount >= manifest.books.length && currentWordCount >= 5000) {
    console.log('PDF 词书已是最新版本:', manifest.version)
    return false
  }

  console.log('开始迁移 PDF 词书:', manifest.version)
  const progressRows = queryRows(
    db,
    `SELECT w.word, wl.familiarity, wl.correct_count, wl.wrong_count,
            wl.last_review_at, wl.next_review_at, wl.interval_days,
            wl.ease_factor, wl.status, wl.consecutive_correct, wl.created_at
     FROM word_learning wl
     JOIN words w ON w.id = wl.word_id`
  ) as unknown as ProgressRow[]

  const builtinSlugs = new Set(manifest.books.map(book => book.slug))
  const retiredSlugs = new Set(['roots'])
  const customBooks = queryRows(db, 'SELECT * FROM word_books ORDER BY sort_order ASC, id ASC')
    .filter(row => {
      const slug = String(row.slug ?? '')
      const name = String(row.name ?? '')
      return !builtinSlugs.has(slug) && !retiredSlugs.has(slug) && !name.includes('单词密码')
    })
    .map(row => ({
      id: Number(row.id ?? 0),
      slug: String(row.slug ?? ''),
      name: String(row.name ?? '自定义词书'),
      short_name: row.short_name == null ? null : String(row.short_name),
      stage: row.stage == null ? null : String(row.stage),
      description: row.description == null ? null : String(row.description),
      source_file: row.source_file == null ? null : String(row.source_file),
      enabled: Number(row.enabled ?? 1),
      sort_order: Number(row.sort_order ?? 0),
      words: queryRows(
        db,
        `SELECT w.word, w.phonetic_us, w.meaning_cn, w.pos, w.example_sentence,
                w.level, w.frequency, w.tags
         FROM word_book_words wbw
         JOIN words w ON w.id = wbw.word_id
         WHERE wbw.book_id = ?
         ORDER BY wbw.position ASC`,
        [Number(row.id ?? 0)]
      ) as unknown as RawWord[]
    })) as BookSnapshot[]

  db.run('BEGIN')
  const insertBook = db.prepare(
    `INSERT INTO word_books (slug, name, short_name, stage, description, source_file, word_count, enabled, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  )
  const insertWord = db.prepare(
    `INSERT INTO words (word, phonetic_us, meaning_cn, pos, example_sentence, level, frequency, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(word) DO UPDATE SET
       phonetic_us = CASE WHEN length(excluded.phonetic_us) > length(COALESCE(words.phonetic_us, '')) THEN excluded.phonetic_us ELSE words.phonetic_us END,
       meaning_cn = CASE WHEN length(excluded.meaning_cn) > length(COALESCE(words.meaning_cn, '')) THEN excluded.meaning_cn ELSE words.meaning_cn END,
       pos = CASE WHEN COALESCE(words.pos, '') = '' THEN excluded.pos ELSE words.pos END,
       tags = CASE WHEN COALESCE(words.tags, '[]') = '[]' THEN excluded.tags ELSE words.tags END`
  )
  const findWordId = db.prepare('SELECT id FROM words WHERE word = ?')
  const insertMembership = db.prepare(
    'INSERT OR IGNORE INTO word_book_words (book_id, word_id, position) VALUES (?, ?, ?)'
  )
  const updateBookCount = db.prepare('UPDATE word_books SET word_count = ? WHERE id = ?')

  try {
    db.run('UPDATE vocabulary_notebook SET word_id = NULL WHERE word_id IS NOT NULL')
    db.run('DELETE FROM word_learning')
    db.run('DELETE FROM word_book_words')
    db.run('DELETE FROM words')
    db.run('DELETE FROM word_books')

    for (const book of manifest.books) {
      insertBook.run([
        book.slug,
        book.name,
        book.shortName ?? book.name,
        book.stage ?? '',
        book.description ?? '',
        book.file,
        book.enabled ? 1 : 0,
        book.sortOrder ?? 0
      ] as BindParams)
      const bookId = Number(queryRows(db, 'SELECT last_insert_rowid() AS id')[0]?.id ?? 0)
      if (!bookId) throw new Error(`无法创建词书记录: ${book.slug}`)

      const filePath = join(dirname(manifestPath), book.file)
      if (!existsSync(filePath)) throw new Error(`词书文件不存在: ${filePath}`)
      const words = JSON.parse(readFileSync(filePath, 'utf-8')) as RawWord[]
      let position = 0
      const seen = new Set<string>()

      for (const rawWord of words) {
        const word = normalizeWord(rawWord.word)
        if (!validWord(word) || seen.has(word)) continue
        seen.add(word)
        position += 1
        insertWord.run([
          word,
          rawWord.phonetic_us ?? '',
          rawWord.meaning_cn ?? '',
          rawWord.pos ?? '',
          rawWord.example_sentence ?? '',
          rawWord.level ?? book.slug,
          rawWord.frequency ?? 0,
          rawWord.tags ?? '[]'
        ] as BindParams)

        findWordId.reset()
        findWordId.bind([word])
        let wordId = 0
        if (findWordId.step()) wordId = Number(findWordId.getAsObject().id ?? 0)
        findWordId.reset()
        if (wordId) insertMembership.run([bookId, wordId, position] as BindParams)
      }

      updateBookCount.run([position, bookId] as BindParams)
      console.log(`已导入词书 ${book.name}: ${position} 个单词`)
    }

    for (const book of customBooks) {
      insertBook.run([
        book.slug,
        book.name,
        book.short_name ?? book.name,
        book.stage ?? '自定义',
        book.description ?? '',
        book.source_file ?? 'custom-import',
        book.enabled ? 1 : 0,
        book.sort_order
      ] as BindParams)
      const bookId = Number(queryRows(db, 'SELECT last_insert_rowid() AS id')[0]?.id ?? 0)
      if (!bookId) throw new Error(`无法恢复自定义词书: ${book.slug}`)
      let position = 0
      const seen = new Set<string>()
      for (const rawWord of book.words) {
        const word = normalizeWord(rawWord.word)
        if (!validWord(word) || seen.has(word)) continue
        seen.add(word)
        position += 1
        insertWord.run([
          word,
          rawWord.phonetic_us ?? '',
          rawWord.meaning_cn ?? '',
          rawWord.pos ?? '',
          rawWord.example_sentence ?? '',
          rawWord.level ?? book.slug,
          rawWord.frequency ?? 0,
          rawWord.tags ?? '[]'
        ] as BindParams)
        findWordId.reset()
        findWordId.bind([word])
        let wordId = 0
        if (findWordId.step()) wordId = Number(findWordId.getAsObject().id ?? 0)
        findWordId.reset()
        if (wordId) insertMembership.run([bookId, wordId, position] as BindParams)
      }
      updateBookCount.run([position, bookId] as BindParams)
      console.log(`已恢复自定义词书 ${book.name}: ${position} 个单词`)
    }

    const findWordIdForProgress = db.prepare('SELECT id FROM words WHERE word = ?')
    const restoreProgress = db.prepare(
      `INSERT OR IGNORE INTO word_learning
       (word_id, familiarity, correct_count, wrong_count, last_review_at, next_review_at,
        interval_days, ease_factor, status, consecutive_correct, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    let restored = 0
    for (const row of progressRows) {
      const word = normalizeWord(row.word)
      findWordIdForProgress.reset()
      findWordIdForProgress.bind([word])
      let wordId = 0
      if (findWordIdForProgress.step()) wordId = Number(findWordIdForProgress.getAsObject().id ?? 0)
      findWordIdForProgress.reset()
      if (!wordId) continue
      restoreProgress.run([
        wordId,
        row.familiarity ?? 0,
        row.correct_count ?? 0,
        row.wrong_count ?? 0,
        row.last_review_at ?? null,
        row.next_review_at ?? null,
        row.interval_days ?? 0,
        row.ease_factor ?? 2.5,
        row.status ?? 'new',
        row.consecutive_correct ?? 0,
        row.created_at ?? null
      ] as BindParams)
      restored += 1
    }
    findWordIdForProgress.free()
    restoreProgress.free()

    db.run(`UPDATE vocabulary_notebook
            SET word_id = (SELECT id FROM words WHERE words.word = lower(trim(vocabulary_notebook.word_text)))
            WHERE word_id IS NULL`)
    setMeta(db, versionKey, manifest.version)
    db.run('PRAGMA user_version = 2')
    db.run('COMMIT')
    console.log(`PDF 词书迁移完成，恢复学习记录 ${restored} 条`)
    insertBook.free()
    insertWord.free()
    findWordId.free()
    insertMembership.free()
    updateBookCount.free()
    return true
  } catch (error) {
    db.run('ROLLBACK')
    insertBook.free()
    insertWord.free()
    findWordId.free()
    insertMembership.free()
    updateBookCount.free()
    console.error('PDF 词书迁移失败:', error)
    throw error
  }
}
