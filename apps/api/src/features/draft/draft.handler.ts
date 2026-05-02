/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { validateAndSanitizeSeedPayload, resolvePolicies, serializeForDb, deserializeFromDb } from '@beech/core'
import type { Seed } from '@beech/core'
import { publicProblem } from '../../public/problem-details'
import { logActivity } from '../../shared/activity-logger'
import { cleanStr } from '../../shared/query-utils'
import { applyVisibility } from '../../shared/apply-policies'

type Bindings = { DB: D1Database }
type Variables = {
  jwtPayload: { sub: string; email?: string }
  getSeed: (slug: string) => Seed | null
  seedRegistry: Record<string, Seed>
}

const draftApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function draftNotAllowed(c: Parameters<typeof publicProblem>[0]) {
  return publicProblem(c, {
    type: 'draft-not-allowed', title: 'Method Not Allowed', status: 405,
    detail: 'This content type does not support pending drafts. Set allowDrafts: true on the Seed to enable.',
  })
}

// PUT /:slug/:id/draft — crea o sovrascrive la bozza in content_{slug}_drafts
draftApp.put('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  if (!seed.allowDrafts) return draftNotAllowed(c)

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await c.req.json<unknown>())
  } catch {
    return publicProblem(c, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const { DB } = c.env
  const existing = await DB.prepare(`SELECT id FROM content_${slug} WHERE id = ?`).bind(id).first<{ id: string }>()
  if (!existing) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })

  const sensitiveAliases = Object.keys(body).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy !== 'plain'
  })
  if (sensitiveAliases.length > 0) {
    return publicProblem(c, { type: 'content-sensitive-field-edit', title: 'Unprocessable Entity', status: 422, detail: `Cannot draft sensitive fields: ${sensitiveAliases.join(', ')}` })
  }

  const validation = validateAndSanitizeSeedPayload(seed, body, {
    operation: 'update', allowNull: true, requireAtLeastOneValidField: true, enforceRequiredFields: false,
  })
  if (validation.dangerousFields.length > 0) {
    return publicProblem(c, { type: 'content-dangerous-content', title: 'Unprocessable Entity', status: 422, detail: `Dangerous markup in field '${validation.dangerousFields[0]}'` })
  }
  if (validation.details.length > 0) {
    return publicProblem(c, { type: 'content-validation-failed', title: 'Bad Request', status: 400, detail: 'Validation failed', errors: validation.details })
  }

  // UPSERT in content_{slug}_drafts — solo colonne branch, nullable
  const draftTable = `content_${slug}_drafts`
  const cols: string[] = []
  const placeholders: string[] = []
  const bindings: (string | number | null)[] = []
  for (const branch of seed.branches) {
    if (Object.hasOwn(validation.data, branch.alias)) {
      cols.push(branch.alias)
      placeholders.push('?')
      bindings.push(serializeForDb(branch, validation.data[branch.alias]))
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const updateSet = cols.map((c) => `${c} = excluded.${c}`).join(', ')
  await DB.prepare(
    `INSERT INTO ${draftTable} (entry_id, ${cols.join(', ')}, updated_at)
     VALUES (?, ${placeholders.join(', ')}, ?)
     ON CONFLICT(entry_id) DO UPDATE SET ${updateSet}, updated_at = excluded.updated_at`
  ).bind(id, ...bindings, now).run()

  logActivity(c, {
    action: 'update', entityType: 'content', entityId: id, entitySlug: slug,
    details: { title: cleanStr(validation.data[seed.displayNameAlias]) ?? id, note: 'draft saved' },
  })

  return c.json({ success: true })
})

// GET /:slug/:id/draft — legge la bozza pendente
draftApp.get('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const row = await DB.prepare(`SELECT * FROM content_${slug}_drafts WHERE entry_id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()

  if (!row) {
    // Verifica se entry esiste
    const entry = await DB.prepare(`SELECT id FROM content_${slug} WHERE id = ?`).bind(id).first()
    if (!entry) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
    return publicProblem(c, { type: 'draft-not-found', title: 'Not Found', status: 404, detail: 'No pending draft for this entry' })
  }

  // Deserializza colonne branch reali
  const data: Record<string, unknown> = {}
  for (const branch of seed.branches) {
    if (Object.hasOwn(row, branch.alias)) {
      data[branch.alias] = deserializeFromDb(branch, row[branch.alias] ?? null)
    }
  }

  return c.json({ data: applyVisibility(data, seed) })
})

// POST /:slug/:id/draft/publish — promuove bozza → live atomicamente
draftApp.post('/:slug/:id/draft/publish', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const draftRow = await DB.prepare(`SELECT * FROM content_${slug}_drafts WHERE entry_id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()

  if (!draftRow) {
    const entry = await DB.prepare(`SELECT id FROM content_${slug} WHERE id = ?`).bind(id).first()
    if (!entry) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
    return publicProblem(c, { type: 'draft-not-found', title: 'Not Found', status: 404, detail: 'No pending draft to publish' })
  }

  // Costruisce SET clause dal draft per UPDATE atomico
  const now = Math.floor(Date.now() / 1000)
  const setParts: string[] = ['status = ?', 'updated_at = ?']
  const setBindings: (string | number | null)[] = ['published', now]

  for (const branch of seed.branches) {
    if (Object.hasOwn(draftRow, branch.alias) && draftRow[branch.alias] !== null) {
      setParts.push(`${branch.alias} = ?`)
      setBindings.push(draftRow[branch.alias] as string | number | null)
    }
  }

  await DB.batch([
    DB.prepare(`UPDATE content_${slug} SET ${setParts.join(', ')} WHERE id = ?`)
      .bind(...setBindings, id),
    DB.prepare(`DELETE FROM content_${slug}_drafts WHERE entry_id = ?`)
      .bind(id),
  ])

  // Deserializza per activity log
  const displayValue = draftRow[seed.displayNameAlias]
  const displayStr = typeof displayValue === 'string' ? displayValue : id

  logActivity(c, {
    action: 'update', entityType: 'content', entityId: id, entitySlug: slug,
    details: { title: displayStr, note: 'draft published' },
  })

  return c.json({ success: true })
})

// DELETE /:slug/:id/draft — scarta la bozza pendente
draftApp.delete('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = c.get('getSeed')(slug)
  if (!seed) return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const existing = await DB.prepare(`SELECT id FROM content_${slug} WHERE id = ?`).bind(id).first<{ id: string }>()
  if (!existing) return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })

  await DB.prepare(`DELETE FROM content_${slug}_drafts WHERE entry_id = ?`).bind(id).run()

  return c.json({ success: true })
})

export { draftApp }
