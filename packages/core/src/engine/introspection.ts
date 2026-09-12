// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/introspection
 * Reads live schema state out of D1 through an INJECTED executor.
 *
 * Executor-agnostic on purpose: the CLI reaches D1 through a synchronous shell/SQLite path
 * (`queryD1`) and the Worker through its `D1Database` binding, and neither tier may import the
 * other (`graphify path "createBeechApp" "queryD1"` must keep returning no path). `@beechcms/core`
 * owns the STATEMENTS and the SHAPES; the caller owns the connection.
 *
 * Read-only by contract: every statement here is a `PRAGMA` or a `SELECT`. Schema mutation stays
 * the exclusive business of the Botanical Engine's DDL path (`engine/seed-ddl.ts`).
 */

import type { Seed } from './types.js'

/**
 * The one capability the introspection primitive needs from a database connection.
 *
 * Implementations MUST: execute the statement as-is, return one object per row with column names
 * as keys, and reject/throw on failure. They MUST NOT cache, batch, rewrite or retry — a stale
 * answer here becomes a wrong fingerprint, which becomes a false "your types are stale" error in
 * someone else's production client.
 */
export interface SchemaQueryExecutor {
  all<T extends Record<string, unknown>>(sql: string): Promise<T[]>
}

/** Thrown when live state cannot be read or cannot be trusted. */
export class IntrospectionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'IntrospectionError'
  }
}

/** One physical column, as SQLite reports it. */
export interface LiveColumn {
  name: string
  /** Declared storage type, upper-cased (`TEXT` | `INTEGER` | `REAL` | …). */
  sqlType: string
  notNull: boolean
  isPk: boolean
  /** Declared DEFAULT expression verbatim, or null. */
  defaultValue: string | null
}

/** One foreign-key constraint on a physical table. */
export interface LiveForeignKey {
  /** Local column carrying the reference. */
  column: string
  /** Referenced table, e.g. `content_team`. */
  targetTable: string
  /** Referenced column, e.g. `id`. */
  targetColumn: string
  /** Upper-cased, e.g. `SET NULL`. */
  onDelete: string
  /** Upper-cased, e.g. `NO ACTION`. */
  onUpdate: string
}

/** One index on a physical table. SQLite's implicit `sqlite_autoindex_*` entries are excluded. */
export interface LiveIndex {
  name: string
  unique: boolean
}

/** The physical state of one table. `exists: false` means SQLite reports no such table. */
export interface LiveTable {
  name: string
  exists: boolean
  /** Physical order, as returned by `PRAGMA table_info` (cid order). */
  columns: LiveColumn[]
  /** Sorted by `column`, then `targetTable`, for deterministic output. */
  foreignKeys: LiveForeignKey[]
  /** Sorted by `name`. */
  indexes: LiveIndex[]
}

/** The physical state of a set of tables. `tables` is sorted by name. */
export interface LiveSchema {
  tables: LiveTable[]
}

// ── Raw PRAGMA row shapes (module-private: nothing outside speaks PRAGMA) ───────────────

interface TableInfoRow extends Record<string, unknown> {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface ForeignKeyListRow extends Record<string, unknown> {
  id: number
  seq: number
  table: string
  from: string
  to: string | null
  on_update: string
  on_delete: string
}

interface IndexListRow extends Record<string, unknown> {
  seq: number
  name: string
  unique: number
}

interface MasterRow extends Record<string, unknown> {
  name: string
}

interface SeedRow extends Record<string, unknown> {
  slug: string
  definition: string
}

/**
 * SQLite identifiers cannot be bound as parameters, so every table name reaching a PRAGMA is
 * interpolated — and therefore must be proven safe first. Table names in this system are always
 * `content_{slug}` / `rel_{slug}_{alias}` / a structural table, all of which match this pattern.
 */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Returns `name` unchanged when it is a safe SQL identifier; throws otherwise. */
export function assertSafeIdentifier(name: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new IntrospectionError(
      `Refusing to introspect '${name}': not a plain SQL identifier. Table names are never user input in BeechCMS.`,
    )
  }
  return name
}

/**
 * Physical state of one table. A table SQLite does not know returns `{ exists: false }` with empty
 * lists rather than throwing: "missing" is a legitimate diff outcome, not an error.
 *
 * `PRAGMA table_info` answers an unknown table with zero rows on the SQLite path and raises on some
 * wrangler paths, so both outcomes collapse to the same result.
 */
