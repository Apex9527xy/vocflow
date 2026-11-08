/**
 * sql.js 兼容包装层
 * 提供类似 better-sqlite3 的 Statement API (.all(), .get(), .run())
 */
import type { Database as SqlJsDb, Statement as SqlJsStmt, BindParams } from 'sql.js'
import { markDatabaseDirty } from './database-state'

function isWriteSql(sql: string): boolean {
  return /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|VACUUM|REINDEX)\b/i.test(sql)
}

class StatementWrapper {
  private rawStmt: SqlJsStmt
  private freed = false

  constructor(
    stmt: SqlJsStmt,
    private sql: string,
    private db: SqlJsDb
  ) {
    this.rawStmt = stmt
  }

  all(...params: unknown[]): unknown[] {
    this.ensureReady()
    this.rawStmt.bind(params as BindParams)
    const results: unknown[] = []
    while (this.rawStmt.step()) {
      results.push(this.rawStmt.getAsObject())
    }
    this.rawStmt.free()
    this.freed = true
    return results
  }

  get(...params: unknown[]) {
    this.ensureReady()
    if (params.length > 0) this.rawStmt.bind(params as BindParams)
    let result: unknown = undefined
    if (this.rawStmt.step()) {
      result = this.rawStmt.getAsObject()
    }
    this.rawStmt.free()
    this.freed = true
    return result
  }

  run(...params: unknown[]) {
    if (isWriteSql(this.sql)) markDatabaseDirty()
    this.ensureReady()
    if (params.length > 0) this.rawStmt.bind(params as BindParams)
    this.rawStmt.step()
    const result = this.db.exec('SELECT last_insert_rowid() as id, changes() as changes')
    // 释放并标记，下次调用会自动重新 prepare
    this.rawStmt.free()
    this.freed = true
    const row = result[0]?.values[0]
    return {
      lastInsertRowid: row ? (row[0] as number) : 0,
      changes: row ? (row[1] as number) : 0
    }
  }

  private ensureReady() {
    if (this.freed) {
      this.rawStmt = this.db.prepare(this.sql)
      this.freed = false
    }
  }
}

export interface DbWrapper {
  prepare(sql: string): StatementWrapper
  exec(sql: string, params?: unknown[]): void
  run(sql: string, params?: Record<string, unknown>): { lastInsertRowid: number; changes: number }
  transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T
}

/**
 * 为 sql.js Database 实例创建兼容包装器
 */
export function wrapDatabase(rawDb: SqlJsDb): DbWrapper {
  const db = rawDb

  return {
    prepare(sql: string): StatementWrapper {
      const stmt = db.prepare(sql)
      return new StatementWrapper(stmt, sql, db)
    },

    exec(sql: string): void {
      if (isWriteSql(sql)) markDatabaseDirty()
      db.run(sql)
    },

    run(sql: string, params?: Record<string, unknown>): { lastInsertRowid: number; changes: number } {
      if (isWriteSql(sql)) markDatabaseDirty()
      if (params) {
        // 将每个 @param 替换为 ? 并构建对应顺序的值数组
        // 支持同一参数在 SQL 中多次出现（如 ON CONFLICT DO UPDATE）
        const orderedValues: unknown[] = []
        const qSql = sql.replace(/@(\w+)/g, (match, paramName) => {
          orderedValues.push(params['@' + paramName] ?? null)
          return '?'
        })
        const stmt = db.prepare(qSql)
        stmt.bind(orderedValues as BindParams)
        stmt.step()
        stmt.free()
        const result = db.exec('SELECT last_insert_rowid() as id, changes() as changes')
        const row = result[0]?.values[0]
        return {
          lastInsertRowid: row ? (row[0] as number) : 0,
          changes: row ? (row[1] as number) : 0
        }
      } else {
        db.run(sql)
        const result = db.exec('SELECT last_insert_rowid() as id, changes() as changes')
        const row = result[0]?.values[0]
        return {
          lastInsertRowid: row ? (row[0] as number) : 0,
          changes: row ? (row[1] as number) : 0
        }
      }
    },

    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T {
      return (...args: unknown[]): T => {
        db.run('BEGIN')
        try {
          const result = fn(...args)
          db.run('COMMIT')
          return result
        } catch (e) {
          db.run('ROLLBACK')
          throw e
        }
      }
    }
  }
}
