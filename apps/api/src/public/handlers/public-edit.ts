// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isValidContentStatus, resolveClassification, resolvePolicies, EntryConflictError, EntryNotFoundError, localizedAliasesIn, mergeLocalizedFields, resolveLocalizedFields } from '@beechcms/core'
import type { LocaleConfig, Seed } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../../shared/utils/query-utils'
import { checkPublicOperation } from '../validation/access-policy'
import { publicProblem } from '../errors/problem-details'
import { slugify } from '../utils/slug-utils'
import { sanitizePublicPayload } from '../validation/sanitize'
import { loadLocaleConfig } from '../../shared/localization/locale-config'
import { negotiatePublicLanguage, localizePublicEntry } from '../localization/public-language'
import { AppEnv } from '../../types'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type PublicCtx = Context<AppEnv>
type ResolveResult<T> = { ok: true; value: T } | { ok: false; response: Response }

function errorMessage(context: PublicCtx, error: unknown): string {
  if (context.env.ENV !== 'production' && error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function removeNullishFields(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = Object.create(null)
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) next[key] = value
  }
  return next
}

function parseBody(context: PublicCtx): Promise<ResolveResult<Record<string, unknown>>> {
  return context.req.json<unknown>()
    .then((parsed) => ({ ok: true, value: asRecord(parsed) ?? {} }) as const)
    .catch(() => ({
      ok: false,
      response: publicProblem(context, { type: 'invalid-json-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' }),
    }))
}

function resolveSlug(context: PublicCtx, body: Record<string, unknown>, currentSlug: string): ResolveResult<{ slugRequested: boolean; nextSlug: string }> {
  const slugRequested = Object.hasOwn(body, 'slug')
  if (!slugRequested) return { ok: true, value: { slugRequested, nextSlug: currentSlug } }
  const requestedSlug = cleanStr(body.slug)
  if (!requestedSlug) {
    return { ok: false, response: publicProblem(context, { type: 'invalid-slug', title: 'Bad Request', status: 400, detail: "Field 'slug' must be a non-empty string" }) }
  }
  return { ok: true, value: { slugRequested, nextSlug: slugify(requestedSlug) } }
}

function resolveStatus(context: PublicCtx, body: Record<string, unknown>, currentStatus: string): ResolveResult<string> {
  if (!Object.hasOwn(body, 'status')) return { ok: true, value: currentStatus }
  const statusValue = body.status
  if (!isValidContentStatus(statusValue)) {
    return { ok: false, response: publicProblem(context, { type: 'invalid-status', title: 'Bad Request', status: 400, detail: 'Invalid status. Allowed values are: draft, review, published' }) }
  }
  return { ok: true, value: statusValue as string }
}

function resolveData(
  context: PublicCtx,
  seed: Seed,
  body: Record<string, unknown>,
  localeConfig: LocaleConfig | undefined
): ResolveResult<Record<string, unknown>> {
  let rawData: Record<string, unknown> | null = null

  if (Object.hasOwn(body, 'data')) {
    rawData = asRecord(body.data)
    if (!rawData) {
      return {
        ok: false,
        response: publicProblem(context, {
          type: 'invalid-data-object',
          title: 'Bad Request',
          status: 400,
          detail: "Field 'data' must be an object when provided",
        }),
      }
    }
  } else {
    const flatData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k !== 'slug' && k !== 'status') {
        flatData[k] = v
      }
    }
    if (Object.keys(flatData).length > 0) {
      rawData = flatData
    } else {
      // No data update — return empty patch
      return { ok: true, value: {} }
    }
  }

  // 1. Check for internal/restricted fields
  const internalOrRestricted = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    const classification = resolveClassification(branch).classification
    return classification === 'internal' || classification === 'restricted'
  })

  if (internalOrRestricted.length > 0) {
    return {
      ok: false,
      response: publicProblem(context, {
        type: 'sensitive-field-edit',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Cannot write internal/restricted fields: ${internalOrRestricted.join(', ')}`,
      }),
    }
  }

  // 2. Check for confidential fields without explicit publicEdit permission
  const unauthorizedConfidential = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    const classification = resolveClassification(branch).classification
    if (classification === 'confidential') {
      const policies = resolvePolicies(branch)
      return !policies.publicEdit
    }
    // Also block non-confidential branches where public === false
    const policies = resolvePolicies(branch)
    return policies.public === false && !policies.publicEdit
  })

  if (unauthorizedConfidential.length > 0) {
    const alias = unauthorizedConfidential[0]
    return {
      ok: false,
      response: publicProblem(context, {
        type: 'sensitive-field-edit',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Cannot edit sensitive field '${alias}': edit permission not granted by seed declaration`,
      }),
    }
  }

  const sanitized = sanitizePublicPayload(seed, rawData, {
    allowNull: true,
    operation: 'update',
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
    localeConfig,
  })

  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return {
        ok: false,
        response: publicProblem(context, {
          type: sanitized.code,
          title: 'Unprocessable Entity',
          status: 422,
          detail: sanitized.message,
        }),
      }
    }
    return {
      ok: false,
      response: publicProblem(context, {
        type: sanitized.code,
        title: 'Bad Request',
        status: 400,
        detail: sanitized.message,
        errors: sanitized.details,
      }),
    }
  }

  return { ok: true, value: removeNullishFields(sanitized.data) }
}

