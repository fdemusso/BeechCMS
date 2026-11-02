// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { formLayoutSchema, reconcileLayoutWithSeed, validateLayoutAgainstSeed } from '@beechcms/core'
import { publicProblem } from '../../public/errors/problem-details'
import { zodJson, type ZodJsonInput, type ZodJsonRefusal } from '../../shared/utils/zod-json'
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppEnv, Env, Variables } from '../../types'
import { resolveEffectivePermissions } from '../../shared/rbac/effective-permissions'
import { filterSeedsByPermission } from '../../shared/rbac/scoped-projection'

type AppContext = Context<{ Bindings: Env; Variables: Variables }>
const LAYOUT_PATH = '/:slug/layout'

/** Resolves the seed by slug. Returns a 404 response if not found, otherwise the seed. */
function requireSeedBySlug(context: AppContext, slug: string) {
  const seed = context.get('seedRegistry').get(slug)
  if (!seed) {
    return {
      seed: null,
      error: publicProblem(context, {
        type: 'seed-not-found',
        title: 'Seed not found',
        status: 404,
        detail: `No seed with slug '${slug}'.`,
      }),
    }
  }
  return { seed, error: null }
}

/**
 * The edit permission is decided by the route table (`permission.middleware.ts`) before this router
 * runs. The seed check still has to run before the body is read, so a caller who names no seed
 * learns nothing about the layout contract.
 */
const requireKnownSeed: MiddlewareHandler<AppEnv, typeof LAYOUT_PATH> = async (context, next) => {
  const { error } = requireSeedBySlug(context, context.req.param('slug'))
  if (error) return error
  await next()
}

/** The body of a PUT: not JSON at all is a 400, JSON that is not a layout is a 422. */
function rejectInvalidLayoutBody(context: AppContext, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return publicProblem(context, {
      type: 'invalid-json',
      title: 'Invalid JSON',
      status: 400,
      detail: 'Body must be valid JSON.',
    })
  }
  return publicProblem(context, {
    type: 'invalid-layout',
    title: 'Invalid layout',
    status: 422,
    detail: error.issues.map((issue) => `${issue.path.join('.') || 'layout'}: ${issue.message}`).join('; '),
  })
}

async function putLayout(context: Context<AppEnv, typeof LAYOUT_PATH, ZodJsonInput<typeof formLayoutSchema>>) {
  const slug = context.req.param('slug')
  // requireKnownSeed has already answered 404 for an unknown slug.
  const seed = context.get('seedRegistry').get(slug)!

  const semantic = validateLayoutAgainstSeed(context.req.valid('json'), seed)
  if (!semantic.ok) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: semantic.errors.join('; '),
    })
  }

  const userId = context.get('jwtPayload')?.sub ?? 'unknown'
  await context.get('seedLayoutRepository').upsert(slug, semantic.cleaned, userId)

  return context.json({ ok: true, layout: semantic.cleaned }, 200)
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
const schemaApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  /**
   * Returns the full CMS schema (all configured Seeds), each optionally enriched
   * with a stored custom FormLayout. Used by the Dashboard to drive menus and forms.
   */
  .get('/', async (context) => {
    const registry = context.get('seedRegistry')
    const effective = await resolveEffectivePermissions(context)
    // Seed isolation is per-seed, never row-level (brief §2): a caller who cannot read a
    // seed must not learn it exists. `content:read` is the visibility floor — every other
    // content permission is useless without it.
    const visible = filterSeedsByPermission(registry.all(), effective, 'content:read')

    const layouts = await context.get('seedLayoutRepository').getAllAsMap()

    const enriched = visible.map((seed) => {
      const stored = layouts.get(seed.slug)
      if (!stored) return seed
      return { ...seed, layout: reconcileLayoutWithSeed(stored, seed) }
    })

    return context.json(enriched, 200)
  })
  /**
   * Upserts a custom FormLayout for a Seed.
   * Gated by `manage_seeds` at the global scope (route table). Validates shape (Zod) then semantic constraints against the Seed.
   */
  .put(LAYOUT_PATH, requireKnownSeed, zodJson(formLayoutSchema, rejectInvalidLayoutBody), putLayout)
  /**
   * Removes the stored layout for a Seed, reverting to the generated default.
   * Gated by `manage_seeds` at the global scope (route table). The "Reset" action in the Layout Builder calls this endpoint.
   */
  .delete(LAYOUT_PATH, requireKnownSeed, async (context) => {
    await context.get('seedLayoutRepository').remove(context.req.param('slug'))
    return context.json({ ok: true }, 200)
  })

export { schemaApp }
