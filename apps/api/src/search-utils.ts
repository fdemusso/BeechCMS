// apps/api/src/search-utils.ts
// Funzioni pure — zero dipendenze Hono, importabili da Vitest

import { dbToApi } from "@beech/core"
import type { Seed } from "@beech/core"

// ─── Tipi ───────────────────────────────────────────────────────────────────

export interface FtsRow {
  entry_id:    string
  schema_slug: string
  title:       string
  body:        string
  tags:        string
  status:      string
  excerpt:     string   // snippet() di FTS5
  rank:        number   // bm25()
}

export interface SearchResultItem {
  id:          string
  schema_slug: string
  slug:        string | null
  status:      string
  title:       string
  excerpt:     string   // snippet HTML con <mark> attorno ai match
  data:        Record<string, unknown>  // campi in formato alias
}

export interface SearchResponse {
  items:      SearchResultItem[]
  nextCursor: string | null   // null → ultima pagina raggiunta
  total:      number          // totale match su tutte le pagine
}

export interface SearchQueryParams {
  q:          string
  schemaSlug: string | null
  status:     string | null
  limit:      number        // già clampato 1–50 dall'handler
  cursor:     string | null
}

// ─── Cursor ─────────────────────────────────────────────────────────────────

/**
 * Cursor opaco = base64(`${rank}:${entry_id}`)
 * Stabile rispetto all'ordinamento BM25 + entry_id.
 */
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

// ─── Query builder ───────────────────────────────────────────────────────────

export function buildFtsQuery(params: SearchQueryParams): {
  sql:        string
  binds:      unknown[]
  countSql:   string
  countBinds: unknown[]
} {
  const { q, schemaSlug, status, limit, cursor } = params

  // 1. Sanitizzazione e split in termini
  const safeQ = q.replace(/["*^()]/g, " ").trim()
  const terms = safeQ.split(/\s+/).filter(t => t.length >= 2)

  if (terms.length === 0) throw new Error("EMPTY_QUERY")

  /**
   * Strategia fuzzy multi-prefisso:
   * Per ogni termine non numerico, genera OR di tutti i sotto-prefissi a partire da
   * MIN_PREFIX_LEN caratteri. Questo copre trasposizioni, lettere mancanti e typo
   * vicini all'inizio del termine (es. "Desing"→"Design" via prefisso comune "Desi").
   * I termini multipli restano in AND implicito (spazio tra i gruppi).
   */
  const MIN_PREFIX = 3
  const ftsMatch = terms
    .map(t => {
      if (/^\d+$/.test(t)) return `"${t}"`                  // numeri: match esatto
      if (t.length <= MIN_PREFIX) return `"${t}"*`           // termine corto: solo prefix
      const prefixes: string[] = []
      for (let i = MIN_PREFIX; i <= t.length; i++) {
        prefixes.push(`"${t.slice(0, i)}"*`)
      }
      return `(${prefixes.join(" OR ")})`
    })
    .join(" ")

  const whereClauses: string[] = ["content_fts MATCH ?"]
  const binds: unknown[]       = [ftsMatch]

  if (schemaSlug) { whereClauses.push("schema_slug = ?"); binds.push(schemaSlug) }
  if (status)     { whereClauses.push("status = ?");      binds.push(status) }

  // Keyset pagination — evita OFFSET (non scalabile)
  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded) {
      whereClauses.push(
        "(bm25(content_fts) > ? OR (bm25(content_fts) = ? AND entry_id > ?))"
      )
      binds.push(decoded.rank, decoded.rank, decoded.entryId)
    }
  }

  const where = whereClauses.join(" AND ")

  const sql = `
    SELECT
      entry_id,
      schema_slug,
      title,
      body,
      tags,
      status,
      snippet(content_fts, 2, '<mark>', '</mark>', '…', 16) AS excerpt,
      bm25(content_fts) AS rank
    FROM content_fts
    WHERE ${where}
    ORDER BY bm25(content_fts), entry_id
    LIMIT ?
  `
  binds.push(limit + 1)   // fetch limit+1 per rilevare hasMore senza COUNT aggiuntivo

  // Count query separata — senza cursor, senza limit
  const countBinds: unknown[] = [ftsMatch]
  const countWhere: string[]  = ["content_fts MATCH ?"]
  if (schemaSlug) { countWhere.push("schema_slug = ?"); countBinds.push(schemaSlug) }
  if (status)     { countWhere.push("status = ?");      countBinds.push(status) }

  const countSql = `SELECT COUNT(*) AS total FROM content_fts WHERE ${countWhere.join(" AND ")}`

  return { sql, binds, countSql, countBinds }
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

export function mapFtsRow(
  ftsRow:  FtsRow,
  fullRow: { id: string; slug: string | null; data: string },
  getSeed: (slug: string) => Seed | null,
): SearchResultItem {
  const seed   = getSeed(ftsRow.schema_slug)
  const parsed = (() => {
    try { return JSON.parse(fullRow.data) as Record<string, unknown> }
    catch { return {} }
  })()
  const data = seed ? dbToApi(seed, parsed) : parsed

  return {
    id:          ftsRow.entry_id,
    schema_slug: ftsRow.schema_slug,
    slug:        fullRow.slug,
    status:      ftsRow.status,
    title:       ftsRow.title ?? "",
    excerpt:     ftsRow.excerpt ?? "",
    data,
  }
}
