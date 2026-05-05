/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'

const settingsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const BCRYPT_SALT_ROUNDS = 10

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

type MediaFileRow = {
  key: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: number
}


/**
 * GET /api/settings
 * Retrieves the general site configuration.
 */
settingsApp.get('/', async (context) => {
  // General site configuration. 
  // In the future, these could be loaded from a 'system_settings' table in D1.
  return context.json({
    siteTitle: 'Beech CMS',
    siteLogo: '/beechLogoDark.svg',
    defaultLanguage: 'it',
    dateFormat: context.env.DATE_FORMAT || 'DD-MM-YYYY',
    features: {
      drafts: true,
      media: true,
      search: true,
      activityLog: true
    }
  })
})

/**
 * GET /api/settings/me
 * Retrieves the currently authenticated user's profile and preferences.
 */
settingsApp.get('/me', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  const currentUser = await context.env.DB.prepare(
    'SELECT id, email, name, avatar_url, notification_prefs FROM users WHERE id = ? LIMIT 1'
  ).bind(userId).first<Omit<UserRow, 'password_hash'>>()
  
  if (!currentUser) {
    return context.json({ error: 'User not found' }, 404)
  }

  let notificationPreferences: Record<string, boolean>
  try {
    notificationPreferences = JSON.parse(currentUser.notification_prefs || '{}')
  } catch {
    notificationPreferences = {}
  }

  return context.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    avatarUrl: currentUser.avatar_url,
    notificationPrefs: {
      contentCreate: notificationPreferences.contentCreate ?? true,
      contentUpdate: notificationPreferences.contentUpdate ?? true,
      contentDelete: notificationPreferences.contentDelete ?? true,
      mediaUpload: notificationPreferences.mediaUpload ?? false,
    },
  })
})

/**
 * PUT /api/settings/profile
 * Updates the user's name and email address.
 */
settingsApp.put('/profile', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  let payload: Record<string, unknown>
  try {
    payload = await context.req.json()
  } catch {
    return context.json({ error: 'Invalid JSON body' }, 400)
  }

  const nameInput = typeof payload.name === 'string' ? payload.name.trim() : null
  const emailInput = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null

  if (emailInput !== null && !EMAIL_VALIDATION_REGEX.test(emailInput)) {
    return context.json({ 
      type: 'bad-request', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Invalid email format' 
    }, 400)
  }
  
  if (nameInput !== null && nameInput.length > 100) {
    return context.json({ 
      type: 'bad-request', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Name is too long (maximum 100 characters)' 
    }, 400)
  }

  const fieldsToUpdate: string[] = []
  const valuesToUpdate: unknown[] = []
  
  if (nameInput !== null) {
    fieldsToUpdate.push('name = ?')
    valuesToUpdate.push(nameInput)
  }
  
  if (emailInput !== null) {
    fieldsToUpdate.push('email = ?')
    valuesToUpdate.push(emailInput)
  }
  
  if (fieldsToUpdate.length === 0) {
    return context.json({ error: 'No fields to update' }, 400)
  }

  // Check if the new email is already taken by another user
  if (emailInput !== null) {
    const existingUserWithEmail = await context.env.DB.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1'
    ).bind(emailInput, userId).first()
    
    if (existingUserWithEmail) {
      return context.json({ 
        type: 'conflict', 
        title: 'Conflict', 
        status: 409, 
        detail: 'Email address is already in use' 
      }, 409)
    }
  }

  valuesToUpdate.push(userId)
  await context.env.DB.prepare(
    `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`
  ).bind(...valuesToUpdate).run()
  
  return context.json({ success: true })
})

/**
 * PUT /api/settings/password
 * Updates the user's password after verifying the current one.
 */
