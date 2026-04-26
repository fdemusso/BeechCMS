/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'

export const setupApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/** GET /auth/setup — tells the dashboard whether first-run setup is needed */
setupApp.get('/auth/setup', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT COUNT(*) as count FROM users')
    .first<{ count: number }>()
  return c.json({ needsSetup: (row?.count ?? 0) === 0 })
})

/** POST /auth/setup — creates the first admin; rejected once any user exists */
setupApp.post('/auth/setup', async (c) => {
  const row = await c.env.DB
    .prepare('SELECT COUNT(*) as count FROM users')
    .first<{ count: number }>()

  if ((row?.count ?? 0) > 0) {
    return c.json(
      { type: 'https://beech.local/errors/setup-already-done', title: 'Setup already completed', status: 403 },
      403
    )
  }

  let body: unknown
  try { body = await c.req.json() } catch {
    return c.json({ type: 'https://beech.local/errors/bad-request', title: 'Invalid JSON body', status: 400 }, 400)
  }

  if (!body || typeof body !== 'object') {
    return c.json({ type: 'https://beech.local/errors/bad-request', title: 'Invalid request', status: 400 }, 400)
  }

  const { email, password, name } = body as Record<string, unknown>

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return c.json({ type: 'https://beech.local/errors/validation', title: 'Valid email required', status: 422 }, 422)
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return c.json({ type: 'https://beech.local/errors/validation', title: 'Password must be 8–128 characters', status: 422 }, 422)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const id = crypto.randomUUID()
  const cleanEmail = email.trim().toLowerCase()
  const cleanName = typeof name === 'string' ? name.trim() : null

  await c.env.DB
    .prepare('INSERT INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
    .bind(id, cleanEmail, passwordHash, 'admin', cleanName)
    .run()

  return c.json({ success: true }, 201)
})
