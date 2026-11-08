import type { DbWrapper } from '../wrapper'
import type { ExamPaperType, ExamSeason } from '../../lib/exam-import'
import { fingerprintResources, resourceStatus, type ExamResourceRole } from '../../lib/exam-resource-import'

export interface ExamPaperResourceRecord {
  id: number
  paper_id: number
  role: ExamResourceRole
  file_name: string
  file_path: string
  file_hash: string
  file_size: number
  mime_type: string | null
  page_count: number | null
  duration_seconds: number | null
  extracted_text: string | null
  created_at: string
  updated_at: string
}

export interface ExamSetRecord {
  id: number
  title: string
  paper_name: string | null
  year: number | null
  season: ExamSeason | null
  paper_type: ExamPaperType | null
  set_no: number | null
  variant: string | null
  resource_status: string
  resource_fingerprint: string | null
  import_batch_id: number | null
  reader_mode: string | null
  last_position_json: string | null
  source: string | null
  remark: string | null
  imported_at: string
  updated_at: string | null
  last_opened_at: string | null
  resources: Record<ExamResourceRole, ExamPaperResourceRecord | null>
}

export interface CreateExamSetInput {
  title: string
  paperType: ExamPaperType
  year: number | null
  season: ExamSeason
  setNo: number | null
  variant?: string
  remark?: string
  importBatchId?: number | null
}

export interface UpsertExamResourceInput {
  role: ExamResourceRole
  fileName: string
  filePath: string
  fileHash: string
  fileSize: number
  mimeType: string
  pageCount?: number | null
  durationSeconds?: number | null
  extractedText?: string | null
}

export class ExamResourceRepository {
  constructor(private db: DbWrapper) {}

  private resourceRows(paperId?: number): ExamPaperResourceRecord[] {
    const columns = `id, paper_id, role, file_name, file_path, file_hash, file_size, mime_type,
      page_count, duration_seconds, NULL AS extracted_text, created_at, updated_at`
    if (paperId != null) {
      return this.db.prepare(
        `SELECT ${columns} FROM exam_paper_resources WHERE paper_id = ? ORDER BY role`
      ).all(paperId) as ExamPaperResourceRecord[]
    }
    return this.db.prepare(`SELECT ${columns} FROM exam_paper_resources ORDER BY paper_id, role`).all() as ExamPaperResourceRecord[]
  }

  private attachResources(paper: Omit<ExamSetRecord, 'resources'>): ExamSetRecord {
    const resources = { text: null, audio: null, analysis: null } as Record<ExamResourceRole, ExamPaperResourceRecord | null>
    for (const resource of this.resourceRows(paper.id)) resources[resource.role] = resource
    return { ...paper, resources }
  }

  listSets(): ExamSetRecord[] {
    const papers = this.db.prepare(
      `SELECT p.* FROM exam_papers p
       WHERE EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = p.id)
       ORDER BY
         CASE p.paper_type
           WHEN 'CET4' THEN 1 WHEN 'CET6' THEN 2 WHEN 'POSTGRAD' THEN 3
           WHEN 'IELTS' THEN 4 WHEN 'TOEFL' THEN 5 ELSE 9 END,
         CASE WHEN p.year IS NULL THEN 1 ELSE 0 END,
         p.year DESC,
         CASE WHEN p.season GLOB '[0-1][0-9]' THEN CAST(p.season AS INTEGER) ELSE -1 END DESC,
         p.set_no ASC,
         datetime(p.imported_at) DESC`
    ).all() as Array<Omit<ExamSetRecord, 'resources'>>
    return papers.map(paper => this.attachResources(paper))
  }

  getSet(id: number): ExamSetRecord | undefined {
    const paper = this.db.prepare('SELECT * FROM exam_papers WHERE id = ?').get(id) as Omit<ExamSetRecord, 'resources'> | undefined
    return paper ? this.attachResources(paper) : undefined
  }

  getResource(paperId: number, role: ExamResourceRole): ExamPaperResourceRecord | undefined {
    return this.db.prepare(
      'SELECT * FROM exam_paper_resources WHERE paper_id = ? AND role = ?'
    ).get(paperId, role) as ExamPaperResourceRecord | undefined
  }

  findByFingerprint(fingerprint: string): ExamSetRecord | undefined {
    if (!fingerprint) return undefined
    const paper = this.db.prepare(
      'SELECT * FROM exam_papers WHERE resource_fingerprint = ? LIMIT 1'
    ).get(fingerprint) as Omit<ExamSetRecord, 'resources'> | undefined
    return paper ? this.attachResources(paper) : undefined
  }

  createSet(input: CreateExamSetInput): ExamSetRecord {
    const title = String(input.title || '').trim().slice(0, 500) || '未命名真题'
    const result = this.db.prepare(
      `INSERT INTO exam_papers
       (title, paper_name, year, season, source, paper_type, set_no, variant,
        resource_status, remark, import_batch_id, reader_mode, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'single', datetime('now'), datetime('now'))`
    ).run(
      title,
      title,
      input.year,
      input.season,
      '本地真题资源',
      input.paperType,
      input.setNo,
      String(input.variant || '').trim() || null,
      'incomplete',
      String(input.remark || '').trim() || null,
      input.importBatchId ?? null
    )
    const paper = this.getSet(result.lastInsertRowid)
    if (!paper) throw new Error('真题资源集创建失败')
    return paper
  }

