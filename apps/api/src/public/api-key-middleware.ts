// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { Context, Next } from 'hono'
import { PUBLIC_ERRORS } from './public-errors.js'
import { publicProblem } from './problem-details.js'

type PublicBindings = {
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
}

function isZeroSecretPath(path: string, method: string): boolean {
  // Public health & Time-Trap token endpoints are strictly zero-secret
  if (path === '/health' || path === '/timetrap/token' || path.endsWith('/timetrap/token')) {
    return true
  }
  // Scoped schema lookup is zero-secret for public form rendering
  if (method === 'GET' && path.endsWith('/schema')) {
    return true
  }
  // Public form creation is zero-secret (defenses handled by publicAddHandler)
  if (method === 'POST' && (path.endsWith('/add') || path.includes('/add'))) {
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

    const env = c.env as PublicBindings
    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
    const configuredKey = isRead ? env.PUBLIC_READ_API_KEY : env.PUBLIC_WRITE_API_KEY

    if (!configuredKey) {
      return publicProblem(c, {
        type: 'public-api-not-configured',
        title: PUBLIC_ERRORS.API_KEY_FORBIDDEN.error,
        status: 403,
        detail: PUBLIC_ERRORS.API_KEY_FORBIDDEN.message,
      })
    }

    const providedKey = c.req.header('X-API-Key')
    if (!providedKey || providedKey !== configuredKey) {
      return publicProblem(c, {
        type: 'public-api-key-unauthorized',
        title: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.error,
        status: 401,
        detail: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.message,
      })
    }

    await next()
  }
}
