// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { sha256hex, type JwtClaims } from '@beechcms/core'
import type { Env, Variables } from '../types'

/** Standard JSON payload returned for unauthorized requests. */
const UNAUTHORIZED_JSON = JSON.stringify({ error: 'Unauthorized' })

/**
 * Generates a generic 401 Unauthorized JSON response.
 *
 * @returns An HTTP 401 Response.
 */
function unauthorizedResponse(): Response {
  return new Response(UNAUTHORIZED_JSON, {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 64 lowercase hex chars: the exact shape of `generateOpaqueToken()` output. A JWT always contains dots. */
const OPAQUE_TOKEN_RE = /^[0-9a-f]{64}$/

/** RFC 6750 §3 challenge for a token that is unknown, expired or revoked. Signals "refresh and retry". */
const INVALID_TOKEN_CHALLENGE = 'Bearer error="invalid_token", error_description="The access token is invalid or expired"'

/**
 * Generates an RFC 6750 401 Unauthorized response with `invalid_token` challenge header.
 *
 * @returns An HTTP 401 Response.
 */
function invalidTokenResponse(): Response {
  return new Response(UNAUTHORIZED_JSON, {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': INVALID_TOKEN_CHALLENGE },
  })
}

/**
 * Configuration options for {@link authMiddleware}.
 */
export interface AuthMiddlewareOptions {
  /**
   * Whether to accept opaque OAuth 2.1 access tokens in addition to admin JWTs.
   *
   * @defaultValue false
   *
   * @remarks
   * When `false` (the default), only admin JWTs are accepted. This ensures that internal endpoints
   * — developer custom routes (`factory.ts`), OAuth consent APIs (`features/oauth/index.ts`), and the
   * search router (`features/search/search.ts`) — stay JWT-only.
   *
   * When `true`, accepts both admin JWTs and opaque OAuth access tokens looked up via `oauthTokenRepository`.
   * Only `apiProtected` sets this, and only in combination with `oauthScopeMiddleware()`.
   */
  acceptOAuth?: boolean
}

/**
 * Authentication middleware for API routes.
 *
 * @remarks
 * Extracts the Bearer token from the `Authorization` header and validates credentials:
 * - When {@link AuthMiddlewareOptions.acceptOAuth} is `true` and the token is a 64-character hex string,
 *   looks up the active access token record via `oauthTokenRepository` and hydrates user claims from `userRepository`.
 *   Populates `jwtPayload` and sets `oauthGrant` in the Hono context.
 * - Otherwise, delegates verification to the `ITokenService` injected in context, setting `jwtPayload` and
 *   clearing `oauthGrant` (`null`).
 * - Emits HTTP 401 Unauthorized for missing, malformed, expired, or invalid tokens without exposing failure details.
 *
 * @param options - Configuration options controlling token acceptance.
 * @returns A Hono middleware handler.
 * @throws {HTTPException} 401 Unauthorized when authentication fails.
 */
export function authMiddleware(options: AuthMiddlewareOptions = {}) {
  const acceptOAuth = options.acceptOAuth === true

  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    const token = authHeader.slice(7)
    if (!token) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    if (acceptOAuth && OPAQUE_TOKEN_RE.test(token)) {
      const nowSeconds = c.get('clock').nowSeconds()
      const record = await c.get('oauthTokenRepository').findActiveByHash(await sha256hex(token), 'access', nowSeconds)
      if (!record) {
        throw new HTTPException(401, { res: invalidTokenResponse() })
      }

      // The in-slice gates (`requireAdmin`, `actorFromContext`) read `jwtPayload`. An OAuth
      // request must therefore present the SAME shape as a JWT request: the resource owner's
      // own claims, never elevated ones. If the account is gone, the grant is dead with it.
      const user = await c.get('userRepository').findById(record.userId)
      if (!user || !user.isActive) {
        throw new HTTPException(401, { res: invalidTokenResponse() })
      }

      const claims: JwtClaims = {
        sub: user.id,
        email: user.email,
        name: user.name ?? undefined,
        surname: user.surname ?? undefined,
        role: user.role,
      }

      c.set('jwtPayload', claims)
      c.set('oauthGrant', { clientId: record.clientId, userId: record.userId, scope: record.scope })
      await next()
      return
    }

    const claims = await c.get('tokenService').verify(token)

    if (!claims) {
      throw new HTTPException(401, { res: unauthorizedResponse() })
    }

    c.set('jwtPayload', claims)
    c.set('oauthGrant', null)
    await next()
  }
}
