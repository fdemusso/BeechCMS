// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
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
  viewConfigChoiceIssues,
  type ContentViewRecord,
  type Seed,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import type { ZodJsonInput, ZodJsonRefusal } from '../../../shared/utils/zod-json'
import { CONTENT_ERRORS } from '../constants'
import type { AppEnv } from '../../../types'

type AppContext = Context<AppEnv>
type ViewsJsonContext<S extends z.ZodType, P extends string = string> = Context<AppEnv, P, ZodJsonInput<S>>

function seedNotFound(context: Context) {
  return publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND })
}

function viewNotFound(context: Context) {
  return publicProblem(context, { type: 'content-view-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.VIEW_NOT_FOUND })
}

function invalidView(context: Context, detail: string | undefined) {
  return publicProblem(context, { type: 'content-invalid-view', title: 'Unprocessable Entity', status: 422, detail: detail ?? CONTENT_ERRORS.INVALID_VIEW })
}

/**
 * The body of a view write: not JSON at all is a 400, JSON the schema refuses is a 422 carrying
 * the first issue's message (the order of the schema's keys is the order the checks ran in).
 */
export function rejectInvalidViewBody(context: AppContext, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return publicProblem(context, { type: 'content-invalid-body', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY })
  }
  return invalidView(context, error.issues[0]?.message)
}

/**
 * PATCH of a view that does not exist (or whose type the seed no longer authorizes) answers 404
 * whatever the body holds, so the lookup runs ahead of `zodJson`.
 */
export const requireAuthorizedView: MiddlewareHandler<AppEnv, '/:slug/views/:viewId'> = async (context, next) => {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)
  const existing = await context.get('contentViewRepository').get(slug, context.req.param('viewId'))
  if (!existing || !isViewAuthorized(seed, existing.type)) return viewNotFound(context)
  await next()
}

/**
 * Brief §2: Table always has at least one instance. A seed with zero rows (new seed, or any
 * seed on first read after this migration) gets one untitled instance per authorized type.
 * Runs before every write as well, so a first-ever POST cannot leave a seed without Table.
 */
async function loadOrBootstrap(context: AppContext, slug: string, seed: Seed): Promise<ContentViewRecord[]> {
  const repository = context.get('contentViewRepository')
  const records = await repository.listBySeed(slug)
  if (records.length > 0) return records
  await repository.ensureDefaults(slug, resolveAuthorizedViews(seed), context.get('jwtPayload').sub)
  return repository.listBySeed(slug)
}

export async function listViewsHandler(context: Context<AppEnv, '/:slug/views'>) {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)

  const records = await loadOrBootstrap(context, slug, seed)
  return context.json(projectContentViews(records, seed), 200)
}

export async function createViewHandler(context: ViewsJsonContext<typeof createContentViewInputSchema, '/:slug/views'>) {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)
  const input = context.req.valid('json')

  const { type } = input
  if (!isViewAuthorized(seed, type)) {
    return publicProblem(context, { type: 'content-view-type-not-authorized', title: 'Unprocessable Entity', status: 422, detail: CONTENT_ERRORS.VIEW_TYPE_NOT_AUTHORIZED })
  }

  const config = input.config ?? emptyViewConfig()
  const choiceIssues = viewConfigChoiceIssues(config, seed)
  if (choiceIssues.length > 0) return invalidView(context, choiceIssues[0])

  await loadOrBootstrap(context, slug, seed)
  const record = await context.get('contentViewRepository').create(
    {
      seedSlug: slug,
      type,
      title: input.title ?? null,
      config: validateViewConfigAgainstSeed(config, seed, type),
    },
    context.get('jwtPayload').sub,
  )
  const view = projectContentView(record, seed)
  if (!view) return viewNotFound(context)
  return context.json(view, 201)
}

export async function updateViewHandler(context: ViewsJsonContext<typeof updateContentViewInputSchema, '/:slug/views/:viewId'>) {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)
  const viewId = context.req.param('viewId')
  const input = context.req.valid('json')

  const repository = context.get('contentViewRepository')
  const existingType = (await repository.get(slug, viewId))?.type
  if (!existingType || !isViewAuthorized(seed, existingType)) return viewNotFound(context)

  if (input.config) {
    const choiceIssues = viewConfigChoiceIssues(input.config, seed)
    if (choiceIssues.length > 0) return invalidView(context, choiceIssues[0])
  }

  const updated = await repository.update(
    slug,
    viewId,
    {
      title: input.title,
      config: input.config ? validateViewConfigAgainstSeed(input.config, seed, existingType) : undefined,
    },
    context.get('jwtPayload').sub,
  )
  const view = updated ? projectContentView(updated, seed) : null
  if (!view) return viewNotFound(context)
  return context.json(view, 200)
}

export async function deleteViewHandler(context: Context<AppEnv, '/:slug/views/:viewId'>) {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)
  const viewId = context.req.param('viewId')

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

export async function reorderViewsHandler(context: ViewsJsonContext<typeof reorderContentViewsInputSchema, '/:slug/views/order'>) {
  const slug = context.req.param('slug')
  const seed = context.get('getSeed')(slug)
  if (!seed) return seedNotFound(context)
  const input = context.req.valid('json')

  const records = await loadOrBootstrap(context, slug, seed)
  const visible = projectContentViews(records, seed)
  const requested = input.ids
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
  return context.json(projectContentViews(await repository.listBySeed(slug), seed), 200)
}
