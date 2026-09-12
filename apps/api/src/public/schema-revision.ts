// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { MiddlewareHandler } from 'hono'
import { computeSchemaFingerprint } from '@beechcms/core'
import type { ISeedRegistry } from '@beechcms/core'
import type { AppEnv } from '../types.js'

export const fingerprintCache = new WeakMap<ISeedRegistry, string>()

export function schemaRevisionMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const registry = c.get('seedRegistry')
    if (registry) {
      let fingerprint = fingerprintCache.get(registry)
      if (!fingerprint) {
        fingerprint = await computeSchemaFingerprint(registry.all())
        fingerprintCache.set(registry, fingerprint)
      }
      await next()
      c.res.headers.set('X-Schema-Revision', fingerprint)
    } else {
      await next()
    }
  }
}
