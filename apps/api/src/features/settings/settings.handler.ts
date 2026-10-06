// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { isLocaleCode, resolveLocaleConfig, sha256hex, type SiteSettings } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { manageableScopes, serializeEffectivePermissions } from '../../shared/rbac/scoped-projection'
import { deleteR2Objects } from '../../shared/storage/upload'

const settingsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

const EMAIL_VALIDATION_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
/** bcrypt hasha solo i primi 72 byte UTF-8; oltre viene ignorato silenziosamente */
const MAX_PASSWORD_BYTES = 72
const SESSION_LIST_LIMIT = 20
const ACTIVITY_LOG_LIMIT = 30
const STORAGE_ORPHAN_PAGE_LIMIT = 50
const STORAGE_MEDIA_SCAN_BATCH = 200
/** Upper bound on content locales: each localized value holds one validated value per locale. */
const MAX_LOCALES = 50

/**
 * GET /api/settings
 * Retrieves the general site configuration from the database.
 */
settingsApp.get('/', async (context) => {
  const s = await context.get('siteSettingsRepository').getAll()
  const localeConfig = resolveLocaleConfig(s)
  return context.json({
    siteTitle: s.siteTitle,
    siteLogo: '/beechLogoDark.svg',
    defaultLanguage: s.defaultLanguage,
    locales: localeConfig.locales,
    defaultLocale: localeConfig.defaultLocale,
    timezone: s.timezone,
    currency: s.currency,
    company: {
      name: s.companyName,
      website: s.companyWebsite,
      abbreviation: s.companyAbbreviation,
    },
    dateFormat: context.env.DATE_FORMAT || 'DD-MM-YYYY',
    features: {
      drafts: true,
      media: true,
      search: true,
      activityLog: true,
      email: context.env.EMAIL_PROVIDER === 'smtp' || !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY),
    },
  })
})

/**
 * PUT /api/settings
 * Updates the general site configuration in the database.
 */
