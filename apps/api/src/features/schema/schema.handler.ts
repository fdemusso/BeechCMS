// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { canEditLayout, formLayoutSchema, validateLayoutAgainstSeed } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Env, Variables } from '../../types'

const schemaApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Returns the full CMS schema (all configured Seeds), each optionally enriched
 * with a stored custom FormLayout. Used by the Dashboard to drive menus and forms.
 */
schemaApp.get('/', async (context) => {
  const registry = context.get('seedRegistry')
  const layouts = await context.get('seedLayoutRepository').getAllAsMap()

  const enriched = registry.all().map((seed) => {
    const stored = layouts.get(seed.slug)
    if (!stored) return seed
    const result = validateLayoutAgainstSeed(stored, seed)
    return { ...seed, layout: result.cleaned }
  })

  return context.json(enriched)
})

/**
 * Upserts a custom FormLayout for a Seed.
 * Admin-only. Validates shape (Zod) then semantic constraints against the Seed.
 */
schemaApp.put('/:slug/layout', async (context) => {
  const role = context.get('jwtPayload')?.role
  if (!canEditLayout(role)) {
    return publicProblem(context, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Layout edit requires admin role.',
    })
  }

  const slug = context.req.param('slug')
  const seed = context.get('seedRegistry').get(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'seed-not-found',
      title: 'Seed not found',
      status: 404,
      detail: `No seed with slug '${slug}'.`,
    })
  }

  let body: unknown
  try {
    body = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'invalid-json',
      title: 'Invalid JSON',
      status: 400,
      detail: 'Body must be valid JSON.',
    })
  }

  const parsed = formLayoutSchema.safeParse(body)
  if (!parsed.success) {
    return publicProblem(context, {
      type: 'invalid-layout',
      title: 'Invalid layout',
      status: 422,
      detail: parsed.error.message,
    })
  }

  const semantic = validateLayoutAgainstSeed(parsed.data, seed)
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

  return context.json({ ok: true, layout: semantic.cleaned })
})

/**
 * Removes the stored layout for a Seed, reverting to the generated default.
 * Admin-only. The "Reset" action in the Layout Builder calls this endpoint.
 */
schemaApp.delete('/:slug/layout', async (context) => {
  const role = context.get('jwtPayload')?.role
  if (!canEditLayout(role)) {
    return publicProblem(context, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Layout edit requires admin role.',
    })
  }

  const slug = context.req.param('slug')
  const seed = context.get('seedRegistry').get(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'seed-not-found',
      title: 'Seed not found',
      status: 404,
      detail: `No seed with slug '${slug}'.`,
    })
  }

  await context.get('seedLayoutRepository').remove(slug)
  return context.json({ ok: true })
})

export { schemaApp }
