// apps/api/src/search-utils.ts
// Pure functions — zero Hono dependencies, importable from Vitest.
// v0.4.0: FTS is per-seed (fts_{slug}), joined with content_{slug} for metadata.

import type { Seed, SearchResultRow } from "@beechcms/core"

// ─── Types ───────────────────────────────────────────────────────────────────

// Row returned by UNION ALL query across fts_{slug} JOIN content_{slug}
export interface FtsRow {
  entry_id:    string
  schema_slug: string
  slug:        string | null
  status:      string
  title:       string | null
  excerpt:     string
  rank:        number
}

export interface SearchResultItem {
  id:          string
  schema_slug: string
  slug:        string | null
  status:      string
  title:       string
  excerpt:     string
  data:        Record<string, unknown>
}

export interface SearchResponse {
  items:      SearchResultItem[]
  nextCursor: string | null
  total:      number
}

export interface SearchQueryParams {
  q:          string
  schemaSlug: string | null
  status:     string | null
  limit:      number         // already clamped 1–50 by handler
  cursor:     string | null
}

// ─── Cursor ──────────────────────────────────────────────────────────────────

export function encodeCursor(rank: number, entryId: string): string {
  return btoa(`${rank}:${entryId}`)
}

export function decodeCursor(cursor: string): { rank: number; entryId: string } | null {
  try {
    const decoded = atob(cursor)
    const sep     = decoded.lastIndexOf(":")
    if (sep === -1) return null
    return {
      rank:    parseFloat(decoded.slice(0, sep)),
      entryId: decoded.slice(sep + 1),
    }
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasSearchableFts(seed: Seed): boolean {
  return seed.branches.some(b =>
    (b.type === 'text' || b.type === 'richtext') && b.policies?.search !== false
  )
}

function buildMatchExpr(q: string): string {
  const MIN_PREFIX = 3
  const safeQ = q.replace(/["*^()]/g, " ").trim()
  const terms = safeQ.split(/\s+/).filter(t => t.length >= 2)
  if (terms.length === 0) throw new Error("EMPTY_QUERY")

  return terms
    .map(t => {
      if (/^\d+$/.test(t)) return `"${t}"`
      if (t.length <= MIN_PREFIX) return `"${t}"*`
      const prefixes: string[] = []
      for (let i = MIN_PREFIX; i <= t.length; i++) {
        prefixes.push(`"${t.slice(0, i)}"*`)
      }
      return `(${prefixes.join(" OR ")})`
    })
    .join(" ")
}

// ─── Query builder ───────────────────────────────────────────────────────────

/**
 * Builds a UNION ALL query across all per-seed fts_{slug} tables (v0.4.0).
 * Each SELECT joins fts_{slug} with content_{slug} to fetch title, slug, status.
 * Seeds param: full registry — filtered internally by schemaSlug and FTS availability.
 */
export function buildFtsQuery(
  params: SearchQueryParams,
  seeds: Seed[],
): {
  sql:        string
  binds:      unknown[]
  countSql:   string
  countBinds: unknown[]
} {
  const { q, schemaSlug, status, limit, cursor } = params

  const matchExpr = buildMatchExpr(q)  // throws EMPTY_QUERY if needed

  const targetSeeds = seeds.filter(s =>
    hasSearchableFts(s) && (schemaSlug === null || s.slug === schemaSlug)
  )

  if (targetSeeds.length === 0) {
    return {
      sql:        "SELECT NULL as entry_id, NULL as schema_slug, NULL as slug, NULL as status, NULL as title, '' as excerpt, 0 as rank WHERE 1=0",
      binds:      [],
      countSql:   "SELECT 0 as total",
      countBinds: [],
    }
  }

  const decoded = cursor ? decodeCursor(cursor) : null

  const parts:       string[]  = []
  const binds:       unknown[] = []
  const countParts:  string[]  = []
  const countBinds:  unknown[] = []

  for (const seed of targetSeeds) {
    const fts   = `fts_${seed.slug}`
    const table = `content_${seed.slug}`
    const title = seed.displayNameAlias

    // Main query per seed
    const where: string[]  = [`${fts} MATCH ?`]
    const lb:    unknown[] = [matchExpr]

    if (status) { where.push("ce.status = ?"); lb.push(status) }

    if (decoded) {
      where.push(`(bm25(${fts}) > ? OR (bm25(${fts}) = ? AND f.entry_id > ?))`)
      lb.push(decoded.rank, decoded.rank, decoded.entryId)
    }

    parts.push(
      `SELECT f.entry_id, '${seed.slug}' AS schema_slug, ce.slug, ce.status,` +
      ` ce.${title} AS title,` +
      ` snippet(${fts}, 1, '<mark>', '</mark>', '…', 16) AS excerpt,` +
      ` bm25(${fts}) AS rank` +
      ` FROM ${fts} f JOIN ${table} ce ON ce.id = f.entry_id` +
      ` WHERE ${where.join(' AND ')}`
    )
    binds.push(...lb)

    // Count per seed (no cursor, no limit)
    const cw: string[]  = [`${fts} MATCH ?`]
    const cb: unknown[] = [matchExpr]
    if (status) { cw.push("ce.status = ?"); cb.push(status) }

    countParts.push(
      `SELECT COUNT(*) as c FROM ${fts} f JOIN ${table} ce ON ce.id = f.entry_id WHERE ${cw.join(' AND ')}`
    )
    countBinds.push(...cb)
  }

  const sql      = `${parts.join(' UNION ALL ')} ORDER BY rank, entry_id LIMIT ?`
  binds.push(limit + 1)

  const countSql = `SELECT SUM(c) as total FROM (${countParts.join(' UNION ALL ')})`

  return { sql, binds, countSql, countBinds }
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function stripHtmlPreserveMark(html: string): string {
  return html.replace(/<(?!\/?mark\b)[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim()
}

export function mapFtsRow(row: FtsRow): SearchResultItem {
  return {
    id:          row.entry_id,
    schema_slug: row.schema_slug,
    slug:        row.slug,
    status:      row.status,
    title:       row.title ?? "",
    excerpt:     stripHtmlPreserveMark(row.excerpt ?? ""),
    data:        {},
  }
}

/**
 * Maps a repository-shaped SearchResultRow (camelCase) to the wire-format
 * SearchResultItem returned by the /api/search route. Keeps the HTML
 * stripping behaviour previously inlined inside mapFtsRow.
 */
export function mapSearchResultRow(row: SearchResultRow): SearchResultItem {
  return {
    id:          row.entryId,
    schema_slug: row.schemaSlug,
    slug:        row.slug,
    status:      row.status,
    title:       row.title ?? "",
    excerpt:     stripHtmlPreserveMark(row.excerpt ?? ""),
    data:        {},
  }
}
