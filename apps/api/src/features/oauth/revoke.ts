// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { sha256hex } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { getClientIp } from '../../shared/utils/request-utils'
import { OAUTH_ERRORS } from './constants'

/** Context type alias for OAuth route handlers. */
type OAuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * `POST /oauth/revoke`
 *
 * Token revocation endpoint complying with RFC 7009.
 * Allows a client to invalidate an active access or refresh token.
 *
 * Behavior and RFC 7009 conformance:
 * 1. Rate limiting is applied per client IP using the `oauthToken` limiter.
 * 2. Requires `token` and `client_id` in url-encoded form body (returns HTTP 400 if missing).
 * 3. Supports optional `token_type_hint` ('access_token' or 'refresh_token') to optimize lookup order.
 * 4. Hash lookup: Searches for an active token matching `sha256hex(token)`.
 * 5. **Token Family Revocation**: If found and the token's `clientId` matches the caller,
 *    revokes the entire token family via `authorizationCodeHash` (revoking an access token
 *    revokes its sibling refresh token, and vice-versa).
 * 6. **Always returns HTTP 200 `{}`** unless the request syntax is malformed (RFC 7009 §2.2),
 *    preventing token enumeration and leaking token existence or state to unauthorized parties.
 *
 * @param context - Hono request context.
 * @returns HTTP 200 `{}` on success, 400 on malformed syntax, or 429 when rate limited.
 */
export async function revokeHandler(context: OAuthContext): Promise<Response> {
  const clientIp = getClientIp(context.req)
  const rateLimit = await context.get('rateLimiters').getLimiter('oauthToken').checkLimit(clientIp)
  if (!rateLimit.isAllowed) {
    return context.json(
      { error: OAUTH_ERRORS.INVALID_REQUEST, error_description: 'Too many requests' },
      429,
      rateLimit.retryAfterSeconds !== undefined ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : {},
    )
  }

  const body = (await context.req.parseBody()) as Record<string, string | File>
  const token = typeof body.token === 'string' ? body.token : undefined
  const clientId = typeof body.client_id === 'string' ? body.client_id : undefined
  const tokenTypeHint = typeof body.token_type_hint === 'string' ? body.token_type_hint : undefined

  if (!token || !clientId) {
    return context.json({ error: OAUTH_ERRORS.INVALID_REQUEST, error_description: 'token and client_id are required' }, 400)
  }

  const nowSeconds = context.get('clock').nowSeconds()
  const tokenRepository = context.get('oauthTokenRepository')
  const hash = await sha256hex(token)

  const lookupOrder: Array<'access' | 'refresh'> = tokenTypeHint === 'refresh_token' ? ['refresh', 'access'] : ['access', 'refresh']
  let record = await tokenRepository.findActiveByHash(hash, lookupOrder[0], nowSeconds)
  if (!record) record = await tokenRepository.findActiveByHash(hash, lookupOrder[1], nowSeconds)

  if (record && record.clientId === clientId) {
    await tokenRepository.revokeByAuthorizationCode(record.authorizationCodeHash, nowSeconds)
  }

  return context.json({}, 200)
}
