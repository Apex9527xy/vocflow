/**
 * SQL schema for the mobile exam subsystem. Kept in lockstep with the desktop
 * schema in electron/database/connection.ts, but limited to the collection /
 * paper / segment / analysis / audio / pending / annotation tables the exam
 * flow actually uses. Vocabulary and reading tables live in the existing
 * localStorage-backed mobile bridge and are not duplicated here.
 */
export const EXAM_SCHEMA_SQL: string[] = [
  `
    CREATE TABLE IF NOT EXISTS exam_collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_key TEXT NOT NULL UNIQUE,
      exam_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (exam_type IN (
          'basic-primary', 'basic-junior', 'basic-senior',
          'CET4', 'CET6', 'POSTGRAD', 'IELTS', 'TOEFL', 'UNKNOWN', 'unknown'
        )),
      year INTEGER CHECK (year IS NULL OR year BETWEEN 2000 AND 2099),
      session TEXT NOT NULL DEFAULT 'unknown'
        CHECK (session IN ('01','02','03','04','05','06','07','08','09','10','11','12','unknown')),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('ready', 'partial', 'review_required', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_exam_collection_scope ON exam_collection(exam_type, year, session)',
  'CREATE INDEX IF NOT EXISTS idx_exam_collection_status ON exam_collection(status, updated_at DESC)',

  `
    CREATE TABLE IF NOT EXISTS collection_paper (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_no INTEGER NOT NULL CHECK (paper_no BETWEEN 1 AND 3),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('ready', 'partial', 'review_required')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (collection_id, paper_no)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_collection_paper_collection ON collection_paper(collection_id, paper_no)',

  `
    CREATE TABLE IF NOT EXISTS collection_audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      audio_slot TEXT NOT NULL CHECK (audio_slot IN ('A', 'B')),
      label TEXT,
      source_file_path TEXT NOT NULL,
      managed_file_path TEXT,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0 CHECK (file_size >= 0),
      mime_type TEXT,
      duration_seconds REAL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
      status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'missing', 'review_required')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (collection_id, audio_slot)
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_collection_audio_collection ON collection_audio(collection_id, audio_slot)',
  'CREATE INDEX IF NOT EXISTS idx_collection_audio_hash ON collection_audio(file_hash)',

  `
    CREATE TABLE IF NOT EXISTS collection_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_id INTEGER REFERENCES collection_paper(id) ON DELETE SET NULL,
      audio_slot TEXT CHECK (audio_slot IS NULL OR audio_slot IN ('A', 'B')),
      title TEXT NOT NULL,
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL,
      file_name TEXT,
      status TEXT NOT NULL DEFAULT 'review_required'
        CHECK (status IN ('pending_review', 'confirmed', 'rejected', 'missing')),
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_collection_analysis_collection ON collection_analysis(collection_id, paper_id, audio_slot)',
  'CREATE INDEX IF NOT EXISTS idx_collection_analysis_hash ON collection_analysis(source_file_hash)',

  `
    CREATE TABLE IF NOT EXISTS pending_analysis_import (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'unknown',
      year INTEGER,
      session TEXT NOT NULL DEFAULT 'unknown',
      set_no INTEGER,
      file_size INTEGER NOT NULL DEFAULT 0,
      page_count INTEGER NOT NULL DEFAULT 0,
      segment_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'bound', 'discarded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_pending_analysis_status ON pending_analysis_import(status, updated_at DESC)',

  `
    CREATE TABLE IF NOT EXISTS content_segment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER NOT NULL REFERENCES exam_collection(id) ON DELETE CASCADE,
      paper_id INTEGER REFERENCES collection_paper(id) ON DELETE SET NULL,
      analysis_id INTEGER REFERENCES collection_analysis(id) ON DELETE SET NULL,
      audio_slot TEXT CHECK (audio_slot IS NULL OR audio_slot IN ('A', 'B')),
      source_file_path TEXT NOT NULL,
      source_file_hash TEXT NOT NULL,
      page_no INTEGER NOT NULL CHECK (page_no >= 1),
      range_info TEXT NOT NULL,
      content_type TEXT NOT NULL
        CHECK (content_type IN ('paper', 'answer', 'analysis', 'listening_script')),
      text_excerpt TEXT,
      segment_order INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
      status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('auto_confirmed', 'pending_review', 'confirmed', 'rejected')),
      manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_content_segment_collection ON content_segment(collection_id, content_type, status)',
  'CREATE INDEX IF NOT EXISTS idx_content_segment_paper ON content_segment(paper_id, content_type, segment_order)',
  'CREATE INDEX IF NOT EXISTS idx_content_segment_analysis ON content_segment(analysis_id, content_type, segment_order)',
  'CREATE INDEX IF NOT EXISTS idx_content_segment_source_hash ON content_segment(source_file_hash, page_no)',
  'CREATE INDEX IF NOT EXISTS idx_content_segment_review ON content_segment(status, confidence, updated_at DESC)',

  `
    CREATE TABLE IF NOT EXISTS exam_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope_key TEXT NOT NULL,
      page_number INTEGER NOT NULL CHECK (page_number >= 1),
      annotation_type TEXT NOT NULL,
      quote TEXT,
      note TEXT,
      color TEXT DEFAULT '#facc15',
      geometry_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `,
  'CREATE INDEX IF NOT EXISTS idx_exam_annotations_scope ON exam_annotations(scope_key, page_number, created_at DESC)'
]
