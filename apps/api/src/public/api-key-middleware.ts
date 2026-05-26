// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, Next } from 'hono'
import { PUBLIC_ERRORS } from './public-errors'
import { publicProblem } from './problem-details'

type PublicBindings = {
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
}

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function getConfiguredKey(env: PublicBindings, method: string): string | undefined {
  if (isReadMethod(method)) {
    return env.PUBLIC_READ_API_KEY
  }
  return env.PUBLIC_WRITE_API_KEY
}

/**
 * API key auth middleware for Public API routes.
 * Uses X-API-Key header only.
 */
export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const env = c.env as PublicBindings
    const configuredKey = getConfiguredKey(env, c.req.method)

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

