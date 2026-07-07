// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { Env, Variables } from '../types'
import { getHydratedRegistry } from '../shared/services/cache/seed-registry-cache'

/**
 * Hydrates the seed registry from D1 and injects seedRegistry, getSeed, and backrefMap
 * into the context. Must run AFTER repositoryMiddleware (needs seedRepository) and
 * BEFORE any handler that reads the registry.
 */
export const seedRegistryMiddleware = () =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    const { registry, backrefMap } = await getHydratedRegistry(context.get('seedRepository'))
    context.set('seedRegistry', registry)
    context.set('getSeed', (slug: string) => registry.get(slug))
    context.set('backrefMap', backrefMap)
    await next()
  })