settingsApp.put('/', async (context) => {
  let payload: Record<string, unknown>
  try {
    payload = await context.req.json()
  } catch {
    return context.json({ error: 'Invalid JSON body' }, 400)
  }

  const siteTitle = typeof payload.siteTitle === 'string' ? payload.siteTitle.trim() : undefined
  const defaultLanguage = typeof payload.defaultLanguage === 'string' ? payload.defaultLanguage.trim() : undefined
  const timezone = typeof payload.timezone === 'string' ? payload.timezone.trim() : undefined
  const currency = typeof payload.currency === 'string' ? payload.currency.trim() : undefined

  let companyName: string | undefined | null = undefined
  let companyWebsite: string | undefined | null = undefined
  let companyAbbreviation: string | undefined | null = undefined

  if (payload.company !== undefined) {
    if (payload.company === null) {
      companyName = null
      companyWebsite = null
      companyAbbreviation = null
    } else if (typeof payload.company === 'object') {
      const company = payload.company as Record<string, unknown>
      companyName = typeof company.name === 'string' ? company.name.trim() : (company.name === null ? null : undefined)
      companyWebsite = typeof company.website === 'string' ? (company.website.trim() || null) : (company.website === null ? null : undefined)
      companyAbbreviation = typeof company.abbreviation === 'string' ? (company.abbreviation.trim() || null) : (company.abbreviation === null ? null : undefined)
    }
  }

  if (defaultLanguage !== undefined && !['it', 'en'].includes(defaultLanguage)) {
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Invalid default language (must be it or en)' }, 400)
  }

  if (companyWebsite && companyWebsite !== '') {
    try {
      new URL(companyWebsite)
    } catch {
      return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Invalid company website URL' }, 400)
    }
  }

  const hasLocales = payload.locales !== undefined
  const hasDefaultLocale = payload.defaultLocale !== undefined
  let nextLocales: string[] | undefined
  let nextDefaultLocale: string | undefined
  if (hasLocales || hasDefaultLocale) {
    const localesInput = payload.locales
    if (hasLocales && (
      !Array.isArray(localesInput) || localesInput.length === 0 || localesInput.length > MAX_LOCALES ||
      !localesInput.every(isLocaleCode) || new Set(localesInput).size !== localesInput.length
    )) {
      return context.json({ type: 'settings-invalid-locales', title: 'Bad Request', status: 400, detail: `locales must be 1–${MAX_LOCALES} distinct locale codes (e.g. "it", "pt-BR")` }, 400)
    }
    if (hasDefaultLocale && !isLocaleCode(payload.defaultLocale)) {
      return context.json({ type: 'settings-invalid-default-locale', title: 'Bad Request', status: 400, detail: 'defaultLocale must be a locale code (e.g. "it", "pt-BR")' }, 400)
    }
    const current = resolveLocaleConfig(await context.get('siteSettingsRepository').getAll())
    nextLocales = hasLocales ? (localesInput as string[]) : [...current.locales]
    nextDefaultLocale = hasDefaultLocale ? (payload.defaultLocale as string) : current.defaultLocale
    if (!nextLocales.includes(nextDefaultLocale)) {
      return context.json({ type: 'settings-default-locale-not-in-locales', title: 'Bad Request', status: 400, detail: `defaultLocale '${nextDefaultLocale}' must be one of locales` }, 400)
    }
  }

  const fieldsToUpdate: Partial<SiteSettings> = {}
  if (siteTitle !== undefined) fieldsToUpdate.siteTitle = siteTitle
  if (defaultLanguage !== undefined) fieldsToUpdate.defaultLanguage = defaultLanguage
  if (timezone !== undefined) fieldsToUpdate.timezone = timezone
  if (currency !== undefined) fieldsToUpdate.currency = currency
  if (companyName !== undefined) fieldsToUpdate.companyName = companyName
  if (companyWebsite !== undefined) fieldsToUpdate.companyWebsite = companyWebsite
  if (companyAbbreviation !== undefined) fieldsToUpdate.companyAbbreviation = companyAbbreviation

  // If companyName is updated and siteTitle isn't specified, sync siteTitle
  if (companyName && siteTitle === undefined) {
    fieldsToUpdate.siteTitle = companyName
  }

  // Both keys are persisted together so, once configured, content locales no longer follow the dashboard
  // UI language (defaultLanguage). Removing a locale only rewrites this setting: stored translations in
  // that locale stay in their dictionaries (brief §2, no data loss).
  if (nextLocales !== undefined && nextDefaultLocale !== undefined) {
    fieldsToUpdate.locales = nextLocales
    fieldsToUpdate.defaultLocale = nextDefaultLocale
  }

  await context.get('siteSettingsRepository').setMany(fieldsToUpdate)
  return context.json({ success: true })
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

  let avatarUrl = currentUser.avatarUrl
  if (!avatarUrl && currentUser.email) {
    const emailHash = await sha256hex(currentUser.email.trim().toLowerCase())
    avatarUrl = `https://gravatar.com/avatar/${emailHash}?d=mp`
  }

  const effective = await resolveEffectivePermissions(context)
  const seedRegistry = context.get('seedRegistry')

  return context.json({
    id: currentUser.id,
    email: currentUser.email,
    name: currentUser.name,
    surname: currentUser.surname,
    avatarUrl,
    notificationPrefs: {
      contentCreate: notificationPreferences.contentCreate ?? true,
      contentUpdate: notificationPreferences.contentUpdate ?? true,
      contentDelete: notificationPreferences.contentDelete ?? true,
      mediaUpload: notificationPreferences.mediaUpload ?? false,
    },
    /** The caller's raw RBAC authority. Sprint 6 derives every UI visibility rule from
     *  this and from nothing else. */
    permissions: serializeEffectivePermissions(effective),
    /** Developer/owner axis (`users.role === 'admin'`), orthogonal to RBAC and NOT a
     *  permission: `manage_seeds` does not exist and must never exist (brief §2). Gates
     *  the Seed Builder surface only. */
    isDeveloper: currentUser.role === 'admin',
    /** Scopes this caller may ASSIGN on (`'*'` + slugs for a global `manage_users`
     *  holder; own scopes for a scoped one; `[]` otherwise). NOT derivable from
     *  `GET /api/schema`, which is filtered by `content:read`. */
    manageableScopes: manageableScopes(effective, seedRegistry.all()),
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
  const surnameInput = typeof payload.surname === 'string' ? payload.surname.trim() : null
  const emailInput = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null

  if (emailInput !== null && !EMAIL_VALIDATION_REGEX.test(emailInput)) {
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Invalid email format' }, 400)
  }

  if (nameInput !== null && nameInput.length > 100) {
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Name is too long (maximum 100 characters)' }, 400)
  }

  if (surnameInput !== null && surnameInput.length > 100) {
    return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail: 'Surname is too long (maximum 100 characters)' }, 400)
  }

  const hasNoFields = nameInput === null && surnameInput === null && emailInput === null
  if (hasNoFields) {
    return context.json({ error: 'No fields to update' }, 400)
  }

  if (emailInput !== null) {
    const emailTaken = await context.get('userRepository').emailBelongsToAnotherUser(emailInput, userId)
    if (emailTaken) {
      return context.json({ type: 'conflict', title: 'Conflict', status: 409, detail: 'Email address is already in use' }, 409)
    }
  }

  const fieldsToUpdate: { name?: string; surname?: string; email?: string } = {}
  if (nameInput !== null) fieldsToUpdate.name = nameInput
  if (surnameInput !== null) fieldsToUpdate.surname = surnameInput
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
  if (new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) {
    return context.json({ error: `Password must not exceed ${MAX_PASSWORD_BYTES} bytes when UTF-8 encoded` }, 400)
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
  await context.get('userRepository').changePasswordAndRevokeSessions(userId, hashedNewPassword, context.get('clock').nowSeconds())
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
  const requestedLimit = context.req.query('limit') ?? String(STORAGE_ORPHAN_PAGE_LIMIT)
  const requestedOffset = context.req.query('offset') ?? '0'
  const limit = Number(requestedLimit)
  const offset = Number(requestedOffset)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > STORAGE_ORPHAN_PAGE_LIMIT ||
      !Number.isSafeInteger(offset) || offset < 0) {
    return context.json({ type: 'settings-storage-invalid-pagination' }, 400)
  }

  const mediaRepo = context.get('mediaRepository')
  const statsRepo = context.get('systemStatsRepository')

  const totalStorageUsedBytes = await statsRepo.getStorageUsage()
  const totalFileCount = await mediaRepo.count()

  const registeredSeeds = context.get('seedRegistry').all()
  const referencedMediaKeys = await context.get('contentScanRepository').getReferencedMediaKeys(registeredSeeds)

  const orphans: Awaited<ReturnType<typeof mediaRepo.list>>['items'] = []
  let orphanTotal = 0
  let orphanBytes = 0
  for (let mediaOffset = 0; mediaOffset < totalFileCount; mediaOffset += STORAGE_MEDIA_SCAN_BATCH) {
    const { items } = await mediaRepo.list({ limit: STORAGE_MEDIA_SCAN_BATCH, offset: mediaOffset })
    for (const mediaFile of items) {
      if (referencedMediaKeys.has(mediaFile.key)) continue
      if (orphanTotal >= offset && orphans.length < limit) orphans.push(mediaFile)
      orphanTotal++
      orphanBytes += mediaFile.size_bytes
    }
    if (items.length < STORAGE_MEDIA_SCAN_BATCH) break
  }

  return context.json({
    totalBytes: totalStorageUsedBytes,
    fileCount: totalFileCount,
    orphans,
    orphanTotal,
    orphanBytes,
    orphanOffset: offset,
    orphanLimit: limit,
  })
})

