/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { z } from 'zod'
import type { Env, Variables } from '../../types'

const DashboardConfigSchema = z.record(z.string(), z.unknown());

const settingsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const SESSION_LIST_LIMIT = 20
const ACTIVITY_LOG_LIMIT = 30

/**
 * GET /api/settings
 * Retrieves the general site configuration.
 */
settingsApp.get('/', async (context) => {
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

  const currentUser = await context.get('userRepository').findById(userId)
  if (!currentUser) {
    return context.json({ error: 'User not found' }, 404)
  }

  let notificationPreferences: Record<string, boolean>
  try {
    notificationPreferences = JSON.parse(currentUser.notificationPreferences || '{}')
  } catch {
    notificationPreferences = {}
  }

  return context.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    avatarUrl: currentUser.avatarUrl,
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
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Invalid email format' }, 400)
  }

  if (nameInput !== null && nameInput.length > 100) {
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Name is too long (maximum 100 characters)' }, 400)
  }

  const hasNoFields = nameInput === null && emailInput === null
  if (hasNoFields) {
    return context.json({ error: 'No fields to update' }, 400)
  }

  if (emailInput !== null) {
    const emailTaken = await context.get('userRepository').emailBelongsToAnotherUser(emailInput, userId)
    if (emailTaken) {
      return context.json({ type: 'conflict', title: 'Conflict', status: 409, detail: 'Email address is already in use' }, 409)
    }
  }

  const fieldsToUpdate: { name?: string; email?: string } = {}
  if (nameInput !== null) fieldsToUpdate.name = nameInput
  if (emailInput !== null) fieldsToUpdate.email = emailInput

  await context.get('userRepository').updateProfile(userId, fieldsToUpdate)
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

  const userRecord = await context.get('userRepository').findById(userId)
  if (!userRecord) {
    return context.json({ error: 'User not found' }, 404)
  }

  const hashProvider = context.get('hashProvider')
  const isPasswordCorrect = await hashProvider.verify(currentPassword, userRecord.passwordHash)
  if (!isPasswordCorrect) {
    return context.json({ type: 'invalid-credentials', title: 'Unauthorized', status: 401, detail: 'Current password is incorrect' }, 401)
  }

  const hashedNewPassword = await hashProvider.hash(newPassword)
  await context.get('userRepository').updatePasswordHash(userId, hashedNewPassword)
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
  await context.get('userRepository').updateAvatarUrl(userId, avatarUrl)
  return context.json({ success: true })
})

/**
 * GET /api/settings/sessions
 * Retrieves a list of active refresh tokens for the user.
 */
settingsApp.get('/sessions', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  const nowTimestamp = Math.floor(Date.now() / 1000)
  const sessions = await context.get('sessionRepository').listActiveForUser(userId, nowTimestamp, SESSION_LIST_LIMIT)
  return context.json(sessions)
})

/**
 * DELETE /api/settings/sessions/:id
 * Revokes a specific refresh token (session).
 */
settingsApp.delete('/sessions/:id', async (context) => {
  const { sub: userId } = context.get('jwtPayload')
  const sessionId = context.req.param('id')
  const nowTimestamp = Math.floor(Date.now() / 1000)

  const wasRevoked = await context.get('sessionRepository').revokeById(sessionId, userId, nowTimestamp)
  if (!wasRevoked) {
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

  const entries = await context.get('activityLogRepository').list({
    userId,
    limit: ACTIVITY_LOG_LIMIT,
  })

  // Preserve legacy snake_case shape consumed by the dashboard activity tab.
  const responseEntries = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entity_type: entry.entityType,
    entity_slug: entry.entitySlug,
    details: entry.details ? JSON.stringify(entry.details) : null,
    created_at: entry.createdAt,
  }))

  return context.json(responseEntries)
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

  const registeredSeeds = context.get('seedRegistry').all()
  const referencedMediaKeys = await context.get('contentScanRepository').getReferencedMediaKeys(registeredSeeds)

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

  const userRecord = await context.get('userRepository').findById(userId)
  if (!userRecord) {
    return context.json({ error: 'User not found' }, 404)
  }

  let userPreferences: Record<string, boolean>
  try {
    userPreferences = JSON.parse(userRecord.notificationPreferences || '{}')
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

  await context.get('userRepository').updateNotificationPreferences(userId, JSON.stringify(newPreferences))
  return context.json({ success: true })
})

/**
 * GET /api/settings/dashboard
 * Retrieves the dashboard configuration.
 */
settingsApp.get('/dashboard', async (c) => {
  const repo = c.get('settingsRepository')
  const config = await repo.getDashboardConfig()
  return c.json({ data: config })
})

/**
 * PUT /api/settings/dashboard
 * Updates the dashboard configuration.
 */
settingsApp.put('/dashboard', async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return c.json({ error: 'Unsupported Media Type' }, 415);
  }

  const body = await c.req.json().catch(() => null)

  const parsed = DashboardConfigSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400)
  }

  const repo = c.get('settingsRepository')
  await repo.putDashboardConfig(parsed.data)
  return c.json({ success: true }, 200)
})

export { settingsApp }