export async function introspectTable(
  executor: SchemaQueryExecutor,
  table: string,
): Promise<LiveTable> {
  const name = assertSafeIdentifier(table)
  const empty: LiveTable = { name, exists: false, columns: [], foreignKeys: [], indexes: [] }

  let info: TableInfoRow[]
  try {
    info = await executor.all<TableInfoRow>(`PRAGMA table_info(${name})`)
  } catch {
    return empty
  }
  if (info.length === 0) return empty

  const columns: LiveColumn[] = info.map(row => ({
    name: row.name,
    sqlType: String(row.type ?? '').toUpperCase(),
    notNull: row.notnull === 1,
    isPk: row.pk > 0,
    defaultValue: row.dflt_value ?? null,
  }))

  let fkRows: ForeignKeyListRow[] = []
  let indexRows: IndexListRow[] = []
  try {
    fkRows = await executor.all<ForeignKeyListRow>(`PRAGMA foreign_key_list(${name})`)
    indexRows = await executor.all<IndexListRow>(`PRAGMA index_list(${name})`)
  } catch {
    // A table with neither FKs nor indexes answers with zero rows on some drivers and raises on
    // others; an unreadable constraint list must not hide the column list we already have.
  }

  const foreignKeys: LiveForeignKey[] = fkRows
    .map(row => ({
      column: row.from,
      targetTable: row.table,
      targetColumn: row.to ?? 'id',
      onDelete: String(row.on_delete ?? '').toUpperCase(),
      onUpdate: String(row.on_update ?? '').toUpperCase(),
    }))
    .sort((a, b) => a.column.localeCompare(b.column) || a.targetTable.localeCompare(b.targetTable))

  const indexes: LiveIndex[] = indexRows
    // Implicit indexes SQLite mints for UNIQUE/PK are not schema an author declared, and their
    // names are not stable across environments.
    .filter(row => !row.name.startsWith('sqlite_autoindex_'))
    .map(row => ({ name: row.name, unique: row.unique === 1 }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { name, exists: true, columns, foreignKeys, indexes }
}

/**
 * Names of the physical tables SQLite holds, optionally restricted to a `LIKE` prefix
 * (e.g. `content_`). Sorted, `sqlite_*` internals excluded.
 */
export async function listTables(
  executor: SchemaQueryExecutor,
  prefix?: string,
): Promise<string[]> {
  if (prefix !== undefined) assertSafeIdentifier(`${prefix}x`)
  const filter = prefix ? ` AND name LIKE '${prefix}%'` : ''
  const rows = await executor.all<MasterRow>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'${filter} ORDER BY name ASC`,
  )
  return rows.map(row => row.name)
}

/**
 * Physical state of several tables at once. With no explicit list, every `content_*` table is
 * introspected — the set a schema export or a drift check cares about.
 */
export async function introspectSchema(
  executor: SchemaQueryExecutor,
  tables?: string[],
): Promise<LiveSchema> {
  const names = tables ?? await listTables(executor, 'content_')
  const sorted = [...names].sort((a, b) => a.localeCompare(b))
  const result: LiveTable[] = []
  // Sequential on purpose: the CLI executor is a synchronous shell/SQLite call behind a Promise,
  // and D1 rejects unbounded concurrent statements from one request.
  for (const name of sorted) {
    result.push(await introspectTable(executor, name))
  }
  return { tables: result }
}

/**
 * The DECLARED schema: every active seed definition, read live from D1.
 *
 * This — not `beech.schema.ts` — is the source of truth for generated types and for the schema
 * fingerprint (feature brief, business rule 1). The manifest file is a desired-state artifact and
 * may legitimately be ahead of, or behind, what is deployed.
 */
export async function introspectSeedDefinitions(
  executor: SchemaQueryExecutor,
): Promise<Seed[]> {
  let rows: SeedRow[]
  try {
    rows = await executor.all<SeedRow>(
      `SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC`,
    )
  } catch (error) {
    throw new IntrospectionError('Failed to read the `seeds` table from D1.', error)
  }

  return rows.map(row => {
    try {
      return JSON.parse(row.definition) as Seed
    } catch (error) {
      throw new IntrospectionError(
        `Seed '${row.slug}' holds a definition that is not valid JSON; D1 state is corrupt.`,
        error,
      )
    }
  })
}
