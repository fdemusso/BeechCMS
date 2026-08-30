// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { generateTimeTrapToken, resolveClassification } from '@beechcms/core'
import type { AppEnv } from '../types'
import { publicReadHandler } from './public-read'
import { publicAddHandler } from './public-add'
import { publicEditHandler } from './public-edit'
import { publicProblem } from './problem-details'
import { publicSearchRouter } from '../features/search'

const publicApp = new Hono<AppEnv>()

publicApp.get('/health', (c) => {
  return c.json({ ok: true, service: 'public-api' }, 200)
})

/** Returns a signed time-trap token for public form submissions. */
publicApp.get('/timetrap/token', async (c) => {
  const secret = c.env.PUBLIC_TIME_TRAP_SECRET || 'beech-public-timetrap-default-secret'
  const token = await generateTimeTrapToken(secret)
  return c.json({ token, minDeltaSeconds: 1.5 }, 200)
})

publicApp.route('/search', publicSearchRouter)

/** Returns the scoped public-facing schema for a single seed (e.g. GET /api/v1/public/clienti/schema) */
publicApp.get('/:seed/schema', (c) => {
  const seedSlug = c.req.param('seed') ?? ''
  const seed = c.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(c, { type: 'seed-not-found', title: 'Not Found', status: 404, detail: `Seed '${seedSlug}' does not exist.` })
  }

  const isPublic = seed.allowPublicRead === true || seed.allowPublicPost === true || seed.allowPublicEdit === true
  if (!isPublic) {
    return publicProblem(c, { type: 'operation-not-allowed', title: 'Forbidden', status: 403, detail: `Public access not allowed for '${seedSlug}'.` })
  }

  const publicBranches = (seed.branches ?? [])
    .filter(branch => {
      const classification = resolveClassification(branch).classification
      if (branch.policies?.public === false) return false
      if (branch.policies?.public === true) return true
      return classification !== 'internal' && classification !== 'restricted'
    })
    .map(branch => {
      const rawBranch = branch as unknown as Record<string, unknown>
      const rawOptions = Array.isArray(rawBranch.options)
        ? rawBranch.options.map((opt) => (typeof opt === 'string' ? { label: opt, value: opt } : opt))
        : undefined
      return {
        alias: branch.alias,
        type: branch.type,
        label: branch.label,
        placeholder: typeof rawBranch.placeholder === 'string' ? rawBranch.placeholder : undefined,
        options: rawOptions,
        helpText: typeof rawBranch.helpText === 'string' ? rawBranch.helpText : undefined,
        requiredOnCreate: branch.requiredOnCreate ?? false,
        policies: {
          classification: resolveClassification(branch).classification,
          public: branch.policies?.public ?? true,
          visibility: branch.policies?.visibility ?? 'full',
        },
      }
    })

  return c.json({
    slug: seed.slug,
    label: seed.label,
    labelPlural: seed.labelPlural,
    allowPublicRead: seed.allowPublicRead ?? false,
    allowPublicPost: seed.allowPublicPost ?? false,
    allowPublicEdit: seed.allowPublicEdit ?? false,
    branches: publicBranches,
  }, 200)
})

publicApp.get('/:seed', publicReadHandler)
publicApp.post('/:seed/add', publicAddHandler)
publicApp.put('/:seed/edit/:id', publicEditHandler)
publicApp.patch('/:seed/edit/:id', publicEditHandler)

export const publicRoutes = publicApp

