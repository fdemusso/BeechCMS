// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Env, Variables } from '../types'

const UNAUTHORIZED_JSON = JSON.stringify({ error: 'Unauthorized' })

function unauthorizedResponse() {
  return new Response(UNAUTHORIZED_JSON, {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * JWT authentication middleware. Reads the Bearer token from the Authorization
 * header and delegates verification to the ITokenService injected in context.
 * Returns 401 on any missing or invalid token; never exposes failure details.
 */
export function authMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    const token = authHeader.slice(7)
    if (!token) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    const claims = await c.get('tokenService').verify(token)

    if (!claims) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    c.set('jwtPayload', claims)
    await next()
  }
}
