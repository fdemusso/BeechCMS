import { DatabaseSync } from 'node:sqlite'
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
  private readonly db: DatabaseSync

  constructor(opts: D1TestDatabaseOptions = {}) {
    this.db = new DatabaseSync(':memory:')
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')

    if (opts.applyMigrations !== false) {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d{4}_.+\.sql$/.test(f))
        .sort()
      for (const f of files) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
        // Skip data-only migrations (demo seeds): they INSERT into content tables
        // that the Botanical Engine creates at runtime, not via SQL migrations.
        if (!/CREATE\s/i.test(sql) && !/ALTER\s+TABLE/i.test(sql)) continue
        this.db.exec(sql)
      }
    }
    for (const sql of opts.seedSql ?? []) this.db.exec(sql)
  }

  prepare(query: string): D1PreparedStatement {
    return new D1TestStatement(this.db, query, [])
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    this.db.exec('BEGIN')
    try {
      const results = statements.map(s => (s as D1TestStatement)._runAll<T>())
      this.db.exec('COMMIT')
      return results
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
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
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1TestStatement(this.db, this.sql, values)
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as Parameters<typeof this.db.prepare>)) as Record<string, unknown> | undefined
    if (!row) return null
    return (colName ? row[colName] : row) as T
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return this._runAll<T>()
  }

  _runAll<T = unknown>(): D1Result<T> {
    const start = performance.now()
    const results = this.db.prepare(this.sql).all(...(this.params as Parameters<typeof this.db.prepare>)) as T[]
    return {
      results,
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: 0, last_row_id: 0, rows_read: results.length, rows_written: 0, size_after: 0 },
    }
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const start = performance.now()
    const info = this.db.prepare(this.sql).run(...(this.params as Parameters<typeof this.db.prepare>)) as { changes: number; lastInsertRowid: number | bigint }
    return {
      results: [] as T[],
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: info.changes, last_row_id: Number(info.lastInsertRowid), rows_read: 0, rows_written: info.changes, size_after: 0 },
    }
  }

  async raw<T = unknown>(): Promise<T[]> {
    const rows = this.db.prepare(this.sql).all(...(this.params as Parameters<typeof this.db.prepare>)) as Record<string, unknown>[]
    if (rows.length === 0) return []
    const cols = Object.keys(rows[0])
    return rows.map(r => cols.map(c => r[c])) as T[]
  }
}
