import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from '@cloudflare/workers-types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../../migrations')

export interface D1TestDatabaseOptions {
  applyMigrations?: boolean
  seedSql?: string[]
}

export class D1TestDatabase implements D1Database {
  private readonly db: Database.Database

  constructor(opts: D1TestDatabaseOptions = {}) {
    this.db = new Database(':memory:')
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    if (opts.applyMigrations !== false) {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d{4}_.+\.sql$/.test(f))
        .sort()
      for (const f of files) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
        this.db.exec(sql)
      }
    }
    for (const sql of opts.seedSql ?? []) this.db.exec(sql)
  }

  prepare(query: string): D1PreparedStatement {
    return new D1TestStatement(this.db, query, [])
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.db.transaction(() => {
      return statements.map(s => {
        const stmt = s as D1TestStatement
        return stmt._runAll<T>()
      })
    })() as D1Result<T>[]
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = performance.now()
    this.db.exec(query)
    return { count: query.split(';').filter(s => s.trim()).length, duration: performance.now() - start }
  }

  dump(): Promise<ArrayBuffer> { throw new Error('dump() not implemented in tests') }
  withSession(): D1Database { return this }

  close(): void { this.db.close() }
}

class D1TestStatement implements D1PreparedStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly params: unknown[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1TestStatement(this.db, this.sql, values)
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as any[])) as Record<string, unknown> | undefined
    if (!row) return null
    return (colName ? row[colName] : row) as T
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return this._runAll<T>()
  }

  _runAll<T = unknown>(): D1Result<T> {
    const start = performance.now()
    const results = this.db.prepare(this.sql).all(...(this.params as any[])) as T[]
    return {
      results,
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: 0, last_row_id: 0, rows_read: results.length, rows_written: 0, size_after: 0 },
    }
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const start = performance.now()
    const info = this.db.prepare(this.sql).run(...(this.params as any[]))
    return {
      results: [] as T[],
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: info.changes, last_row_id: Number(info.lastInsertRowid), rows_read: 0, rows_written: info.changes, size_after: 0 },
    }
  }

  async raw<T = unknown>(): Promise<T[]> {
    return this.db.prepare(this.sql).raw().all(...(this.params as any[])) as T[]
  }
}