  upsertResource(paperId: number, input: UpsertExamResourceInput): void {
    this.db.prepare(
      `INSERT INTO exam_paper_resources
       (paper_id, role, file_name, file_path, file_hash, file_size, mime_type,
        page_count, duration_seconds, extracted_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(paper_id, role) DO UPDATE SET
         file_name = excluded.file_name,
         file_path = excluded.file_path,
         file_hash = excluded.file_hash,
         file_size = excluded.file_size,
         mime_type = excluded.mime_type,
         page_count = excluded.page_count,
         duration_seconds = excluded.duration_seconds,
         extracted_text = excluded.extracted_text,
         updated_at = datetime('now')`
    ).run(
      paperId,
      input.role,
      input.fileName,
      input.filePath,
      input.fileHash,
      input.fileSize,
      input.mimeType,
      input.pageCount ?? null,
      input.durationSeconds ?? null,
      input.extractedText ?? null
    )
  }

  removeResource(paperId: number, role: ExamResourceRole): void {
    this.db.prepare(
      'DELETE FROM exam_paper_resources WHERE paper_id = ? AND role = ?'
    ).run(paperId, role)
  }

  recalculate(paperId: number): ExamSetRecord | undefined {
    const resources = this.resourceRows(paperId)
    const fingerprint = fingerprintResources(resources.map(resource => ({ role: resource.role, fileHash: resource.file_hash })))
    const status = resourceStatus(resources.map(resource => resource.role))
    this.db.prepare(
      `UPDATE exam_papers
       SET resource_status = ?, resource_fingerprint = NULLIF(?, ''), updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, fingerprint, paperId)
    const text = resources.find(resource => resource.role === 'text')
    if (text) {
      this.db.prepare(
        `UPDATE exam_papers
         SET file_name = ?, file_path = ?, file_hash = ?, file_size = ?, page_count = ?
         WHERE id = ?`
      ).run(text.file_name, text.file_path, text.file_hash, text.file_size, text.page_count, paperId)
    }
    return this.getSet(paperId)
  }

  updateMetadata(id: number, input: {
    title?: string
    paperType?: ExamPaperType
    year?: number | null
    season?: ExamSeason
    setNo?: number | null
    variant?: string
    remark?: string
  }): ExamSetRecord {
    const current = this.getSet(id)
    if (!current) throw new Error('真题资源集不存在')
    const title = input.title === undefined ? current.title : String(input.title).trim().slice(0, 500) || current.title
    this.db.prepare(
      `UPDATE exam_papers
       SET title = ?, paper_name = ?, paper_type = ?, year = ?, season = ?, set_no = ?, variant = ?, remark = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title,
      title,
      input.paperType ?? current.paper_type ?? 'unknown',
      input.year === undefined ? current.year : input.year,
      input.season === undefined ? current.season ?? 'unknown' : input.season,
      input.setNo === undefined ? current.set_no : input.setNo,
      input.variant === undefined ? current.variant : String(input.variant || '').trim() || null,
      input.remark === undefined ? current.remark : input.remark,
      id
    )
    return this.getSet(id)!
  }

  updateReaderState(id: number, mode: 'single' | 'compare', position?: unknown): void {
    this.db.prepare(
      `UPDATE exam_papers
       SET reader_mode = ?, last_position_json = ?, last_opened_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(mode, position == null ? null : JSON.stringify(position), id)
  }

  deleteSet(id: number): void {
    this.db.prepare('DELETE FROM exam_paper_resources WHERE paper_id = ?').run(id)
    this.db.prepare('DELETE FROM exam_papers WHERE id = ?').run(id)
  }

  createBatch(rootPath: string, importMode: string, totalSets: number): number {
    const result = this.db.prepare(
      `INSERT INTO exam_import_batches (root_path, import_mode, total_sets)
       VALUES (?, ?, ?)`
    ).run(rootPath, importMode, totalSets)
    return result.lastInsertRowid
  }

  finishBatch(id: number, summary: { imported: number; skipped: number; failed: number; details?: unknown }): void {
    this.db.prepare(
      `UPDATE exam_import_batches
       SET imported_sets = ?, skipped_sets = ?, failed_sets = ?, summary_json = ?
       WHERE id = ?`
    ).run(summary.imported, summary.skipped, summary.failed, JSON.stringify(summary.details ?? {}), id)
  }

  getStats(): {
    total: number
    complete: number
    cet4: number
    cet6: number
    postgrad: number
    ielts: number
    toefl: number
    missingAudio: number
    missingAnalysis: number
  } {
    const row = this.db.prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN resource_status = 'complete' THEN 1 ELSE 0 END) AS complete,
        SUM(CASE WHEN paper_type = 'CET4' THEN 1 ELSE 0 END) AS cet4,
        SUM(CASE WHEN paper_type = 'CET6' THEN 1 ELSE 0 END) AS cet6,
        SUM(CASE WHEN paper_type = 'POSTGRAD' THEN 1 ELSE 0 END) AS postgrad,
        SUM(CASE WHEN paper_type = 'IELTS' THEN 1 ELSE 0 END) AS ielts,
        SUM(CASE WHEN paper_type = 'TOEFL' THEN 1 ELSE 0 END) AS toefl,
        SUM(CASE WHEN resource_status IN ('text_only','missing_audio') THEN 1 ELSE 0 END) AS missingAudio,
        SUM(CASE WHEN resource_status IN ('text_only','missing_analysis') THEN 1 ELSE 0 END) AS missingAnalysis
       FROM exam_papers
       WHERE EXISTS (SELECT 1 FROM exam_paper_resources r WHERE r.paper_id = exam_papers.id)`
    ).get() as Record<string, number>
    return {
      total: Number(row?.total || 0), complete: Number(row?.complete || 0),
      cet4: Number(row?.cet4 || 0), cet6: Number(row?.cet6 || 0),
      postgrad: Number(row?.postgrad || 0), ielts: Number(row?.ielts || 0),
      toefl: Number(row?.toefl || 0), missingAudio: Number(row?.missingAudio || 0),
      missingAnalysis: Number(row?.missingAnalysis || 0)
    }
  }
}
