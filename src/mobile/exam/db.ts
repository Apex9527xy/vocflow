/**
 * Browser-side in-memory SQLite database (sql.js) for the mobile exam module.
 *
 * Parallels electron/database/connection.ts + wrapper.ts, but persistence is an
 * IndexedDB snapshot instead of a native file. The whole database lives in
 * WASM memory; on every dirty commit we export bytes and write them back to
 * IndexedDB. Imported PDF/audio bytes are stored separately by resource id in
 * idb.ts because the browser has no file system paths.
 */
import initSqlJs, {
  type Database as SqlJsDatabase,
  type Statement as SqlJsStatement,
  type BindParams
} from 'sql.js'
import { EXAM_SCHEMA_SQL } from './schema'
import { loadDbSnapshot, saveDbSnapshot } from './idb'

export interface DbStatement {
  all(...params: unknown[]): any[]
  get(...params: unknown[]): any
  run(...params: unknown[]): { lastInsertRowid: number; changes: number }
}

export interface DbHandle {
  prepare(sql: string): DbStatement
  exec(sql: string): void
  run(sql: string, params?: Record<string, unknown>): { lastInsertRowid: number; changes: number }
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
  /** Export the current database to bytes and persist the snapshot. */
  persist(): Promise<void>
  /** Raw sql.js instance (rarely needed; prefer the wrapper). */
  raw(): SqlJsDatabase
}

const WRITE_SQL = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX)\b/i

let instance: DbHandle | null = null
let initializing: Promise<DbHandle> | null = null

function normalizeUrl(url: string): string {
  // The injected constant is relative to the app root; resolve against the
  // document base so it works under a sub-path / PWA standalone launch.
  return new URL(url, document.baseURI).href
}

class BrowserStatement {
  private freed = false
  constructor(
    private sqlText: string,
    private stmt: SqlJsStatement,
    private db: SqlJsDatabase,
    private markDirty: () => void
  ) {}

  private ensure(): SqlJsStatement {
    if (this.freed) {
      this.stmt = this.db.prepare(this.sqlText)
      this.freed = false
    }
    return this.stmt
  }

  all(...params: unknown[]): any[] {
    const stmt = this.ensure()
    stmt.bind(params as BindParams)
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    this.freed = true
    return rows
  }

  get(...params: unknown[]): any {
    const stmt = this.ensure()
    if (params.length > 0) stmt.bind(params as BindParams)
    let result: any
    if (stmt.step()) result = stmt.getAsObject()
    stmt.free()
    this.freed = true
    return result
  }

  run(...params: unknown[]): { lastInsertRowid: number; changes: number } {
    if (WRITE_SQL.test(this.sqlText)) this.markDirty()
    const stmt = this.ensure()
    if (params.length > 0) stmt.bind(params as BindParams)
    stmt.step()
    const result = this.db.exec('SELECT last_insert_rowid() as id, changes() as changes')
    const row = result[0]?.values[0]
    stmt.free()
    this.freed = true
    return { lastInsertRowid: row ? (row[0] as number) : 0, changes: row ? (row[1] as number) : 0 }
  }
}

function buildHandle(rawDb: SqlJsDatabase): DbHandle {
  let dirty = false

  const markDirty = () => {
    dirty = true
  }

  const persist = async () => {
    if (!dirty) return
    const exported = rawDb.export()
    // Copy into a fresh ArrayBuffer: the Uint8Array's backing buffer may carry
    // an offset, and IndexedDB must own a stable copy that survives WASM memory moves.
    const bytes = exported.slice().buffer as ArrayBuffer
    await saveDbSnapshot(bytes)
    dirty = false
  }

  const handle: DbHandle = {
    prepare(sql: string): DbStatement {
      const stmt = rawDb.prepare(sql)
      return new BrowserStatement(sql, stmt, rawDb, markDirty)
    },

    exec(sql: string): void {
      if (WRITE_SQL.test(sql)) markDirty()
      rawDb.run(sql)
    },

    run(sql: string, params?: Record<string, unknown>): { lastInsertRowid: number; changes: number } {
      if (WRITE_SQL.test(sql)) markDirty()
      if (params) {
        const orderedValues: unknown[] = []
        const orderedSql = sql.replace(/@(\w+)/g, (_match, name: string) => {
          orderedValues.push(params['@' + name] ?? null)
          return '?'
        })
        const stmt = rawDb.prepare(orderedSql)
        stmt.bind(orderedValues as BindParams)
        stmt.step()
        stmt.free()
        const result = rawDb.exec('SELECT last_insert_rowid() as id, changes() as changes')
        const row = result[0]?.values[0]
        return { lastInsertRowid: row ? (row[0] as number) : 0, changes: row ? (row[1] as number) : 0 }
      }
      rawDb.run(sql)
      const result = rawDb.exec('SELECT last_insert_rowid() as id, changes() as changes')
      const row = result[0]?.values[0]
      return { lastInsertRowid: row ? (row[0] as number) : 0, changes: row ? (row[1] as number) : 0 }
    },

    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
      return (...args: unknown[]): T => {
        rawDb.run('BEGIN')
        try {
          const result = fn(...args)
          rawDb.run('COMMIT')
          return result
        } catch (e) {
          rawDb.run('ROLLBACK')
          throw e
        }
      }
    },

    persist,
    raw: () => rawDb
  }

  return handle
}

/** Initialize (or reuse) the browser exam database. Safe to call repeatedly. */
export async function initExamDb(): Promise<DbHandle> {
  if (instance) return instance
  if (initializing) return initializing

  initializing = (async () => {
    const wasmUrl = normalizeUrl(
      typeof __VOCFLOW_SQLJS_WASM_URL__ !== 'undefined' ? __VOCFLOW_SQLJS_WASM_URL__ : './assets/sql-wasm-browser.wasm'
    )
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })

    const snapshot = await loadDbSnapshot()
    const rawDb = snapshot ? new SQL.Database(new Uint8Array(snapshot)) : new SQL.Database()

    rawDb.run('PRAGMA journal_mode = OFF')
    rawDb.run('PRAGMA foreign_keys = ON')

    for (const statement of EXAM_SCHEMA_SQL) rawDb.run(statement)

    instance = buildHandle(rawDb)
    // Persist once so an empty fresh install still has a snapshot on disk.
    await instance.persist()
    return instance
  })()

  try {
    return await initializing
  } finally {
    initializing = null
  }
}

/** Get the already-initialized handle; throws if initExamDb() has not run. */
export function getExamDb(): DbHandle {
  if (!instance) throw new Error('真题数据库尚未初始化')
  return instance
}
