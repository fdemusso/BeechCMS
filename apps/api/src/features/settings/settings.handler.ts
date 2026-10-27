// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context } from 'hono'
import type { z } from 'zod'
import { MAX_RETENTION_DAYS, resolveLocaleConfig, sha256hex, type SiteSettings } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { manageableScopes, serializeEffectivePermissions } from '../../shared/rbac/scoped-projection'
import { deleteR2Objects } from '../../shared/storage/upload'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import {
  MAX_LOCALES,
  STORAGE_ORPHAN_PAGE_LIMIT,
  changePasswordRequestSchema,
  deleteOrphansRequestSchema,
  storageQuerySchema,
  updateAvatarRequestSchema,
  updateNotificationPrefsRequestSchema,
  updateProfileRequestSchema,
  updateSettingsRequestSchema,
} from './settings.schema'


const SESSION_LIST_LIMIT = 20
const ACTIVITY_LOG_LIMIT = 30
const STORAGE_MEDIA_SCAN_BATCH = 200

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/** Every body route refuses a body that is not a JSON object (syntax error, `null`, array, scalar) the same way. */
function isNotAnObject(error: z.ZodError): boolean {
  return error.issues.some((issue) => issue.path.length === 0)
}

function badRequest(context: AppContext, detail: string) {
  return context.json({ type: 'bad-request', title: 'Bad Request', status: 400, detail }, 400)
}

/** First issue wins: the schema keys are ordered like the checks the handler used to make. */
function rejectInvalidSettings(context: AppContext, error: z.ZodError) {
  if (isNotAnObject(error)) return context.json({ error: 'Invalid JSON body' }, 400)
  const [field, subfield] = error.issues[0].path
  if (field === 'defaultLanguage') return badRequest(context, 'Invalid default language (must be it or en)')
  if (field === 'company' && subfield === 'website') return badRequest(context, 'Invalid company website URL')
  if (field === 'locales') {
    return context.json({ type: 'settings-invalid-locales', title: 'Bad Request', status: 400, detail: `locales must be 1–${MAX_LOCALES} distinct locale codes (e.g. "it", "pt-BR")` }, 400)
  }
  if (field === 'defaultLocale') {
    return context.json({ type: 'settings-invalid-default-locale', title: 'Bad Request', status: 400, detail: 'defaultLocale must be a locale code (e.g. "it", "pt-BR")' }, 400)
  }
  if (field === 'trashRetentionDays') {
    return context.json({ type: 'settings-invalid-trash-retention', title: 'Bad Request', status: 400, detail: `trashRetentionDays must be an integer between 0 and ${MAX_RETENTION_DAYS} (0 = never purge)` }, 400)
  }
  return badRequest(context, `Invalid value for '${String(field)}'`)
}

function rejectInvalidProfile(context: AppContext, error: z.ZodError) {
  if (isNotAnObject(error)) return context.json({ error: 'Invalid JSON body' }, 400)
  const field = error.issues[0].path[0]
  if (field === 'email') return badRequest(context, 'Invalid email format')
  if (field === 'name') return badRequest(context, 'Name is too long (maximum 100 characters)')
  if (field === 'surname') return badRequest(context, 'Surname is too long (maximum 100 characters)')
  return badRequest(context, `Invalid value for '${String(field)}'`)
}

/** The messages live in the schema; a body that is not an object is the only refusal without one. */
function rejectInvalidPasswordChange(context: AppContext, error: z.ZodError) {
  if (isNotAnObject(error)) return context.json({ error: 'Invalid JSON body' }, 400)
  return context.json({ error: error.issues[0].message }, 400)
}

function rejectInvalidBody(context: AppContext, error: z.ZodError) {
  return context.json({ error: isNotAnObject(error) ? 'Invalid JSON body' : error.issues[0].message }, 400)
}

function rejectInvalidOrphanKeys(context: AppContext) {
  return context.json({ type: 'settings-storage-invalid-orphan-keys' }, 400)
}

const settingsApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * GET /api/settings
   * Retrieves the general site configuration from the database.
   */
  .get('/', async (context) => {
    const s = await context.get('siteSettingsRepository').getAll()
    const localeConfig = resolveLocaleConfig(s)
    return context.json({
      siteTitle: s.siteTitle,
      siteLogo: '/beechLogoDark.svg',
      defaultLanguage: s.defaultLanguage,
      // A copy: `readonly` is the config's own guard and would otherwise leak into the client's type.
      locales: [...localeConfig.locales],
      defaultLocale: localeConfig.defaultLocale,
      timezone: s.timezone,
      currency: s.currency,
      trashRetentionDays: s.trashRetentionDays,
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
    }, 200)
  })

  /**
   * PUT /api/settings
   * Updates the general site configuration in the database.
   */
  .put('/', zodJson(updateSettingsRequestSchema, rejectInvalidSettings), async (context) => {
    const payload = context.req.valid('json')
    const { siteTitle, defaultLanguage, timezone, currency } = payload

    let companyName: string | undefined | null = undefined
    let companyWebsite: string | undefined | null = undefined
    let companyAbbreviation: string | undefined | null = undefined

    if (payload.company === null) {
      companyName = null
      companyWebsite = null
      companyAbbreviation = null
    } else if (payload.company !== undefined) {
      // The schema already trimmed these; an emptied website or abbreviation clears the column.
      companyName = payload.company.name
      companyWebsite = payload.company.website === undefined ? undefined : (payload.company.website || null)
      companyAbbreviation = payload.company.abbreviation === undefined ? undefined : (payload.company.abbreviation || null)
    }

    let nextLocales: string[] | undefined
    let nextDefaultLocale: string | undefined
    if (payload.locales !== undefined || payload.defaultLocale !== undefined) {
      const current = resolveLocaleConfig(await context.get('siteSettingsRepository').getAll())
      nextLocales = payload.locales ?? [...current.locales]
      nextDefaultLocale = payload.defaultLocale ?? current.defaultLocale
      if (!nextLocales.includes(nextDefaultLocale)) {
        return context.json({ type: 'settings-default-locale-not-in-locales', title: 'Bad Request', status: 400, detail: `defaultLocale '${nextDefaultLocale}' must be one of locales` }, 400)
      }
    }

    const fieldsToUpdate: Partial<SiteSettings> = {}
    if (payload.trashRetentionDays !== undefined) fieldsToUpdate.trashRetentionDays = payload.trashRetentionDays
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
    return context.json({ success: true }, 200)
  })

  /**
   * GET /api/settings/me
   * Retrieves the currently authenticated user's profile and preferences.
   */
  .get('/me', async (context) => {
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
    }, 200)
  })

  /**
   * PUT /api/settings/profile
   * Updates the user's name and email address.
   */
  .put('/profile', zodJson(updateProfileRequestSchema, rejectInvalidProfile), async (context) => {
    const { sub: userId } = context.get('jwtPayload')

    const { name: nameInput = null, surname: surnameInput = null, email: emailInput = null } = context.req.valid('json')

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
    return context.json({ success: true }, 200)
  })

  /**
   * PUT /api/settings/password
   * Updates the user's password after verifying the current one.
   */
  .put('/password', zodJson(changePasswordRequestSchema, rejectInvalidPasswordChange), async (context) => {
    const { sub: userId } = context.get('jwtPayload')

    const { currentPassword, newPassword } = context.req.valid('json')

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
    return context.json({ success: true }, 200)
  })

  /**
   * PUT /api/settings/avatar
   * Updates the user's avatar URL.
   */
  .put('/avatar', zodJson(updateAvatarRequestSchema, rejectInvalidBody), async (context) => {
    const { sub: userId } = context.get('jwtPayload')

    const { avatarUrl } = context.req.valid('json')
    await context.get('userRepository').updateAvatarUrl(userId, avatarUrl)
    return context.json({ success: true }, 200)
  })

  /**
   * GET /api/settings/sessions
   * Retrieves a list of active refresh tokens for the user.
   */
  .get('/sessions', async (context) => {
    const { sub: userId } = context.get('jwtPayload')
    const nowTimestamp = context.get('clock').nowSeconds()
    const sessions = await context.get('sessionRepository').listActiveForUser(userId, nowTimestamp, SESSION_LIST_LIMIT)

    // Dashboard Session contract is snake_case, same as the activity endpoint below.
    return context.json(sessions.map((session) => ({
      id: session.id,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
    })), 200)
  })

  /**
   * DELETE /api/settings/sessions/:id
   * Revokes a specific refresh token (session).
   */
  .delete('/sessions/:id', async (context) => {
    const { sub: userId } = context.get('jwtPayload')
    const sessionId = context.req.param('id')
    const nowTimestamp = context.get('clock').nowSeconds()

    const wasRevoked = await context.get('sessionRepository').revokeById(sessionId, userId, nowTimestamp)
    if (!wasRevoked) {
      return context.json({ error: 'Session not found or already revoked' }, 404)
    }

    return context.json({ success: true }, 200)
  })

  /**
   * GET /api/settings/activity
   * Retrieves the latest activity logs for the user.
   */
  .get('/activity', async (context) => {
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

    return context.json(responseEntries, 200)
  })

  /**
   * GET /api/settings/storage
   * Calculates storage usage and identifies orphaned media files.
   */
  .get('/storage', zodQuery(storageQuerySchema), async (context) => {
    const query = context.req.valid('query')
    const requestedLimit = query.limit ?? String(STORAGE_ORPHAN_PAGE_LIMIT)
    const requestedOffset = query.offset ?? '0'
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
    }, 200)
  })

  /**
   * POST /api/settings/storage/orphans/delete
   * Deletes orphans a reviewer selected from the storage report. Every key is re-checked first:
   * one that is untracked, referenced again, or not the caller's to delete refuses the whole selection.
   */
  .post('/storage/orphans/delete', zodJson(deleteOrphansRequestSchema, rejectInvalidOrphanKeys), async (context) => {
    const { keys: selectedKeys } = context.req.valid('json')

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
    }, 200)
  })

  /**
   * GET /api/settings/notifications
   * Retrieves the user's notification preferences.
   */
  .get('/notifications', async (context) => {
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
    }, 200)
  })

  /**
   * PUT /api/settings/notifications
   * Updates the user's notification preferences.
   */
  .put('/notifications', zodJson(updateNotificationPrefsRequestSchema, rejectInvalidBody), async (context) => {
    const { sub: userId } = context.get('jwtPayload')

    const newPreferences = context.req.valid('json')

    await context.get('userRepository').updateNotificationPreferences(userId, JSON.stringify(newPreferences))
    return context.json({ success: true }, 200)
  })

export { settingsApp }
