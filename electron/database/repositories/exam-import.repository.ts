import type { DbWrapper } from '../wrapper'
import type { ExamDetectionSource, ExamPaperType, ExamSeason } from '../../lib/exam-import'

export interface ExamLibraryDocument {
  id: number
  title: string
  paper_name: string | null
  file_name: string | null
  file_path: string | null
  source_path: string | null
  file_hash: string | null
  file_size: number | null
  page_count: number | null
  year: number | null
  season: ExamSeason | null
  paper_type: ExamPaperType | null
  detection_source: ExamDetectionSource | null
  text_excerpt: string | null
  cover_path: string | null
  remark: string | null
  library_root: string | null
  last_opened_at: string | null
  imported_at: string
  updated_at: string | null
}

export interface InsertExamDocumentInput {
  title: string
  fileName: string
  filePath: string
  sourcePath: string
  fileHash: string
  fileSize: number
  pageCount: number
  year: number | null
  season: ExamSeason
  paperType: ExamPaperType
  detectionSource: ExamDetectionSource
  textExcerpt: string
  remark: string
  libraryRoot: string
}

export interface UpdateExamDocumentInput {
  title?: string
  year?: number | null
  season?: ExamSeason
  paperType?: ExamPaperType
  remark?: string
  filePath?: string
}

export class ExamImportRepository {
  constructor(private db: DbWrapper) {}

  listDocuments(): ExamLibraryDocument[] {
    return this.db.prepare(
      `SELECT * FROM exam_papers
       WHERE file_path IS NOT NULL AND file_path <> ''
       ORDER BY
         CASE WHEN year IS NULL THEN 1 ELSE 0 END,
         year DESC,
         CASE WHEN season GLOB '[0-1][0-9]' THEN CAST(season AS INTEGER) ELSE -1 END DESC,
         imported_at DESC`
    ).all() as ExamLibraryDocument[]
  }

  getDocumentById(id: number): ExamLibraryDocument | undefined {
    return this.db.prepare(
      `SELECT * FROM exam_papers WHERE id = ? AND file_path IS NOT NULL AND file_path <> ''`
    ).get(id) as ExamLibraryDocument | undefined
  }

  findByHash(hash: string): ExamLibraryDocument | undefined {
    return this.db.prepare(
      `SELECT * FROM exam_papers WHERE file_hash = ? LIMIT 1`
    ).get(hash) as ExamLibraryDocument | undefined
  }

  insertDocument(input: InsertExamDocumentInput): ExamLibraryDocument {
    const result = this.db.prepare(
      `INSERT INTO exam_papers (
         title, paper_name, year, season, source, paper_type,
         file_name, file_path, source_path, file_hash, file_size, page_count,
         detection_source, text_excerpt, remark, library_root, imported_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(
      input.title,
      input.title,
      input.year,
      input.season,
      '本地 PDF 导入',
      input.paperType,
      input.fileName,
      input.filePath,
      input.sourcePath,
      input.fileHash,
      input.fileSize,
      input.pageCount,
      input.detectionSource,
      input.textExcerpt,
      input.remark,
      input.libraryRoot
    )
    const document = this.getDocumentById(result.lastInsertRowid)
    if (!document) throw new Error('导入记录写入后无法读取')
    return document
  }

  updateDocument(id: number, input: UpdateExamDocumentInput): ExamLibraryDocument {
    const current = this.getDocumentById(id)
    if (!current) throw new Error('真题记录不存在')
    const title = input.title === undefined ? current.title : String(input.title).trim() || current.title
    const year = input.year === undefined ? current.year : input.year
    const season = input.season === undefined ? current.season : input.season
    const paperType = input.paperType === undefined ? current.paper_type : input.paperType
    const remark = input.remark === undefined ? current.remark : input.remark
    const filePath = input.filePath === undefined ? current.file_path : input.filePath
    this.db.prepare(
      `UPDATE exam_papers
       SET title = ?, paper_name = ?, year = ?, season = ?, paper_type = ?, remark = ?, file_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(title, title, year, season, paperType, remark, filePath, id)
    const updated = this.getDocumentById(id)
    if (!updated) throw new Error('真题记录更新后无法读取')
    return updated
  }

  updateDetection(id: number, input: {
    year: number | null
    season: ExamSeason
    paperType: ExamPaperType
    detectionSource: ExamDetectionSource
    textExcerpt: string
  }): ExamLibraryDocument {
    this.db.prepare(
      `UPDATE exam_papers
       SET year = ?, season = ?, paper_type = ?, detection_source = ?, text_excerpt = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(input.year, input.season, input.paperType, input.detectionSource, input.textExcerpt, id)
    const updated = this.getDocumentById(id)
    if (!updated) throw new Error('真题记录更新后无法读取')
    return updated
  }

  touchOpened(id: number): void {
    this.db.prepare(`UPDATE exam_papers SET last_opened_at = datetime('now') WHERE id = ?`).run(id)
  }

  deleteDocument(id: number): void {
    this.db.prepare('DELETE FROM exam_papers WHERE id = ?').run(id)
  }

  getStats(): {
    total: number
    cet4: number
    cet6: number
    unclassified: number
    totalBytes: number
  } {
    const row = this.db.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN paper_type = 'CET4' THEN 1 ELSE 0 END) AS cet4,
         SUM(CASE WHEN paper_type = 'CET6' THEN 1 ELSE 0 END) AS cet6,
         SUM(CASE WHEN year IS NULL THEN 1 ELSE 0 END) AS unclassified,
         SUM(COALESCE(file_size, 0)) AS totalBytes
       FROM exam_papers
       WHERE file_path IS NOT NULL AND file_path <> ''`
    ).get() as { total: number; cet4: number; cet6: number; unclassified: number; totalBytes: number }
    return {
      total: Number(row?.total || 0),
      cet4: Number(row?.cet4 || 0),
      cet6: Number(row?.cet6 || 0),
      unclassified: Number(row?.unclassified || 0),
      totalBytes: Number(row?.totalBytes || 0)
    }
  }
}
