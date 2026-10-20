// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Context, Hono } from 'hono'
import {
  validateAndSanitizeSeedPayload,
  resolvePolicies,
  EntryNotFoundError,
  RelationTargetNotFoundError,
  DraftConflictError,
  DraftSaveConflictError,
  ActorContext,
  localizedAliasesIn,
  mergeLocalizedFields,
  resolveLocalizedFields,
  resolveClassification,
  type Seed,
} from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import { cleanStr } from '../../shared/utils/query-utils'
import { applyVisibility } from '../../shared/policies/apply-policies'
import { AppEnv } from '../../types'
import { CONTENT_ERRORS } from '../content/constants'
import { resolveIfMatch } from '../content/handlers/helpers'
import { draftGuard } from './draft.middleware'
import { loadLocaleConfig } from '../../shared/localization/locale-config'
import { loadDisplayLocaleConfig, resolveDisplayName } from '../../shared/localization/display-name'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../shared/rbac/scoped-projection'

const draftApp = new Hono<AppEnv>()

// GET /drafts — Pending drafts across every draft-enabled seed the caller may read.
draftApp.get('/drafts', async (context) => {
  const effective = await resolveEffectivePermissions(context)
  const seeds = filterSeedsByPermission(
    context.get('seedRegistry').draftEnabled(),
    effective,
    'content:read',
  )
  // No readable draft-enabled seed: answer with an empty list rather than handing the
  // repository an empty seed set.
  if (seeds.length === 0) return context.json([])

  const repository = context.get('repository')
  const drafts = await repository.findPendingDrafts(seeds)
  const localeConfig = await loadDisplayLocaleConfig(context.get('siteSettingsRepository'), seeds)
  const jwtPayload = context.get('jwtPayload')
  const actor: ActorContext = context.get('actor') ?? {
    type: 'authenticated',
    userId: jwtPayload?.sub,
    role: jwtPayload?.role,
  }
  const seedsBySlug = new Map(seeds.map((seed) => [seed.slug, seed]))
  return context.json(drafts.map((draft) => {
    const seed = seedsBySlug.get(draft.seedSlug)
    if (!seed) return draft
    const title = localeConfig ? resolveDisplayName(seed, draft.title, localeConfig) : draft.title
    return { ...draft, title: concealedTitle(seed, title, draft.id, actor) }
  }))
})

// Title column is raw SQL: re-apply the detail-read visibility pipeline.
function concealedTitle(seed: Seed, title: string, id: string, actor: ActorContext): string {
  const alias = seed.displayNameAlias
  const branch = seed.branches.find((b) => b.alias === alias)
  if (!branch) return title
  if (resolveClassification(branch).storage === 'encrypt') return id
  const visible = applyVisibility({ [alias]: title }, seed, actor)
  return Object.hasOwn(visible, alias) ? String(visible[alias]) : id
}

function normalizeBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
}

function logDraftActivity(
  context: Context<AppEnv>,
  id: string,
  slug: string,
  title: string,
  note: 'draft saved' | 'draft published'
) {
  const actor = context.get('jwtPayload')
  context.get('activityLogger').log({
    action: 'update',
    entityType: 'content',
    entityId: id,
    entitySlug: slug,
    details: { title, note },
    actor: {
      id: actor.sub,
      email: actor.email ?? 'unknown',
      name: [actor.name, actor.surname].filter(Boolean).join(' ') || null,
    },
  })
}