export async function publicEditHandler(context: PublicCtx) {
  const seedSlug = context.req.param('seed') ?? ''
  const id = context.req.param('id') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed Not Found', status: 404, detail: `The content type '${seedSlug}' does not exist.` })
  }
  const access = checkPublicOperation(seed, 'edit')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  if (!UUID_REGEX.test(id)) {
    return publicProblem(context, { type: 'invalid-entry-id', title: 'Bad Request', status: 400, detail: 'Invalid entry ID format' })
  }

  const repository = context.get('repository')

  try {
    const entry = await repository.findById(seed, id)
    const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)

    const negotiated = localeConfig
      ? negotiatePublicLanguage({ lang: context.req.query('lang'), acceptLanguage: context.req.header('Accept-Language') }, localeConfig)
      : undefined
    if (negotiated && !negotiated.ok) {
      return publicProblem(context, { type: 'invalid-lang', title: 'Bad Request', status: 400, detail: negotiated.detail })
    }
    const language = negotiated?.ok ? negotiated.language : undefined

    const bodyResult = await parseBody(context)
    if (!bodyResult.ok) return bodyResult.response

    const slugResult = resolveSlug(context, bodyResult.value, (entry.slug as string) ?? '')
    if (!slugResult.ok) return slugResult.response

    const statusResult = resolveStatus(context, bodyResult.value, (entry.status as string) ?? 'draft')
    if (!statusResult.ok) return statusResult.response

    const dataResult = resolveData(context, seed, bodyResult.value, localeConfig)
    if (!dataResult.ok) return dataResult.response

    if (slugResult.value.slugRequested && slugResult.value.nextSlug !== entry.slug) {
      const exists = await repository.existsSlug(seed, slugResult.value.nextSlug, id)
      if (exists) {
        return publicProblem(context, { type: 'slug-conflict', title: 'Conflict', status: 409, detail: `An entry with slug '${slugResult.value.nextSlug}' already exists for content type '${seedSlug}'.` })
      }
    }

    // Merged into the stored dictionaries so translations the caller does not mention survive (brief §2).
    const updateData: Record<string, unknown> = { ...mergeLocalizedFields(seed, entry, dataResult.value, localeConfig) }
    if (slugResult.value.slugRequested) {
      (updateData as any).slug = slugResult.value.nextSlug
    }

    // Read-modify-write against `entry`: guard with the version merged against so a concurrent write
    // yields 409 instead of silently losing a translation.
    const ifMatch = localeConfig && localizedAliasesIn(seed, dataResult.value).length > 0
      ? (entry.updated_at as number)
      : undefined
    await repository.update(seed, id, updateData, statusResult.value, { ifMatch })

    context.get('notificationService').notify({
      title: `${seed.label}: Update`,
      message: `The entry "${slugResult.value.nextSlug}" has been modified via the public API.`,
      type: 'info',
    })

    const updatedEntry = { ...entry, ...updateData }
    const displayEntry = resolveLocalizedFields(seed, updatedEntry, localeConfig)
    const safeTitle = Object.hasOwn(displayEntry, 'title') ? displayEntry.title : undefined
    const safeName = Object.hasOwn(displayEntry, 'name') ? displayEntry.name : undefined
    const title = String(safeTitle || safeName || slugResult.value.nextSlug)

    context.get('activityLogger').log({
      action: 'update',
      entityType: 'content',
      entityId: id,
      entitySlug: slugResult.value.nextSlug,
      details: { title },
      actor: { id: 'public', email: 'public-api@beechcms.local', name: 'Public API' },
    })

    context.get('scheduler').waitUntil(
      context.get('automationRunner').run({
        seedSlug,
        event: 'update',
        entry: { ...updatedEntry, status: statusResult.value },
      })
    )

    return context.json({
      success: true,
      id,
      slug: slugResult.value.nextSlug,
      data: localizePublicEntry(seed, { ...updatedEntry, status: statusResult.value }, language),
      meta: { seed: seedSlug },
    }, 200)
  } catch (error) {
    if (error instanceof EntryConflictError) {
      return publicProblem(context, { type: 'entry-update-conflict', title: 'Conflict', status: 409, detail: `Entry '${id}' was modified concurrently. Re-read it and retry.` })
    }
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { type: 'entry-not-found', title: 'Not Found', status: 404, detail: `Entry '${id}' not found for content type '${seedSlug}'.` })
    }
    console.error('Public edit error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: errorMessage(context, error) })
  }
}
