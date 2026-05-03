/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'

const settingsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const BCRYPT_ROUNDS = 10

type UserRow = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  password_hash: string
  notification_prefs: string
}

type SessionRow = {
  id: string
  created_at: number
  expires_at: number
}

type ActivityRow = {
  id: string
  action: string
  entity_type: string
  entity_slug: string | null
  details: string | null
  created_at: number
}

type OrphanRow = {
  key: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: number
}


// GET /api/settings
settingsApp.get('/', async (c) => {
  // General site configuration. 
  // In the future, these could be loaded from a 'system_settings' table in D1.
  return c.json({
    siteTitle: 'Beech CMS',
    siteLogo: '/beechLogoDark.svg',
    defaultLanguage: 'it',
    features: {
      drafts: true,
      media: true,
      search: true,
      activityLog: true
    }
  })
})

// GET /api/settings/me
settingsApp.get('/me', async (c) => {
  const { sub } = c.get('jwtPayload')
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url, notification_prefs FROM users WHERE id = ? LIMIT 1'
  ).bind(sub).first<Omit<UserRow, 'password_hash'>>()
  if (!user) return c.json({ error: 'User not found' }, 404)

  let notificationPrefs: Record<string, boolean>
  try { notificationPrefs = JSON.parse(user.notification_prefs || '{}') } catch { notificationPrefs = {} }

  return c.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url,
    notificationPrefs: {
      contentCreate: notificationPrefs.contentCreate ?? true,
      contentUpdate: notificationPrefs.contentUpdate ?? true,
      contentDelete: notificationPrefs.contentDelete ?? true,
      mediaUpload: notificationPrefs.mediaUpload ?? false,
    },
  })
})

// PUT /api/settings/profile
settingsApp.put('/profile', async (c) => {
  const { sub } = c.get('jwtPayload')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const name = typeof body.name === 'string' ? body.name.trim() : null
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null

  if (email !== null && !EMAIL_REGEX.test(email)) {
    return c.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Formato email non valido' }, 400)
  }
  if (name !== null && name.length > 100) {
    return c.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Nome troppo lungo (max 100 caratteri)' }, 400)
  }

  const updates: string[] = []
  const values: unknown[] = []
  if (name !== null) { updates.push('name = ?'); values.push(name) }
  if (email !== null) { updates.push('email = ?'); values.push(email) }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  if (email !== null) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1'
    ).bind(email, sub).first()
    if (existing) return c.json({ type: 'conflict', title: 'Conflict', status: 409, detail: 'Email già in uso' }, 409)
  }

  values.push(sub)
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// PUT /api/settings/password
settingsApp.put('/password', async (c) => {
  const { sub } = c.get('jwtPayload')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

  if (!currentPassword || !newPassword) return c.json({ error: 'currentPassword e newPassword obbligatori' }, 400)
  if (newPassword.length < MIN_PASSWORD_LENGTH) return c.json({ error: `La password deve essere di almeno ${MIN_PASSWORD_LENGTH} caratteri` }, 400)
  if (newPassword.length > MAX_PASSWORD_LENGTH) return c.json({ error: 'Password troppo lunga' }, 400)

  const user = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1').bind(sub).first<{ password_hash: string }>()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const valid = await bcrypt.compare(currentPassword, user.password_hash)
  if (!valid) return c.json({ type: 'invalid-credentials', title: 'Unauthorized', status: 401, detail: 'Password attuale non corretta' }, 401)

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, sub).run()
  return c.json({ success: true })
})

// PUT /api/settings/avatar
settingsApp.put('/avatar', async (c) => {
  const { sub } = c.get('jwtPayload')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : null
  await c.env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').bind(avatarUrl, sub).run()
  return c.json({ success: true })
})

// GET /api/settings/sessions
settingsApp.get('/sessions', async (c) => {
  const { sub } = c.get('jwtPayload')
  const now = Math.floor(Date.now() / 1000)
  const result = await c.env.DB.prepare(
    `SELECT id, created_at, expires_at FROM refresh_tokens
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 20`
  ).bind(sub, now).all<SessionRow>()
  return c.json(result.results ?? [])
})

