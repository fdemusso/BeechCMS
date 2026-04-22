/// <reference types="@cloudflare/workers-types" />
import type { Seed } from '@beech/core'
import { dbToApi, resolvePolicies } from '@beech/core'

/**
 * Estrae ricorsivamente testo plain da un valore TipTap o qualsiasi struttura.
 * Usato per indicizzare richtext senza includere markup JSON.
 */
function extractText(val: unknown): string {
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.map(extractText).join(' ')
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (obj.content) return extractText(obj.content)
    if (obj.doc) return extractText(obj.doc)
  }
  return ''
}

function extractFtsFields(
  seed: Seed,
  dbData: Record<string, unknown>
): { title: string; body: string; tags: string } {
  const apiData = dbToApi(seed, dbData)
  const searchable = seed.branches.filter((b) => resolvePolicies(b).search !== false)

  // title: campo identificativo principale del seed (displayNameAlias)
  const title = String(apiData[seed.displayNameAlias] ?? '')

  // body: primo campo richtext o text che non sia il titolo
  const bodyBranch = searchable.find(
    (b) => (b.type === 'richtext' || b.type === 'text') && b.alias !== seed.displayNameAlias
  )
  const bodyVal = bodyBranch ? apiData[bodyBranch.alias] : undefined
  const body = bodyVal != null ? extractText(bodyVal) : ''

  // tags: primo campo json il cui alias contiene 'tag'
  const tagsBranch = searchable.find(
    (b) => b.type === 'json' && b.alias.toLowerCase().includes('tag')
  )
  const tagsVal = tagsBranch ? apiData[tagsBranch.alias] : undefined
  const tags = Array.isArray(tagsVal)
    ? (tagsVal as unknown[]).map(String).join(' ')
    : tagsVal != null
      ? String(tagsVal)
      : ''

  return { title, body, tags }
}

/**
 * Sincronizza la virtual table FTS5 per una singola entry.
 * Usa delete+insert atomico tramite db.batch() — unico modo sicuro per FTS5 update.
 * Generico: funziona per qualsiasi seed grazie al Botanical Engine.
 */
export async function syncFts(
  db: D1Database,
  entryId: string,
  schemaSlug: string,
  seed: Seed,
  dbData: Record<string, unknown>,
  status: string
): Promise<void> {
  const { title, body, tags } = extractFtsFields(seed, dbData)
  await db.batch([
    db.prepare('DELETE FROM content_fts WHERE entry_id = ?').bind(entryId),
    db
      .prepare(
        'INSERT INTO content_fts (entry_id, schema_slug, title, body, tags, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(entryId, schemaSlug, title, body, tags, status),
  ])
}

/**
 * Rimuove una entry dall'indice FTS5. Chiamata dopo DELETE su content_entries.
 */
export async function deleteFts(db: D1Database, entryId: string): Promise<void> {
  await db.prepare('DELETE FROM content_fts WHERE entry_id = ?').bind(entryId).run()
}
