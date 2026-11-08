import type { DbWrapper } from '../wrapper'

export interface LiteratureItemInput {
  title: string
  authors?: string
  year?: string
  source?: string
  sourceUrl?: string
  doi?: string
  abstract?: string
  contentText?: string
  filePath?: string
  fileType?: string
  metadata?: Record<string, unknown>
}

export interface LiteratureAnnotationInput {
  itemId: number
  annotationType?: 'highlight' | 'underline' | 'note' | 'text' | 'drawing'
  pageNumber?: number
  quote?: string
  note?: string
  color?: string
  geometry?: unknown
}

export class LiteratureRepository {
  constructor(private db: DbWrapper) {}

  list(): unknown[] {
    return this.db.prepare(
      'SELECT * FROM literature_items ORDER BY datetime(created_at) DESC, id DESC'
    ).all()
  }

  get(id: number): unknown {
    return this.db.prepare('SELECT * FROM literature_items WHERE id = ?').get(id)
  }

  create(input: LiteratureItemInput): any {
    const result = this.db.prepare(
      `INSERT INTO literature_items
       (title, authors, year, source, source_url, doi, abstract, content_text,
        file_path, file_type, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.title.trim().slice(0, 500) || '未命名文献',
      input.authors?.trim().slice(0, 1000) || '',
      input.year?.trim().slice(0, 20) || '',
      input.source?.trim().slice(0, 300) || '',
      input.sourceUrl?.trim().slice(0, 3000) || '',
      input.doi?.trim().slice(0, 300) || '',
      input.abstract?.trim().slice(0, 100000) || '',
      input.contentText?.trim().slice(0, 500000) || '',
      input.filePath?.trim().slice(0, 3000) || '',
      input.fileType?.trim().slice(0, 30) || 'web',
      JSON.stringify(input.metadata ?? {})
    )
    return this.get(Number(result.lastInsertRowid))
  }

  remove(id: number): { success: boolean; item?: any } {
    const item = this.get(id) as any
    const result = this.db.prepare('DELETE FROM literature_items WHERE id = ?').run(id)
    return { success: result.changes > 0, item }
  }

  touch(id: number): void {
    this.db.prepare("UPDATE literature_items SET last_opened_at = datetime('now') WHERE id = ?").run(id)
  }

  updateFilePath(id: number, filePath: string): any {
    this.db.prepare('UPDATE literature_items SET file_path = ? WHERE id = ?').run(filePath, id)
    return this.get(id)
  }

  listAnnotations(itemId: number): unknown[] {
    return this.db.prepare(
      `SELECT * FROM literature_annotations
       WHERE item_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`
    ).all(itemId)
  }

  addAnnotation(input: LiteratureAnnotationInput): any {
    const result = this.db.prepare(
      `INSERT INTO literature_annotations
       (item_id, annotation_type, page_number, quote, note, color, geometry_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.itemId,
      input.annotationType ?? 'highlight',
      input.pageNumber ?? null,
      input.quote?.slice(0, 30000) ?? '',
      input.note?.slice(0, 30000) ?? '',
      input.color ?? 'yellow',
      input.geometry ? JSON.stringify(input.geometry) : null
    )
    return this.db.prepare('SELECT * FROM literature_annotations WHERE id = ?').get(result.lastInsertRowid)
  }

  updateAnnotationGeometry(id: number, geometry: any): any {
    this.db.prepare('UPDATE literature_annotations SET geometry_json = ? WHERE id = ?').run(JSON.stringify(geometry), id)
    return this.db.prepare('SELECT * FROM literature_annotations WHERE id = ?').get(id)
  }

  deleteAnnotation(id: number): { success: boolean } {
    const result = this.db.prepare('DELETE FROM literature_annotations WHERE id = ?').run(id)
    return { success: result.changes > 0 }
  }
}