// DELETE /api/settings/sessions/:id
settingsApp.delete('/sessions/:id', async (c) => {
  const { sub } = c.get('jwtPayload')
  const sessionId = c.req.param('id')
  const now = Math.floor(Date.now() / 1000)
  const result = await c.env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(now, sessionId, sub).run()
  const changes = (result as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
  if (changes === 0) return c.json({ error: 'Sessione non trovata o già revocata' }, 404)
  return c.json({ success: true })
})

// GET /api/settings/activity
settingsApp.get('/activity', async (c) => {
  const { sub } = c.get('jwtPayload')
  const result = await c.env.DB.prepare(
    `SELECT id, action, entity_type, entity_slug, details, created_at
     FROM activity_logs WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 30`
  ).bind(sub).all<ActivityRow>()
  return c.json(result.results ?? [])
})

// GET /api/settings/storage
settingsApp.get('/storage', async (c) => {
  const stats = await c.env.DB.prepare(
    'SELECT COUNT(*) as file_count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM media_objects'
  ).first<{ file_count: number; total_bytes: number }>()

  // Collect all media keys referenced in file-type columns across all seeds
  const referencedKeys = new Set<string>()
  const seeds = Object.values(c.get('seedRegistry'))
  for (const seed of seeds) {
    const fileBranches = seed.branches.filter(b => b.type === 'file')
    if (fileBranches.length === 0) continue
    const cols = fileBranches.map(b => b.alias).join(', ')
    const rows = await c.env.DB.prepare(
      `SELECT ${cols} FROM content_${seed.slug}`
    ).all<Record<string, string | null>>()
    for (const row of rows.results ?? []) {
      const combined = Object.values(row).filter(Boolean).join(' ')
      for (const match of combined.matchAll(/\/api\/media\/([^"'\s\\,}\]]+)/g)) {
        referencedKeys.add(decodeURIComponent(match[1]))
      }
    }
  }

  const allMediaRows = await c.env.DB.prepare(
    'SELECT key, filename, mime_type, size_bytes, created_at FROM media_objects ORDER BY created_at DESC LIMIT 50'
  ).all<OrphanRow>()
  const orphanResults = (allMediaRows.results ?? []).filter(m => !referencedKeys.has(m.key))
  const orphans = { results: orphanResults }

  return c.json({
    totalBytes: stats?.total_bytes ?? 0,
    fileCount: stats?.file_count ?? 0,
    orphans: orphans.results ?? [],
  })
})

// GET /api/settings/notifications
settingsApp.get('/notifications', async (c) => {
  const { sub } = c.get('jwtPayload')
  const user = await c.env.DB.prepare(
    'SELECT notification_prefs FROM users WHERE id = ? LIMIT 1'
  ).bind(sub).first<{ notification_prefs: string }>()
  if (!user) return c.json({ error: 'User not found' }, 404)

  let prefs: Record<string, boolean>
  try { prefs = JSON.parse(user.notification_prefs || '{}') } catch { prefs = {} }

  return c.json({
    contentCreate: prefs.contentCreate ?? true,
    contentUpdate: prefs.contentUpdate ?? true,
    contentDelete: prefs.contentDelete ?? true,
    mediaUpload: prefs.mediaUpload ?? false,
  })
})

// PUT /api/settings/notifications
settingsApp.put('/notifications', async (c) => {
  const { sub } = c.get('jwtPayload')
  let body: Record<string, unknown>
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }

  const prefs = {
    contentCreate: body.contentCreate === true,
    contentUpdate: body.contentUpdate === true,
    contentDelete: body.contentDelete === true,
    mediaUpload: body.mediaUpload === true,
  }

  await c.env.DB.prepare('UPDATE users SET notification_prefs = ? WHERE id = ?').bind(JSON.stringify(prefs), sub).run()
  return c.json({ success: true })
})

export { settingsApp }
