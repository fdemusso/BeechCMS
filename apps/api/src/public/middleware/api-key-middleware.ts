// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { Context, Next } from 'hono'
import { authorizePublicKey, publicKeyProblem } from './public-key-auth.js'
import type { PublicKeyBindings } from './public-key-auth.js'

function isZeroSecretPath(path: string, method: string): boolean {
  // Public health & Time-Trap token endpoints are strictly zero-secret
  if (path === '/health' || path.endsWith('/health') || /(?:^|\/)timetrap\/token\/?$/.test(path)) {
    return true
  }
  // Scoped schema lookup is zero-secret for public form rendering
  if (method === 'GET' && /(?:^|\/)[^/]+\/schema\/?$/.test(path)) {
    return true
  }
  // Public form creation is zero-secret (defenses handled by publicAddHandler)
  if (method === 'POST' && /(?:^|\/)[^/]+\/add\/?$/.test(path)) {
    return true
  }
  return false
}

export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // If endpoint is eligible for zero-secret access, proceed without requiring X-API-Key
    if (isZeroSecretPath(c.req.path, c.req.method)) {
      return next()
    }

    const decision = authorizePublicKey({
      method: c.req.method,
      providedKey: c.req.header('X-API-Key'),
      env: c.env as PublicKeyBindings,
    })
    if (!decision.ok) return publicKeyProblem(c, decision)

    await next()
  }
}
