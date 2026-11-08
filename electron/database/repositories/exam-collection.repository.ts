import type { DbWrapper } from '../wrapper'
import type { ExamPaperType, ExamSeason } from '../../lib/exam-import'
import type { SegmentContentType, SegmentStatus, SemanticMetadata } from '../../lib/exam-semantic-parser'

export interface CollectionRecord {
  id: number
  collection_key: string
  exam_type: ExamPaperType
  year: number | null
  session: ExamSeason
  title: string
  status: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CollectionPaperRecord {
  id: number
  collection_id: number
  paper_no: number
  title: string
  status: string
  created_at: string
  updated_at: string
}

export interface CollectionAudioRecord {
  id: number
  collection_id: number
  audio_slot: 'A' | 'B'
  label: string | null
  source_file_path: string
  managed_file_path: string | null
  file_name: string
  file_hash: string
  file_size: number
  mime_type: string | null
  duration_seconds: number | null
  status: string
  imported_at: string
  updated_at: string
}

export interface CollectionAnalysisRecord {
  id: number
  collection_id: number
  paper_id: number | null
  audio_slot: 'A' | 'B' | null
  title: string
  source_file_path: string
  source_file_hash: string
  file_name: string | null
  status: string
  imported_at: string
  updated_at: string
}

export interface PendingAnalysisRecord {
  id: number
  source_file_path: string
  source_file_hash: string
  file_name: string
  exam_type: ExamPaperType
  year: number | null
  session: ExamSeason
  set_no: number | null
  file_size: number
  page_count: number
  segment_count: number
  payload: any
  reason: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface ContentSegmentRecord {
  id: number
  collection_id: number
  paper_id: number | null
  analysis_id: number | null
  audio_slot: 'A' | 'B' | null
  source_file_path: string
  source_file_hash: string
  page_no: number
  range_info: any
  content_type: SegmentContentType
  text_excerpt: string | null
  segment_order: number
  confidence: number
  status: SegmentStatus
  manual_override: number
  created_at: string
  updated_at: string
}

export interface CollectionSummary extends CollectionRecord {
  papers: CollectionPaperRecord[]
  audio: CollectionAudioRecord[]
  analyses: CollectionAnalysisRecord[]
  segmentCount: number
  pendingCount: number
}

export interface CollectionDetail extends CollectionSummary {
  segments: ContentSegmentRecord[]
  sourceFiles: Array<{ path: string; hash: string; fileName: string }>
}

export interface InsertSegmentInput {
  collectionId: number
  paperId: number | null
  analysisId: number | null
  audioSlot: 'A' | 'B' | null
  sourceFilePath: string
  sourceFileHash: string
  pageNo: number
  rangeInfo: unknown
  contentType: SegmentContentType
  textExcerpt: string
  segmentOrder: number
  confidence: number
  status: SegmentStatus
  manualOverride?: boolean
}

function parseRangeInfo(value: unknown): any {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(String(value)) } catch { return {} }
}

export class ExamCollectionRepository {
  constructor(private db: DbWrapper) {}

  private mapSegment(row: any): ContentSegmentRecord {
    return { ...row, range_info: parseRangeInfo(row.range_info), manual_override: Number(row.manual_override || 0) }
  }

