import type { DbWrapper } from '../wrapper'

export interface ExamPaper {
  id: number
  title: string
  year: number | null
  season: string | null
  source: string | null
  imported_at: string
}

export interface ExamQuestion {
  id: number
  paper_id: number
  section_type: string
  question_order: number
  passage: string | null
  question_text: string
  options_json: string | null
  answer: string | null
  explanation: string | null
}

export interface ImportPaperData {
  title: string
  year?: number
  season?: string
  source?: string
  questions: ImportQuestionData[]
}

export interface ImportQuestionData {
  section_type: string
  question_order?: number
  passage?: string
  question_text: string
  options?: string[] | Record<string, string>
  answer?: string
  explanation?: string
}

export class ExamRepository {
  constructor(private db: DbWrapper) {}

  // 导入试卷
  importPaper(data: ImportPaperData): { paperId: number; questionCount: number } {
    const insertPaper = this.db.prepare(
      `INSERT INTO exam_papers (title, year, season, source) VALUES (?, ?, ?, ?)`
    )
    const result = insertPaper.run(data.title, data.year ?? null, data.season ?? null, data.source ?? null)
    const paperId = result.lastInsertRowid

    const insertQ = this.db.prepare(
      `INSERT INTO exam_questions (paper_id, section_type, question_order, passage, question_text, options_json, answer, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i]
      const optionsStr = q.options ? JSON.stringify(q.options) : null
      insertQ.run(
        paperId,
        q.section_type,
        q.question_order ?? i + 1,
        q.passage ?? null,
        q.question_text,
        optionsStr,
        q.answer ?? null,
        q.explanation ?? null
      )
    }

    return { paperId, questionCount: data.questions.length }
  }

  // 获取所有试卷
  getAllPapers(): ExamPaper[] {
    const stmt = this.db.prepare(`SELECT * FROM exam_papers ORDER BY year DESC, imported_at DESC`)
    return stmt.all() as ExamPaper[]
  }

  // 获取试卷详情
  getPaperById(id: number): ExamPaper | undefined {
    const stmt = this.db.prepare(`SELECT * FROM exam_papers WHERE id = ?`)
    return stmt.get(id) as ExamPaper | undefined
  }

  // 获取试卷的题目（按模块）
  getQuestionsByPaper(paperId: number, sectionType?: string): ExamQuestion[] {
    if (sectionType) {
      const stmt = this.db.prepare(
        `SELECT * FROM exam_questions WHERE paper_id = ? AND section_type = ? ORDER BY question_order`
      )
      return stmt.all(paperId, sectionType) as ExamQuestion[]
    }
    const stmt = this.db.prepare(
      `SELECT * FROM exam_questions WHERE paper_id = ? ORDER BY section_type, question_order`
    )
    return stmt.all(paperId) as ExamQuestion[]
  }

  // 按模块获取所有题目（跨试卷）
  getQuestionsBySection(sectionType: string, limit: number = 50): ExamQuestion[] {
    const stmt = this.db.prepare(
      `SELECT eq.*, ep.title as paper_title
       FROM exam_questions eq
       JOIN exam_papers ep ON eq.paper_id = ep.id
       WHERE eq.section_type = ?
       ORDER BY RANDOM()
       LIMIT ?`
    )
    return stmt.all(sectionType, limit) as ExamQuestion[]
  }

  // 获取试卷的模块统计
  getPaperStats(paperId: number): { section_type: string; count: number }[] {
    const stmt = this.db.prepare(
      `SELECT section_type, COUNT(*) as count FROM exam_questions WHERE paper_id = ? GROUP BY section_type`
    )
    return stmt.all(paperId) as { section_type: string; count: number }[]
  }

  // 删除试卷
  deletePaper(id: number): void {
    this.db.prepare(`DELETE FROM exam_questions WHERE paper_id = ?`).run(id)
    this.db.prepare(`DELETE FROM exam_papers WHERE id = ?`).run(id)
  }

  // 获取各模块题目数量
  getSectionCounts(): { section_type: string; count: number }[] {
    const stmt = this.db.prepare(
      `SELECT section_type, COUNT(*) as count FROM exam_questions GROUP BY section_type`
    )
    return stmt.all() as { section_type: string; count: number }[]
  }

  // 获取题目总数
  getQuestionCount(sectionType?: string): number {
    if (sectionType) {
      const stmt = this.db.prepare(`SELECT COUNT(*) as c FROM exam_questions WHERE section_type = ?`)
      const row = stmt.get(sectionType) as { c: number }
      return row.c
    }
    const stmt = this.db.prepare(`SELECT COUNT(*) as c FROM exam_questions`)
    const row = stmt.get() as { c: number }
    return row.c
  }

  // 保存真题错题
  saveWrongAnswers(paperId: number, wrongs: {
    questionId: number; sectionType: string; userAnswer: string; correctAnswer: string
  }[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO exam_wrong_answers (question_id, paper_id, section_type, user_answer, correct_answer)
       VALUES (?, ?, ?, ?, ?)`
    )
    for (const w of wrongs) {
      stmt.run(w.questionId, paperId, w.sectionType, w.userAnswer, w.correctAnswer)
    }
  }