/**
 * POST /api/settings/storage/orphans/delete
 * Deletes orphans a reviewer selected from the storage report. Every key is re-checked first:
 * one that is untracked, referenced again, or not the caller's to delete refuses the whole selection.
 */
settingsApp.post('/storage/orphans/delete', async (context) => {
  let payload: unknown
  try {
    payload = await context.req.json()
  } catch {
    payload = null
  }
  const keys = (payload as { keys?: unknown } | null)?.keys
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > STORAGE_ORPHAN_PAGE_LIMIT ||
      !keys.every(key => typeof key === 'string' && key.length > 0) || new Set(keys).size !== keys.length) {
    return context.json({ type: 'settings-storage-invalid-orphan-keys' }, 400)
  }
  const selectedKeys = keys as string[]

  const mediaRepo = context.get('mediaRepository')
  const mediaFiles = await Promise.all(selectedKeys.map(key => mediaRepo.getByKey(key)))
  const untrackedKeys = selectedKeys.filter((_, index) => !mediaFiles[index])
  if (untrackedKeys.length > 0) {
    return context.json({ type: 'settings-storage-orphan-not-found', keys: untrackedKeys }, 404)
  }

  // Same owner-or-admin rule as DELETE /api/upload/:key.
  const { sub: userId, role } = context.get('jwtPayload')
  const foreignKeys = role === 'admin' ? [] : selectedKeys.filter((_, index) => mediaFiles[index]?.uploaded_by !== userId)
  if (foreignKeys.length > 0) {
    return context.json({ type: 'settings-storage-orphan-forbidden', keys: foreignKeys }, 403)
  }

  const referencedMediaKeys = await context.get('contentScanRepository').getReferencedMediaKeys(context.get('seedRegistry').all())
  const referencedKeys = selectedKeys.filter(key => referencedMediaKeys.has(key))
  if (referencedKeys.length > 0) {
    return context.json({ type: 'settings-storage-orphan-referenced', keys: referencedKeys }, 409)
  }

  // Decrements the storage counter by each deleted file's tracked size.
  await deleteR2Objects(context, selectedKeys)

  return context.json({
    deleted: selectedKeys,
    totalBytes: await context.get('systemStatsRepository').getStorageUsage(),
    fileCount: await mediaRepo.count(),
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

export { settingsApp }