settingsApp.put('/password', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  let payload: Record<string, unknown>
  try {
    payload = await context.req.json()
  } catch {
    return context.json({ error: 'Invalid JSON body' }, 400)
  }

  const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : ''
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : ''

  if (!currentPassword || !newPassword) {
    return context.json({ error: 'Both currentPassword and newPassword are required' }, 400)
  }
  
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return context.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` }, 400)
  }
  
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return context.json({ error: 'Password is too long' }, 400)
  }

  const userRecord = await context.env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ? LIMIT 1'
  ).bind(userId).first<{ password_hash: string }>()
  
  if (!userRecord) {
    return context.json({ error: 'User not found' }, 404)
  }

  const isPasswordCorrect = await bcrypt.compare(currentPassword, userRecord.password_hash)
  if (!isPasswordCorrect) {
    return context.json({ 
      type: 'invalid-credentials', 
      title: 'Unauthorized', 
      status: 401, 
      detail: 'Current password is incorrect' 
    }, 401)
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS)
  await context.env.DB.prepare(
    'UPDATE users SET password_hash = ? WHERE id = ?'
  ).bind(hashedNewPassword, userId).run()
  
  return context.json({ success: true })
})

/**
 * PUT /api/settings/avatar
 * Updates the user's avatar URL.
 */
settingsApp.put('/avatar', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  let payload: Record<string, unknown>
  try {
    payload = await context.req.json()
  } catch {
    return context.json({ error: 'Invalid JSON body' }, 400)
  }

  const avatarUrl = typeof payload.avatarUrl === 'string' ? payload.avatarUrl.trim() : null
  
  await context.env.DB.prepare(
    'UPDATE users SET avatar_url = ? WHERE id = ?'
  ).bind(avatarUrl, userId).run()
  
  return context.json({ success: true })
})

/**
 * GET /api/settings/sessions
 * Retrieves a list of active refresh tokens for the user.
 */
settingsApp.get('/sessions', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  const currentTimestamp = Math.floor(Date.now() / 1000)
  
  const sessionsResult = await context.env.DB.prepare(
    `SELECT id, created_at, expires_at FROM refresh_tokens
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC LIMIT 20`
  ).bind(userId, currentTimestamp).all<SessionRow>()
  
  return context.json(sessionsResult.results ?? [])
})

/**
 * DELETE /api/settings/sessions/:id
 * Revokes a specific refresh token (session).
 */
settingsApp.delete('/sessions/:id', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  const sessionId = context.req.param('id')
  const currentTimestamp = Math.floor(Date.now() / 1000)
  
  const dbUpdateResult = await context.env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(currentTimestamp, sessionId, userId).run()
  
  const affectedRowsCount = (dbUpdateResult as unknown as { meta?: { changes?: number } })?.meta?.changes ?? 0
  
  if (affectedRowsCount === 0) {
    return context.json({ error: 'Session not found or already revoked' }, 404)
  }
  
  return context.json({ success: true })
})

/**
 * GET /api/settings/activity
 * Retrieves the latest activity logs for the user.
 */
settingsApp.get('/activity', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  const activityLogsResult = await context.env.DB.prepare(
    `SELECT id, action, entity_type, entity_slug, details, created_at
     FROM activity_logs WHERE user_id = ?
     ORDER BY created_at DESC LIMIT 30`
  ).bind(userId).all<ActivityRow>()
  
  return context.json(activityLogsResult.results ?? [])
})

/**
 * GET /api/settings/storage
 * Calculates storage usage and identifies orphaned media files.
 */
settingsApp.get('/storage', async (context) => {
  const mediaRepo = context.get('mediaRepository')
  const statsRepo = context.get('systemStatsRepository')
  
  const totalStorageUsedBytes = await statsRepo.getStorageUsage()
  const totalFileCount = await mediaRepo.count()

  // Collect all media keys referenced in file-type columns across all seeds
  const referencedMediaKeys = new Set<string>()
  const registeredSeeds = Object.values(context.get('seedRegistry'))
  
  for (const seed of registeredSeeds) {
    const mediaFields = seed.branches.filter(branch => branch.type === 'file')
    if (mediaFields.length === 0) continue
    
    const mediaColumns = mediaFields.map(field => field.alias).join(', ')
    const contentData = await context.env.DB.prepare(
      `SELECT ${mediaColumns} FROM content_${seed.slug}`
    ).all<Record<string, string | null>>()
    
    for (const contentRow of contentData.results ?? []) {
      const rowContentString = Object.values(contentRow).filter(Boolean).join(' ')
      // Simple regex to find media keys in stored URLs or strings
      for (const keyMatch of rowContentString.matchAll(/\/api\/media\/([^"'\s\\,}\]]+)/g)) {
        referencedMediaKeys.add(decodeURIComponent(keyMatch[1]))
      }
    }
  }

  const { items: allMediaRows } = await mediaRepo.list({ limit: 50, offset: 0 })
  const orphanedMediaFiles = allMediaRows.filter(mediaFile => !referencedMediaKeys.has(mediaFile.key))

  return context.json({
    totalBytes: totalStorageUsedBytes,
    fileCount: totalFileCount,
    orphans: orphanedMediaFiles,
  })
})

/**
 * GET /api/settings/notifications
 * Retrieves the user's notification preferences.
 */
settingsApp.get('/notifications', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  const userRecord = await context.env.DB.prepare(
    'SELECT notification_prefs FROM users WHERE id = ? LIMIT 1'
  ).bind(userId).first<{ notification_prefs: string }>()
  
  if (!userRecord) {
    return context.json({ error: 'User not found' }, 404)
  }

  let userPreferences: Record<string, boolean>
  try {
    userPreferences = JSON.parse(userRecord.notification_prefs || '{}')
  } catch {
    userPreferences = {}
  }

  return context.json({
    contentCreate: userPreferences.contentCreate ?? true,
    contentUpdate: userPreferences.contentUpdate ?? true,
    contentDelete: userPreferences.contentDelete ?? true,
    mediaUpload: userPreferences.mediaUpload ?? false,
  })
})

/**
 * PUT /api/settings/notifications
 * Updates the user's notification preferences.
 */
settingsApp.put('/notifications', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  
  let payload: Record<string, unknown>
  try {
    payload = await context.req.json()
  } catch {
    return context.json({ error: 'Invalid JSON body' }, 400)
  }

  const newPreferences = {
    contentCreate: payload.contentCreate === true,
    contentUpdate: payload.contentUpdate === true,
    contentDelete: payload.contentDelete === true,
    mediaUpload: payload.mediaUpload === true,
  }

  await context.env.DB.prepare(
    'UPDATE users SET notification_prefs = ? WHERE id = ?'
  ).bind(JSON.stringify(newPreferences), userId).run()
  
  return context.json({ success: true })
})

export { settingsApp }

