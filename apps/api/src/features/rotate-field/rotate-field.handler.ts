/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { resolvePolicies, verifyHashField, sha256hex, validateAndSanitizeSeedPayload, serializeForDb } from '@beech/core'
import { publicProblem } from '../../public/problem-details'
import { rotateFieldBodySchema } from './rotate-field.schema'
import type { Env, Variables } from '../../types'

const rotateFieldApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rotateFieldApp.post('/:slug/:id/rotate-field', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')

  const seed = c.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(c, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: `Seed '${slug}' not found` })
  }

  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return publicProblem(c, { type: 'rotate-field-invalid-json', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const parsed = rotateFieldBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return publicProblem(c, { type: 'rotate-field-invalid-body', title: 'Bad Request', status: 400, detail: parsed.error.issues[0]?.message ?? 'Invalid body' })
  }

  const { field, current, next } = parsed.data

  const branch = seed.branches.find((b) => b.alias === field)
  if (!branch) {
    return publicProblem(c, { type: 'rotate-field-unknown-field', title: 'Bad Request', status: 400, detail: `Field '${field}' does not exist in seed '${slug}'` })
  }

  const { privacy } = resolvePolicies(branch)
  if (privacy !== 'hash') {
    return publicProblem(c, { type: 'rotate-field-not-hashable', title: 'Unprocessable Entity', status: 422, detail: `Field '${field}' does not use hash privacy and cannot be rotated with this endpoint` })
  }

  const { DB } = c.env
  // In v0.4.0 il valore hash è in una colonna reale: row[branch.alias]
  const row = await DB.prepare(`SELECT ${branch.alias} FROM content_${slug} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<Record<string, unknown>>()

  if (!row) {
    return publicProblem(c, { type: 'content-not-found', title: 'Not Found', status: 404, detail: `Entry '${id}' not found` })
  }

  const storedHash = row[branch.alias]

  if (typeof storedHash !== 'string' || storedHash.length === 0) {
    return publicProblem(c, { type: 'rotate-field-not-set', title: 'Unprocessable Entity', status: 422, detail: `Field '${field}' has no stored value to rotate` })
  }

  const matches = await verifyHashField(storedHash, current)
  if (!matches) {
    return publicProblem(c, { type: 'rotate-field-current-mismatch', title: 'Forbidden', status: 403, detail: 'Current value does not match stored value' })
  }

  const validation = validateAndSanitizeSeedPayload(
    seed, { [field]: next },
    { operation: 'update', allowNull: false, requireAtLeastOneValidField: true, enforceRequiredFields: false }
  )
  if (validation.details.length > 0) {
    return publicProblem(c, { type: 'rotate-field-invalid-next', title: 'Bad Request', status: 400, detail: `Invalid value for field '${field}': ${validation.details[0]?.message ?? 'validation failed'}` })
  }

  const nextHash = await sha256hex(next)
  const now = Math.floor(Date.now() / 1000)

  await DB.prepare(`UPDATE content_${slug} SET ${branch.alias} = ?, updated_at = ? WHERE id = ?`)
    .bind(serializeForDb(branch, nextHash), now, id)
    .run()

  return c.json({ success: true })
})

export { rotateFieldApp }