  // 获取错题列表
  getWrongAnswers(filters?: { paperId?: number; sectionType?: string }): Array<{
    id: number; question_id: number; paper_id: number; section_type: string
    user_answer: string; correct_answer: string; created_at: string
    question_text: string; options_json: string | null; passage: string | null
    paper_title: string
  }> {
    let sql = `SELECT wa.*, eq.question_text, eq.options_json, eq.passage, ep.title as paper_title
               FROM exam_wrong_answers wa
               JOIN exam_questions eq ON wa.question_id = eq.id
               JOIN exam_papers ep ON wa.paper_id = ep.id`
    const conditions: string[] = []
    const params: unknown[] = []
    if (filters?.paperId) { conditions.push('wa.paper_id = ?'); params.push(filters.paperId) }
    if (filters?.sectionType) { conditions.push('wa.section_type = ?'); params.push(filters.sectionType) }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY wa.created_at DESC'
    return this.db.prepare(sql).all(...params) as any[]
  }

  // 获取错题数量
  getWrongAnswerCount(filters?: { paperId?: number; sectionType?: string }): number {
    let sql = 'SELECT COUNT(*) as c FROM exam_wrong_answers'
    const conditions: string[] = []
    const params: unknown[] = []
    if (filters?.paperId) { conditions.push('paper_id = ?'); params.push(filters.paperId) }
    if (filters?.sectionType) { conditions.push('section_type = ?'); params.push(filters.sectionType) }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    const row = this.db.prepare(sql).get(...params) as { c: number }
    return row.c
  }

  // 删除错题记录
  deleteWrongAnswer(id: number): void {
    this.db.prepare('DELETE FROM exam_wrong_answers WHERE id = ?').run(id)
  }

  // 保存听力音频
  saveAudio(paperId: number, filePath: string, fileName: string): void {
    this.db.prepare(
      `INSERT INTO exam_audio (paper_id, file_path, file_name) VALUES (?, ?, ?)`
    ).run(paperId, filePath, fileName)
  }

  // 获取试卷的音频
  getAudio(paperId: number): { id: number; paper_id: number; section_type: string; file_path: string; file_name: string }[] {
    return this.db.prepare(
      'SELECT * FROM exam_audio WHERE paper_id = ? ORDER BY section_type'
    ).all(paperId) as any[]
  }

  // 删除音频
  deleteAudio(id: number): void {
    this.db.prepare('DELETE FROM exam_audio WHERE id = ?').run(id)
  }

  // 添加生词
  addVocabWord(word: { wordId?: number; wordText: string; meaningCn?: string; phoneticUs?: string; source?: string; context?: string }): void {
    this.db.prepare(
      `INSERT INTO vocabulary_notebook (word_id, word_text, meaning_cn, phonetic_us, source, context)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(word.wordId ?? null, word.wordText, word.meaningCn ?? null, word.phoneticUs ?? null, word.source ?? null, word.context ?? null)
  }

  // 获取生词本
  getVocabWords(): { id: number; word_id: number | null; word_text: string; meaning_cn: string | null; phonetic_us: string | null; source: string | null; context: string | null; created_at: string }[] {
    return this.db.prepare(
      'SELECT * FROM vocabulary_notebook ORDER BY created_at DESC'
    ).all() as any[]
  }

  // 删除生词
  deleteVocabWord(id: number): void {
    this.db.prepare('DELETE FROM vocabulary_notebook WHERE id = ?').run(id)
  }

  // 获取生词数量
  getVocabWordCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as c FROM vocabulary_notebook').get() as { c: number }
    return row.c
  }
}
