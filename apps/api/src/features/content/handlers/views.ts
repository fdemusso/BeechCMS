// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import {
  createContentViewInputSchema,
  emptyViewConfig,
  isViewAuthorized,
  mergeContentViewOrder,
  projectContentView,
  projectContentViews,
  reorderContentViewsInputSchema,
  resolveAuthorizedViews,
  updateContentViewInputSchema,
  validateViewConfigAgainstSeed,
  type ContentViewRecord,
  type Seed,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

type Resolved<T> = { ok: true; value: T } | { ok: false; response: Response }

function resolveSeed(context: Context<AppEnv>): Resolved<{ slug: string; seed: Seed }> {
  const slug = context.req.param('slug')
  if (!slug) {
    return { ok: false, response: publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG }) }
  }
  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return { ok: false, response: publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND }) }
  }
  return { ok: true, value: { slug, seed } }
}

async function readJsonBody(context: Context<AppEnv>): Promise<Resolved<unknown>> {
  try {
    return { ok: true, value: await context.req.json() }
  } catch {
    return { ok: false, response: publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY }) }
  }
}

function invalidView(context: Context<AppEnv>, detail: string | undefined): Response {
  return publicProblem(context, { type: 'content-invalid-view', title: 'Unprocessable Entity', status: 422, detail: detail ?? CONTENT_ERRORS.INVALID_VIEW })
}

function viewNotFound(context: Context<AppEnv>): Response {
  return publicProblem(context, { type: 'content-view-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.VIEW_NOT_FOUND })
}

/**
 * Brief §2: Table always has at least one instance. A seed with zero rows (new seed, or any
 * seed on first read after this migration) gets one untitled instance per authorized type.
 * Runs before every write as well, so a first-ever POST cannot leave a seed without Table.
 */
async function loadOrBootstrap(context: Context<AppEnv>, slug: string, seed: Seed): Promise<ContentViewRecord[]> {
  const repository = context.get('contentViewRepository')
  const records = await repository.listBySeed(slug)
  if (records.length > 0) return records
  await repository.ensureDefaults(slug, resolveAuthorizedViews(seed), context.get('jwtPayload').sub)
  return repository.listBySeed(slug)
}

export async function listViewsHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const records = await loadOrBootstrap(context, slug, seed)
  return context.json(projectContentViews(records, seed))
}

export async function createViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = createContentViewInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const { type } = parsed.data
  if (!isViewAuthorized(seed, type)) {
    return publicProblem(context, { type: 'content-view-type-not-authorized', title: 'Unprocessable Entity', status: 422, detail: CONTENT_ERRORS.VIEW_TYPE_NOT_AUTHORIZED })
  }

  await loadOrBootstrap(context, slug, seed)
  const record = await context.get('contentViewRepository').create(
    {
      seedSlug: slug,
      type,
      title: parsed.data.title ?? null,
      config: validateViewConfigAgainstSeed(parsed.data.config ?? emptyViewConfig(), seed, type),
    },
    context.get('jwtPayload').sub,
  )
  const view = projectContentView(record, seed)
  if (!view) return viewNotFound(context)
  return context.json(view, 201)
}

export async function updateViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value
  const viewId = context.req.param('viewId')
  if (!viewId) return viewNotFound(context)

  const repository = context.get('contentViewRepository')
  const existing = await repository.get(slug, viewId)
  const existingType = existing?.type
  if (!existingType || !isViewAuthorized(seed, existingType)) return viewNotFound(context)

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = updateContentViewInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const updated = await repository.update(
    slug,
    viewId,
    {
      title: parsed.data.title,
      config: parsed.data.config ? validateViewConfigAgainstSeed(parsed.data.config, seed, existingType) : undefined,
    },
    context.get('jwtPayload').sub,
  )
  const view = updated ? projectContentView(updated, seed) : null
  if (!view) return viewNotFound(context)
  return context.json(view)
}

export async function deleteViewHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value
  const viewId = context.req.param('viewId')
  if (!viewId) return viewNotFound(context)

  const repository = context.get('contentViewRepository')
  const existing = await repository.get(slug, viewId)
  if (!existing || !isViewAuthorized(seed, existing.type)) return viewNotFound(context)

  const result = await repository.remove(slug, viewId)
  if (result === 'not-found') return viewNotFound(context)
  if (result === 'last-table') {
    return publicProblem(context, { type: 'content-view-last-table', title: 'Conflict', status: 409, detail: CONTENT_ERRORS.VIEW_LAST_TABLE })
  }
  return context.body(null, 204)
}

export async function reorderViewsHandler(context: Context<AppEnv>) {
  const resolved = resolveSeed(context)
  if (!resolved.ok) return resolved.response
  const { slug, seed } = resolved.value

  const body = await readJsonBody(context)
  if (!body.ok) return body.response
  const parsed = reorderContentViewsInputSchema.safeParse(body.value)
  if (!parsed.success) return invalidView(context, parsed.error.issues[0]?.message)

  const records = await loadOrBootstrap(context, slug, seed)
  const visible = projectContentViews(records, seed)
  const requested = parsed.data.ids
  const visibleIds = new Set(visible.map((view) => view.id))
  const isPermutation =
    requested.length === visibleIds.size &&
    new Set(requested).size === requested.length &&
    requested.every((id) => visibleIds.has(id))
  if (!isPermutation) {
    return publicProblem(context, { type: 'content-view-order-mismatch', title: 'Unprocessable Entity', status: 422, detail: CONTENT_ERRORS.VIEW_ORDER_MISMATCH })
  }

  const repository = context.get('contentViewRepository')
  const fullOrder = mergeContentViewOrder(records.map((record) => record.id), requested)
  await repository.reorder(slug, fullOrder, context.get('jwtPayload').sub)
  return context.json(projectContentViews(await repository.listBySeed(slug), seed))
}