  listCollections(): CollectionSummary[] {
    const collections = this.db.prepare('SELECT * FROM exam_collection ORDER BY sort_order ASC, updated_at DESC, id DESC').all() as CollectionRecord[]
    const papers = this.db.prepare('SELECT * FROM collection_paper ORDER BY collection_id, paper_no').all() as CollectionPaperRecord[]
    const audio = this.db.prepare('SELECT * FROM collection_audio ORDER BY collection_id, audio_slot').all() as CollectionAudioRecord[]
    const analyses = this.db.prepare('SELECT * FROM collection_analysis ORDER BY collection_id, id').all() as CollectionAnalysisRecord[]
    const counts = this.db.prepare(
      `SELECT collection_id,
        COUNT(*) AS segment_count,
        SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending_count
       FROM content_segment GROUP BY collection_id`
    ).all() as Array<{ collection_id: number; segment_count: number; pending_count: number }>
    const countMap = new Map(counts.map(row => [Number(row.collection_id), row]))
    return collections.map(collection => ({
      ...collection,
      papers: papers.filter(paper => paper.collection_id === collection.id),
      audio: audio.filter(item => item.collection_id === collection.id),
      analyses: analyses.filter(item => item.collection_id === collection.id),
      segmentCount: Number(countMap.get(collection.id)?.segment_count || 0),
      pendingCount: Number(countMap.get(collection.id)?.pending_count || 0)
    }))
  }

  getCollection(id: number): CollectionDetail | null {
    const collection = this.db.prepare('SELECT * FROM exam_collection WHERE id = ?').get(id) as CollectionRecord | undefined
    if (!collection) return null
    const papers = this.db.prepare('SELECT * FROM collection_paper WHERE collection_id = ? ORDER BY paper_no').all(id) as CollectionPaperRecord[]
    const audio = this.db.prepare('SELECT * FROM collection_audio WHERE collection_id = ? ORDER BY audio_slot').all(id) as CollectionAudioRecord[]
    const analyses = this.db.prepare('SELECT * FROM collection_analysis WHERE collection_id = ? ORDER BY paper_id, audio_slot, id').all(id) as CollectionAnalysisRecord[]
    const segments = (this.db.prepare('SELECT * FROM content_segment WHERE collection_id = ? ORDER BY page_no, segment_order, id').all(id) as any[]).map(row => this.mapSegment(row))
    const pendingCount = segments.filter(segment => segment.status === 'pending_review').length
    const sourceMap = new Map<string, { path: string; hash: string; fileName: string }>()
    for (const segment of segments) {
      sourceMap.set(segment.source_file_path, {
        path: segment.source_file_path,
        hash: segment.source_file_hash,
        fileName: segment.source_file_path.split(/[/\\]/).pop() || segment.source_file_path
      })
    }
    for (const analysis of analyses) {
      sourceMap.set(analysis.source_file_path, {
        path: analysis.source_file_path,
        hash: analysis.source_file_hash,
        fileName: analysis.file_name || analysis.source_file_path.split(/[/\\]/).pop() || analysis.source_file_path
      })
    }
    return { ...collection, papers, audio, analyses, segments, pendingCount, segmentCount: segments.length, sourceFiles: [...sourceMap.values()] }
  }

  findByKey(collectionKey: string): CollectionRecord | undefined {
    return this.db.prepare('SELECT * FROM exam_collection WHERE collection_key = ?').get(collectionKey) as CollectionRecord | undefined
  }

  findById(id: number): CollectionRecord | undefined {
    return this.db.prepare('SELECT * FROM exam_collection WHERE id = ?').get(id) as CollectionRecord | undefined
  }

  createCollection(input: { collectionKey: string; examType: ExamPaperType; year: number | null; session: ExamSeason; title: string; status?: string }): CollectionRecord {
    const nextOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM exam_collection').get() as { next_order: number }
    const result = this.db.prepare(
      `INSERT INTO exam_collection (collection_key, exam_type, year, session, title, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(input.collectionKey, input.examType, input.year, input.session, input.title, input.status || 'review_required', Number(nextOrder?.next_order) || 1)
    return this.findById(result.lastInsertRowid)!
  }

  updateCollection(id: number, input: { collectionKey?: string; examType?: ExamPaperType; year?: number | null; session?: ExamSeason; title?: string; status?: string }): CollectionRecord {
    const current = this.findById(id)
    if (!current) throw new Error('真题合集不存在')
    this.db.prepare(
      `UPDATE exam_collection SET collection_key = ?, exam_type = ?, year = ?, session = ?, title = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      input.collectionKey ?? current.collection_key,
      input.examType ?? current.exam_type,
      input.year === undefined ? current.year : input.year,
      input.session ?? current.session,
      input.title ?? current.title,
      input.status ?? current.status,
      id
    )
    return this.findById(id)!
  }

