/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { getSeed, apiToDb, dbToApi, validateAndSanitizeSeedPayload, resolvePolicies } from '@beech/core'
import { publicProblem } from '../../public/problem-details'
import { logActivity } from '../../shared/activity-logger'
import { cleanStr, safeParseJson } from '../../shared/query-utils'
import { applyVisibility } from '../../shared/apply-policies'
import { syncFts } from '../../shared/fts-sync'

type Bindings = { DB: D1Database }
type Variables = { jwtPayload: { sub: string; email?: string } }

const draftApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function draftNotAllowed(c: Parameters<typeof publicProblem>[0]) {
  return publicProblem(c, {
    type: 'draft-not-allowed',
    title: 'Method Not Allowed',
    status: 405,
    detail: 'This content type does not support pending drafts. Set allowDrafts: true on the Seed to enable.',
  })
}

// PUT /:slug/:id/draft — crea o sovrascrive la bozza pendente
draftApp.put('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = getSeed(slug)
  if (!seed) {
    return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  }
  if (!seed.allowDrafts) return draftNotAllowed(c)

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await c.req.json<unknown>())
  } catch {
    return publicProblem(c, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const { DB } = c.env
  const existing = await DB.prepare(
    'SELECT id FROM content_entries WHERE schema_slug = ? AND id = ?'
  ).bind(slug, id).first<{ id: string }>()

  if (!existing) {
    return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
  }

  // I campi sensibili (privacy !== 'plain') non sono modificabili neanche in bozza
  const sensitiveAliases = Object.keys(body).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy !== 'plain'
  })
  if (sensitiveAliases.length > 0) {
    return publicProblem(c, {
      type: 'content-sensitive-field-edit',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Cannot draft sensitive fields: ${sensitiveAliases.join(', ')}`,
    })
  }

  const validation = validateAndSanitizeSeedPayload(seed, body, {
    operation: 'update',
    allowNull: true,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: false,
  })
  if (validation.dangerousFields.length > 0) {
    return publicProblem(c, {
      type: 'content-dangerous-content',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Dangerous markup in field '${validation.dangerousFields[0]}'`,
    })
  }
  if (validation.details.length > 0) {
    return publicProblem(c, {
      type: 'content-validation-failed',
      title: 'Bad Request',
      status: 400,
      detail: 'Validation failed',
      errors: validation.details,
    })
  }

  const dbPayload = apiToDb(seed, validation.data)
  const draftStr = JSON.stringify(dbPayload)
  const now = Math.floor(Date.now() / 1000)

  await DB.prepare(
    'UPDATE content_entries SET draft_data = ?, updated_at = ? WHERE schema_slug = ? AND id = ?'
  ).bind(draftStr, now, slug, id).run()

  logActivity(c, {
    action: 'update',
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title: cleanStr(validation.data[seed.displayNameAlias]) ?? id, note: 'draft saved' },
  })

  return c.json({ success: true })
})

// GET /:slug/:id/draft — legge la bozza pendente
draftApp.get('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = getSeed(slug)
  if (!seed) {
    return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  }
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const row = await DB.prepare(
    'SELECT draft_data FROM content_entries WHERE schema_slug = ? AND id = ?'
  ).bind(slug, id).first<{ draft_data: string | null }>()

  if (!row) {
    return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
  }
  if (!row.draft_data) {
    return publicProblem(c, { type: 'draft-not-found', title: 'Not Found', status: 404, detail: 'No pending draft for this entry' })
  }

  const rawData = safeParseJson(row.draft_data)
  return c.json({ data: applyVisibility(dbToApi(seed, rawData), seed) })
})

// POST /:slug/:id/draft/publish — promuove draft_data → data e imposta status=published
draftApp.post('/:slug/:id/draft/publish', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = getSeed(slug)
  if (!seed) {
    return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  }
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const row = await DB.prepare(
    'SELECT draft_data FROM content_entries WHERE schema_slug = ? AND id = ?'
  ).bind(slug, id).first<{ draft_data: string | null }>()

  if (!row) {
    return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
  }
  if (!row.draft_data) {
    return publicProblem(c, { type: 'draft-not-found', title: 'Not Found', status: 404, detail: 'No pending draft to publish' })
  }

  const now = Math.floor(Date.now() / 1000)
  // Copia draft_data → data in un'unica istruzione SQL atomica
  await DB.prepare(
    'UPDATE content_entries SET data = draft_data, draft_data = NULL, status = ?, updated_at = ? WHERE schema_slug = ? AND id = ?'
  ).bind('published', now, slug, id).run()

  const publishedDbData = safeParseJson(row.draft_data)
  syncFts(DB, id, slug, seed, publishedDbData, 'published').catch((err) => {
    console.warn('[FTS] sync failed after draft publish:', err)
  })

  const draftAlias = dbToApi(seed, publishedDbData)
  logActivity(c, {
    action: 'update',
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title: cleanStr(draftAlias[seed.displayNameAlias]) ?? id, note: 'draft published' },
  })

  return c.json({ success: true })
})

// DELETE /:slug/:id/draft — scarta la bozza pendente
draftApp.delete('/:slug/:id/draft', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = getSeed(slug)
  if (!seed) {
    return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: 'Seed not found' })
  }
  if (!seed.allowDrafts) return draftNotAllowed(c)

  const { DB } = c.env
  const existing = await DB.prepare(
    'SELECT id FROM content_entries WHERE schema_slug = ? AND id = ?'
  ).bind(slug, id).first<{ id: string }>()

  if (!existing) {
    return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: 'Not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  await DB.prepare(
    'UPDATE content_entries SET draft_data = NULL, updated_at = ? WHERE schema_slug = ? AND id = ?'
  ).bind(now, slug, id).run()

  return c.json({ success: true })
})

export { draftApp }