// PUT /:slug/:id/draft — Creates or overwrites the pending draft
draftApp.put('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await context.req.json<unknown>())
  } catch {
    return publicProblem(context, { 
      type: 'content-invalid-json', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_JSON_BODY 
    })
  }

  const sensitiveAliases = Object.keys(body).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    return branch != null && resolvePolicies(branch).privacy === 'hash'
  })
  
  if (sensitiveAliases.length > 0) {
    return publicProblem(context, { 
      type: 'content-sensitive-field-edit', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `${CONTENT_ERRORS.SENSITIVE_FIELD_EDIT}: ${sensitiveAliases.join(', ')}` 
    })
  }

  const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)
  const validation = validateAndSanitizeSeedPayload(seed, body, {
    operation: 'update',
    allowNull: true,
    requireAtLeastOneValidField: true,
    enforceRequiredFields: false,
    idGenerator: context.get('idGenerator'),
    localeConfig,
  })
  
  if (validation.dangerousFields.length > 0) {
    return publicProblem(context, { 
      type: 'content-dangerous-content', 
      title: 'Unprocessable Entity', 
      status: 422, 
      detail: `Dangerous markup in field '${validation.dangerousFields[0]}'` 
    })
  }
  
  if (validation.details.length > 0) {
    return publicProblem(context, { 
      type: 'content-validation-failed', 
      title: 'Bad Request', 
      status: 400, 
      detail: 'Validation failed', 
      errors: validation.details 
    })
  }

  const repository = context.get('repository')
  const ifMatch = resolveIfMatch(context, body)
  let draftData = validation.data
  let guard = ifMatch
  if (localeConfig && localizedAliasesIn(seed, validation.data).length > 0) {
    // publishDraft copies each touched column over the live row, so the draft must hold the complete
    // dictionary: base it on the pending draft value when this field was already drafted, else on live.
    const [pending, live, pendingUpdatedAt] = await Promise.all([
      repository.getDraft(seed, id),
      repository.findById(seed, id),
      repository.getDraftUpdatedAt(seed, id),
    ])
    draftData = mergeLocalizedFields(seed, { ...live, ...(pending ?? {}) }, validation.data, localeConfig)
    // This is a read-modify-write against `pending`: without a version guard, a concurrent draft
    // save landing in between would lose its translation silently. Fall back to the version we
    // merged against when the client sent no explicit guard, turning that race into a 409.
    if (guard === undefined && pending !== null) guard = pendingUpdatedAt ?? undefined
  }

  try {
    await repository.saveDraft(seed, id, draftData, { ifMatch: guard })
  } catch (error) {
    if (error instanceof DraftSaveConflictError) {
      return publicProblem(context, {
        type: 'draft-save-conflict',
        title: 'Conflict',
        status: 409,
        detail: CONTENT_ERRORS.DRAFT_SAVE_CONFLICT,
      })
    }
    throw error
  }

  const displayData = resolveLocalizedFields(seed, draftData, localeConfig)
  const displayTitle = cleanStr(displayData[seed.displayNameAlias]) ?? id
  logDraftActivity(context, id, slug, displayTitle, 'draft saved')

  return context.json({ success: true })
})

// GET /:slug/:id/draft — Retrieves the pending draft
draftApp.get('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')
  const draft = await repository.getDraft(seed, id)

  if (!draft) {
    return publicProblem(context, { 
      type: 'draft-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: 'No pending draft for this entry' 
    })
  }

  const jwtPayload = context.get('jwtPayload')
  const actor: ActorContext = context.get('actor') ?? {
    type: 'authenticated',
    userId: jwtPayload?.sub,
    role: jwtPayload?.role,
  }

  return context.json({ data: applyVisibility(draft, seed, actor) })
})

// POST /:slug/:id/draft/publish — Atomically promotes draft to live
draftApp.post('/:slug/:id/draft/publish', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')

  try {
    await repository.publishDraft(seed, id)
  } catch (err) {
    if (err instanceof DraftConflictError) {
      return publicProblem(context, {
        type: 'draft-publish-conflict',
        title: 'Conflict',
        status: 409,
        detail:
          'The live entry was modified after this draft was created. Discard the draft and ' +
          're-open the entry to start from the current version.',
      })
    }
    if (err instanceof EntryNotFoundError) {
      return publicProblem(context, {
        type: 'draft-not-found',
        title: 'Not Found',
        status: 404,
        detail: 'No pending draft to publish'
      })
    }
    if (err instanceof RelationTargetNotFoundError) {
      return publicProblem(context, {
        type: 'relation-target-not-found',
        title: 'Relation Target Not Found',
        status: 422,
        detail: `Field '${err.alias}' references '${err.targetSeed}' id='${err.value}' which does not exist`,
      })
    }
    throw err
  }

  logDraftActivity(context, id, slug, id, 'draft published')

  return context.json({ success: true })
})

// DELETE /:slug/:id/draft — Discards the pending draft
draftApp.delete('/:slug/:id/draft', draftGuard, async (context) => {
  const slug = context.req.param('slug')
  const id = context.req.param('id')
  const seed = context.get('getSeed')(slug)!

  const repository = context.get('repository')
  await repository.deleteDraft(seed, id)

  return context.json({ success: true })
})

export { draftApp }