  updateCollectionOrder(collectionIds: number[]): void {
    const validIds = [...new Set(collectionIds.map(Number).filter(id => Number.isInteger(id) && id > 0))]
    const update = this.db.prepare('UPDATE exam_collection SET sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?')
    validIds.forEach((id, index) => update.run(index + 1, id))
  }

  ensurePaper(collectionId: number, paperNo: number, title?: string): CollectionPaperRecord {
    const normalizedNo = Math.max(1, Math.min(3, Number(paperNo) || 1))
    const existing = this.db.prepare('SELECT * FROM collection_paper WHERE collection_id = ? AND paper_no = ?').get(collectionId, normalizedNo) as CollectionPaperRecord | undefined
    if (existing) return existing
    const result = this.db.prepare(
      `INSERT INTO collection_paper (collection_id, paper_no, title, status) VALUES (?, ?, ?, 'review_required')`
    ).run(collectionId, normalizedNo, title || `卷${normalizedNo}`)
    return this.db.prepare('SELECT * FROM collection_paper WHERE id = ?').get(result.lastInsertRowid) as CollectionPaperRecord
  }

  ensureAnalysis(input: {
    collectionId: number
    paperId: number | null
    audioSlot: 'A' | 'B' | null
    title: string
    sourceFilePath: string
    sourceFileHash: string
    fileName: string
    status?: string
  }): CollectionAnalysisRecord {
    const existing = this.db.prepare(
      `SELECT * FROM collection_analysis
       WHERE collection_id = ? AND source_file_hash = ?
         AND paper_id IS ? AND audio_slot IS ?
       LIMIT 1`
    ).get(input.collectionId, input.sourceFileHash, input.paperId, input.audioSlot) as CollectionAnalysisRecord | undefined
    if (existing) return existing
    const result = this.db.prepare(
      `INSERT INTO collection_analysis
       (collection_id, paper_id, audio_slot, title, source_file_path, source_file_hash, file_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(input.collectionId, input.paperId, input.audioSlot, input.title, input.sourceFilePath, input.sourceFileHash, input.fileName, input.status || 'review_required')
    return this.db.prepare('SELECT * FROM collection_analysis WHERE id = ?').get(result.lastInsertRowid) as CollectionAnalysisRecord
  }

  getPaper(collectionId: number, paperNo: number): CollectionPaperRecord | undefined {
    return this.db.prepare('SELECT * FROM collection_paper WHERE collection_id = ? AND paper_no = ?').get(collectionId, paperNo) as CollectionPaperRecord | undefined
  }

  private mapPendingAnalysis(row: any): PendingAnalysisRecord | null {
    if (!row?.id) return null
    let payload: any = null
    try { payload = JSON.parse(String(row.payload_json)) } catch {}
    const { payload_json, ...rest } = row
    return { ...rest, payload }
  }

  listPendingAnalyses(): PendingAnalysisRecord[] {
    const rows = this.db.prepare("SELECT * FROM pending_analysis_import WHERE status = 'pending' ORDER BY updated_at DESC, id DESC").all() as any[]
    return rows.map(row => this.mapPendingAnalysis(row)).filter(Boolean) as PendingAnalysisRecord[]
  }

  findPendingAnalysisByHash(hash: string): PendingAnalysisRecord | null {
    const row = this.db.prepare("SELECT * FROM pending_analysis_import WHERE source_file_hash = ? AND status = 'pending' LIMIT 1").get(hash)
    return this.mapPendingAnalysis(row)
  }

  getPendingAnalysis(id: number): PendingAnalysisRecord | null {
    return this.mapPendingAnalysis(this.db.prepare('SELECT * FROM pending_analysis_import WHERE id = ?').get(id))
  }

  createPendingAnalysis(input: {
    sourceFilePath: string
    sourceFileHash: string
    fileName: string
    examType: ExamPaperType
    year: number | null
    session: ExamSeason
    setNo: number | null
    fileSize: number
    pageCount: number
    segmentCount: number
    payload: unknown
    reason: string
  }): PendingAnalysisRecord {
    this.db.prepare(
      `INSERT INTO pending_analysis_import
       (source_file_path, source_file_hash, file_name, exam_type, year, session, set_no,
        file_size, page_count, segment_count, payload_json, reason, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
       ON CONFLICT(source_file_hash) DO UPDATE SET
         source_file_path = excluded.source_file_path, file_name = excluded.file_name,
         exam_type = excluded.exam_type, year = excluded.year, session = excluded.session,
         set_no = excluded.set_no, file_size = excluded.file_size, page_count = excluded.page_count,
         segment_count = excluded.segment_count, payload_json = excluded.payload_json,
         reason = excluded.reason, status = 'pending', updated_at = datetime('now')`
    ).run(
      input.sourceFilePath, input.sourceFileHash, input.fileName, input.examType, input.year,
      input.session, input.setNo, input.fileSize, input.pageCount, input.segmentCount,
      JSON.stringify(input.payload), input.reason
    )
    return this.findPendingAnalysisByHash(input.sourceFileHash)!
  }

  markPendingAnalysisBound(id: number): void {
    this.db.prepare("UPDATE pending_analysis_import SET status = 'bound', updated_at = datetime('now') WHERE id = ?").run(id)
  }

  deletePendingAnalysis(id: number): void {
    this.db.prepare("DELETE FROM pending_analysis_import WHERE id = ?").run(id)
  }

  findAudioByHash(hash: string): CollectionAudioRecord | undefined {
    return this.db.prepare('SELECT * FROM collection_audio WHERE file_hash = ? LIMIT 1').get(hash) as CollectionAudioRecord | undefined
  }

  getAudio(collectionId: number, slot: 'A' | 'B'): CollectionAudioRecord | undefined {
    return this.db.prepare('SELECT * FROM collection_audio WHERE collection_id = ? AND audio_slot = ?').get(collectionId, slot) as CollectionAudioRecord | undefined
  }

  upsertAudio(input: {
    collectionId: number
    slot: 'A' | 'B'
    label: string
    sourceFilePath: string
    managedFilePath: string | null
    fileName: string
    fileHash: string
    fileSize: number
    mimeType: string
    durationSeconds?: number | null
  }): CollectionAudioRecord {
    this.db.prepare(
      `INSERT INTO collection_audio
       (collection_id, audio_slot, label, source_file_path, managed_file_path, file_name,
        file_hash, file_size, mime_type, duration_seconds, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', datetime('now'))
       ON CONFLICT(collection_id, audio_slot) DO UPDATE SET
         label = excluded.label, source_file_path = excluded.source_file_path,
         managed_file_path = excluded.managed_file_path, file_name = excluded.file_name,
         file_hash = excluded.file_hash, file_size = excluded.file_size,
         mime_type = excluded.mime_type, duration_seconds = excluded.duration_seconds,
         status = 'available', updated_at = datetime('now')`
    ).run(input.collectionId, input.slot, input.label, input.sourceFilePath, input.managedFilePath, input.fileName, input.fileHash, input.fileSize, input.mimeType, input.durationSeconds ?? null)
    return this.getAudio(input.collectionId, input.slot)!
  }

  fileHashExists(hash: string): boolean {
    if (this.db.prepare('SELECT 1 AS hit FROM content_segment WHERE source_file_hash = ? LIMIT 1').get(hash)) return true
    if (this.db.prepare('SELECT 1 AS hit FROM collection_analysis WHERE source_file_hash = ? LIMIT 1').get(hash)) return true
    if (this.db.prepare("SELECT 1 AS hit FROM pending_analysis_import WHERE source_file_hash = ? AND status = 'pending' LIMIT 1").get(hash)) return true
    return Boolean(this.db.prepare('SELECT 1 AS hit FROM collection_audio WHERE file_hash = ? LIMIT 1').get(hash))
  }

  insertSegment(input: InsertSegmentInput): ContentSegmentRecord {
    const rangeJson = typeof input.rangeInfo === 'string' ? input.rangeInfo : JSON.stringify(input.rangeInfo)
    const result = this.db.prepare(
      `INSERT OR IGNORE INTO content_segment
       (collection_id, paper_id, analysis_id, audio_slot, source_file_path, source_file_hash,
        page_no, range_info, content_type, text_excerpt, segment_order, confidence,
        status, manual_override, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(input.collectionId, input.paperId, input.analysisId, input.audioSlot, input.sourceFilePath, input.sourceFileHash, input.pageNo, rangeJson, input.contentType, String(input.textExcerpt || '').slice(0, 50000), input.segmentOrder, input.confidence, input.status, input.manualOverride ? 1 : 0)
    const row = this.db.prepare(
      `SELECT * FROM content_segment WHERE id = ? OR (
        source_file_hash = ? AND page_no = ? AND content_type = ? AND range_info = ?
      ) ORDER BY id DESC LIMIT 1`
    ).get(result.lastInsertRowid, input.sourceFileHash, input.pageNo, input.contentType, rangeJson)
    return this.mapSegment(row)
  }

  insertSegments(inputs: InsertSegmentInput[]): ContentSegmentRecord[] {
    const run = this.db.transaction((items: unknown) => (items as InsertSegmentInput[]).map(input => this.insertSegment(input)))
    return run(inputs) as ContentSegmentRecord[]
  }

  updateSegment(id: number, input: {
    paperId?: number | null
    analysisId?: number | null
    audioSlot?: 'A' | 'B' | null
    contentType?: SegmentContentType
    textExcerpt?: string
    confidence?: number
    status?: SegmentStatus
    manualOverride?: boolean
  }): ContentSegmentRecord {
    const current = this.mapSegment(this.db.prepare('SELECT * FROM content_segment WHERE id = ?').get(id))
    if (!current?.id) throw new Error('内容片段不存在')
    this.db.prepare(
      `UPDATE content_segment SET paper_id = ?, analysis_id = ?, audio_slot = ?, content_type = ?,
       text_excerpt = ?, confidence = ?, status = ?, manual_override = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      input.paperId === undefined ? current.paper_id : input.paperId,
      input.analysisId === undefined ? current.analysis_id : input.analysisId,
      input.audioSlot === undefined ? current.audio_slot : input.audioSlot,
      input.contentType ?? current.content_type,
      input.textExcerpt === undefined ? current.text_excerpt : input.textExcerpt,
      input.confidence === undefined ? current.confidence : input.confidence,
      input.status ?? current.status,
      input.manualOverride === undefined ? current.manual_override : input.manualOverride ? 1 : 0,
      id
    )
    return this.mapSegment(this.db.prepare('SELECT * FROM content_segment WHERE id = ?').get(id))
  }

  deleteSegment(id: number): void {
    this.db.prepare('DELETE FROM content_segment WHERE id = ?').run(id)
  }

  recalculateStatus(collectionId: number): CollectionRecord {
    const collection = this.findById(collectionId)
    if (!collection) throw new Error('真题合集不存在')
    const pending = this.db.prepare("SELECT COUNT(*) AS c FROM content_segment WHERE collection_id = ? AND status = 'pending_review'").get(collectionId) as { c: number }
    const papers = this.db.prepare('SELECT COUNT(*) AS c FROM collection_paper WHERE collection_id = ?').get(collectionId) as { c: number }
    const paperSegments = this.db.prepare(
      "SELECT COUNT(*) AS c FROM content_segment WHERE collection_id = ? AND content_type = 'paper' AND status IN ('auto_confirmed','confirmed')"
    ).get(collectionId) as { c: number }
    let status = 'partial'
    if (Number(pending.c) > 0) status = 'review_required'
    else if (Number(papers.c) > 0 && Number(paperSegments.c) > 0) status = 'ready'
    this.db.prepare("UPDATE exam_collection SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, collectionId)
    return this.findById(collectionId)!
  }

  markPaperReady(collectionId: number, paperNo: number): void {
    this.db.prepare("UPDATE collection_paper SET status = 'ready', updated_at = datetime('now') WHERE collection_id = ? AND paper_no = ?").run(collectionId, paperNo)
  }

  markAudioMissing(collectionId: number, slot: 'A' | 'B'): void {
    this.db.prepare("UPDATE collection_audio SET status = 'missing', updated_at = datetime('now') WHERE collection_id = ? AND audio_slot = ?").run(collectionId, slot)
  }

  deleteAudio(collectionId: number, slot: 'A' | 'B'): void {
    this.db.prepare('DELETE FROM collection_audio WHERE collection_id = ? AND audio_slot = ?').run(collectionId, slot)
  }

  deleteCollection(id: number): void {
    this.db.prepare('DELETE FROM content_segment WHERE collection_id = ?').run(id)
    this.db.prepare('DELETE FROM collection_analysis WHERE collection_id = ?').run(id)
    this.db.prepare('DELETE FROM collection_audio WHERE collection_id = ?').run(id)
    this.db.prepare('DELETE FROM collection_paper WHERE collection_id = ?').run(id)
    this.db.prepare('DELETE FROM exam_collection WHERE id = ?').run(id)
  }

  findCollectionIdByFileHash(hash: string): number | null {
    const segment = this.db.prepare('SELECT collection_id FROM content_segment WHERE source_file_hash = ? LIMIT 1').get(hash) as { collection_id: number } | undefined
    if (segment) return Number(segment.collection_id)
    const analysis = this.db.prepare('SELECT collection_id FROM collection_analysis WHERE source_file_hash = ? LIMIT 1').get(hash) as { collection_id: number } | undefined
    return analysis ? Number(analysis.collection_id) : null
  }

  mergeCollections(sourceId: number, targetId: number): void {
    if (sourceId === targetId) return
    const sourcePapers = this.db.prepare('SELECT * FROM collection_paper WHERE collection_id = ? ORDER BY paper_no').all(sourceId) as CollectionPaperRecord[]
    const paperMap = new Map<number, number>()
    for (const paper of sourcePapers) {
      const target = this.ensurePaper(targetId, paper.paper_no, paper.title)
      paperMap.set(paper.id, target.id)
      this.db.prepare('UPDATE content_segment SET paper_id = ? WHERE paper_id = ?').run(target.id, paper.id)
      this.db.prepare('UPDATE collection_analysis SET paper_id = ? WHERE paper_id = ?').run(target.id, paper.id)
    }
    this.db.prepare('UPDATE content_segment SET collection_id = ? WHERE collection_id = ?').run(targetId, sourceId)
    this.db.prepare('UPDATE collection_analysis SET collection_id = ? WHERE collection_id = ?').run(targetId, sourceId)
    const sourceAudio = this.db.prepare('SELECT * FROM collection_audio WHERE collection_id = ?').all(sourceId) as CollectionAudioRecord[]
    for (const audio of sourceAudio) {
      const occupied = this.getAudio(targetId, audio.audio_slot)
      if (occupied) this.db.prepare('DELETE FROM collection_audio WHERE id = ?').run(audio.id)
      else this.db.prepare('UPDATE collection_audio SET collection_id = ? WHERE id = ?').run(targetId, audio.id)
    }
    this.db.prepare('DELETE FROM collection_paper WHERE collection_id = ?').run(sourceId)
    this.db.prepare('DELETE FROM exam_collection WHERE id = ?').run(sourceId)
    this.recalculateStatus(targetId)
  }
}
