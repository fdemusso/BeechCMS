/// <reference types="@cloudflare/workers-types" />
import { deserializeFromDb, serializeForDb } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import type { ContentEntry } from './query-utils'

/** Deserializza ogni branch colonna di un DB row in formato API alias. */
export function rowToApiData(seed: Seed, row: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const branch of seed.branches) {
    data[branch.alias] = deserializeFromDb(branch, row[branch.alias] ?? null)
  }
  return data
}

/** Converte un row della tabella content_{slug} in ContentEntry per le risposte API. */
export function rowToEntry(
  seed: Seed,
  row: Record<string, unknown>,
  hasPendingDraft = false
): ContentEntry {
  return {
    id: row.id as string,
    schema_slug: seed.slug,
    slug: (row.slug as string | null) ?? null,
    status: (row.status as string) ?? 'draft',
    data: rowToApiData(seed, row),
    hasPendingDraft,
    created_at: (row.created_at as number | null) ?? null,
    updated_at: (row.updated_at as number | null) ?? null,
  }
}

export interface InsertBindings {
  cols: string[]
  placeholders: string[]
  bindings: (string | number | null)[]
}

/** Costruisce colonne, placeholders e bindings per INSERT INTO content_{slug}. */
export function buildInsertBindings(seed: Seed, payload: Record<string, unknown>): InsertBindings {
  const cols: string[] = []
  const placeholders: string[] = []
  const bindings: (string | number | null)[] = []
  for (const branch of seed.branches) {
    if (Object.hasOwn(payload, branch.alias)) {
      cols.push(branch.alias)
      placeholders.push('?')
      bindings.push(serializeForDb(branch, payload[branch.alias]))
    }
  }
  return { cols, placeholders, bindings }
}

export interface UpdateBindings {
  setClause: string
  bindings: (string | number | null)[]
}

/** Costruisce SET clause e bindings per UPDATE content_{slug}. */
export function buildUpdateBindings(seed: Seed, payload: Record<string, unknown>): UpdateBindings {
  const setParts: string[] = []
  const bindings: (string | number | null)[] = []
  for (const branch of seed.branches) {
    if (Object.hasOwn(payload, branch.alias)) {
      setParts.push(`${branch.alias} = ?`)
      bindings.push(serializeForDb(branch, payload[branch.alias]))
    }
  }
  return { setClause: setParts.join(', '), bindings }
}

/** Controlla se esiste un draft pendente in content_{slug}_drafts. */
export async function hasDraft(db: D1Database, seed: Seed, entryId: string): Promise<boolean> {
  if (!seed.allowDrafts) return false
  const row = await db
    .prepare(`SELECT 1 FROM content_${seed.slug}_drafts WHERE entry_id = ? LIMIT 1`)
    .bind(entryId)
    .first()
  return row !== null
}

/** Scrive un evento CRUD in content_event_log per l'activity feed. */
export async function logContentEvent(
  db: D1Database,
  opts: {
    action: 'create' | 'update' | 'delete'
    schemaSlug: string
    entryId: string
    userId?: string | null
    details?: Record<string, unknown>
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content_event_log (id, schema_slug, entry_id, action, user_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      opts.schemaSlug,
      opts.entryId,
      opts.action,
      opts.userId ?? null,
      opts.details ? JSON.stringify(opts.details) : null,
      Math.floor(Date.now() / 1000)
    )
    .run()
}
