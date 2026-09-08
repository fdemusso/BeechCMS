// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { formatScopes, isScopeSubset, parseScopeString, sha256hex, verifyPkceChallenge, type OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { checkDualKeyRateLimit } from '../../shared/utils/dual-key-rate-limiter'
import { getClientIp } from '../../shared/utils/request-utils'
import { OAUTH_ERRORS, type OAuthErrorCode } from './constants'
import { issueTokenPair } from './token-issuance'

/** Context type alias for OAuth route handlers. */
type OAuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * Successful token response body adhering to RFC 6749 §5.1.
 */
export interface TokenResponseBody {
  /** The issued access token string. */
  access_token: string
  /** Fixed Bearer token type identifier. */
  token_type: 'Bearer'
  /** The lifetime in seconds of the access token (e.g. 900). */
  expires_in: number
  /** The issued refresh token string used to obtain new access tokens. */
  refresh_token: string
  /** Space-separated list of scopes granted to this token. */
  scope: string
}

/**
 * Cache control headers mandated by RFC 6749 §5.1.
 * Ensures token credentials are never cached by intermediary proxies or browsers.
 */
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

/**
 * Helper to construct an RFC 6749 §5.2 compliant OAuth token error response.
 *
 * @param context - Hono request context.
 * @param error - The standard OAuth error code.
 * @param description - Human-readable error description.
 * @returns HTTP Response with appropriate status (401 for invalid_client, 400 for others) and no-store headers.
 */
function tokenError(context: OAuthContext, error: OAuthErrorCode, description: string): Response {
  const status = error === OAUTH_ERRORS.INVALID_CLIENT ? 401 : 400
  return context.json({ error, error_description: description }, status, NO_STORE_HEADERS)
}

/**
 * Helper to construct an RFC 6749 §5.1 compliant successful token response.
 *
 * @param context - Hono request context.
 * @param body - The token payload.
 * @returns HTTP 200 Response with `no-store` headers.
 */
function tokenSuccess(context: OAuthContext, body: TokenResponseBody): Response {
  return context.json(body, 200, NO_STORE_HEADERS)
}

/**
 * Extracts a string form field from parsed multipart/url-encoded body.
 *
 * @param body - Parsed body object.
 * @param key - Parameter key name.
 * @returns The string value if present, or undefined if missing or a File.
 */
function readFormField(body: Record<string, string | File>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Handles the `authorization_code` grant exchange (RFC 6749 §4.1.3 + RFC 7636).
 *
 * Security checks performed:
 * 1. Validates presence of `code`, `redirect_uri`, `client_id`, and `code_verifier`.
 * 2. Resolves client and confirms it is active.
 * 3. Hashes the code with SHA-256 and retrieves the active record.
 * 4. **Replay detection**: If the code was already consumed (`consumedAt !== null`),
 *    immediately revokes all tokens originating from this authorization code family (RFC 6749 §4.1.2)
 *    and fails with `invalid_grant`.
 * 5. Matches `client_id` and `redirect_uri` against the values bound when the code was issued.
 * 6. Verifies the PKCE `code_verifier` against the code's `code_challenge` using `S256`.
 * 7. Marks the code as consumed atomically in persistence.
 * 8. Issues and returns a fresh access/refresh token pair.
 *
 * @param context - Hono request context.
 * @param body - The parsed url-encoded form body.
 * @returns HTTP response with token credentials or error.
 */
async function handleAuthorizationCodeGrant(context: OAuthContext, body: Record<string, string | File>): Promise<Response> {
  const code = readFormField(body, 'code')
  const redirectUri = readFormField(body, 'redirect_uri')
  const clientId = readFormField(body, 'client_id')
  const codeVerifier = readFormField(body, 'code_verifier')

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return tokenError(context, OAUTH_ERRORS.INVALID_REQUEST, 'code, redirect_uri, client_id and code_verifier are required')
  }

  const client = await context.get('oauthClientRepository').findActiveById(clientId)
  if (!client) return tokenError(context, OAUTH_ERRORS.INVALID_CLIENT, 'unknown or disabled client')

  const nowSeconds = context.get('clock').nowSeconds()
  const codeHash = await sha256hex(code)
  const codeRepository = context.get('oauthAuthorizationCodeRepository')
  const record = await codeRepository.findByHash(codeHash, nowSeconds)
  if (!record) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'unknown or expired authorization code')

  if (record.consumedAt !== null) {
    await context.get('oauthTokenRepository').revokeByAuthorizationCode(codeHash, nowSeconds)
    return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'authorization code already redeemed')
  }

  if (record.clientId !== clientId) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'client_id does not match the authorization code')
  if (record.redirectUri !== redirectUri) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'redirect_uri does not match the authorization code')

  const pkceValid = await verifyPkceChallenge(codeVerifier, record.codeChallenge, record.codeChallengeMethod)
  if (!pkceValid) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'code_verifier does not match code_challenge')

  const consumed = await codeRepository.consumeByHash(codeHash, nowSeconds)
  if (!consumed) {
    await context.get('oauthTokenRepository').revokeByAuthorizationCode(codeHash, nowSeconds)
    return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'authorization code already redeemed')
  }

  const pair = await issueTokenPair({
    tokenRepository: context.get('oauthTokenRepository'),
    idGenerator: context.get('idGenerator'),
    clientId,
    userId: record.userId,
    scope: record.scope,
    authorizationCodeHash: codeHash,
    nowSeconds,
  })

  return tokenSuccess(context, {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope: formatScopes(record.scope),
  })
}

/**
 * Handles the `refresh_token` grant exchange (RFC 6749 §6).
 *
 * Features and guarantees:
 * 1. **Refresh Token Rotation (RTR)**: The consumed refresh token is revoked, and a brand new
 *    refresh token is returned alongside the new access token.
 * 2. **Scope Narrowing**: Allows the client to request an equal or smaller subset of the originally
 *    granted scopes. If omitted, retains the previous scope set.
 * 3. **Atomic rollback**: If revoking the previous refresh token fails (e.g. concurrent race condition),
 *    the newly created token pair is immediately invalidated.
 *
 * @param context - Hono request context.
 * @param body - The parsed form body.
 * @returns HTTP response with token credentials or error.
 */
async function handleRefreshTokenGrant(context: OAuthContext, body: Record<string, string | File>): Promise<Response> {
  const refreshToken = readFormField(body, 'refresh_token')
  const clientId = readFormField(body, 'client_id')
  const requestedScope = readFormField(body, 'scope')

  if (!refreshToken || !clientId) {
    return tokenError(context, OAUTH_ERRORS.INVALID_REQUEST, 'refresh_token and client_id are required')
  }

  const client = await context.get('oauthClientRepository').findActiveById(clientId)
  if (!client) return tokenError(context, OAUTH_ERRORS.INVALID_CLIENT, 'unknown or disabled client')

  const nowSeconds = context.get('clock').nowSeconds()
  const oldHash = await sha256hex(refreshToken)
  const tokenRepository = context.get('oauthTokenRepository')
  const old = await tokenRepository.findActiveByHash(oldHash, 'refresh', nowSeconds)
  if (!old) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'unknown, expired or revoked refresh token')
  if (old.clientId !== clientId) return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'client_id does not match the refresh token')

  let resolvedScopes: OAuthScope[]
  if (!requestedScope) {
    resolvedScopes = old.scope
  } else {
    const parsed = parseScopeString(requestedScope)
    if (!parsed || !isScopeSubset(parsed, old.scope)) {
      return tokenError(context, OAUTH_ERRORS.INVALID_SCOPE, 'requested scope exceeds the scope originally granted')
    }
    resolvedScopes = parsed
  }

  const pair = await issueTokenPair({
    tokenRepository,
    idGenerator: context.get('idGenerator'),
    clientId,
    userId: old.userId,
    scope: resolvedScopes,
    authorizationCodeHash: old.authorizationCodeHash,
    nowSeconds,
  })

  try {
    const revoked = await tokenRepository.revokeByHash(oldHash, nowSeconds)
    if (!revoked) {
      await tokenRepository.revokeByHash(pair.refreshTokenHash, nowSeconds)
      await tokenRepository.revokeByHash(pair.accessTokenHash, nowSeconds)
      return tokenError(context, OAUTH_ERRORS.INVALID_GRANT, 'refresh token is no longer valid')
    }
  } catch (error) {
    await tokenRepository.revokeByHash(pair.refreshTokenHash, nowSeconds).catch(() => {})
    await tokenRepository.revokeByHash(pair.accessTokenHash, nowSeconds).catch(() => {})
    throw error
  }

  return tokenSuccess(context, {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope: formatScopes(resolvedScopes),
  })
}

/**
 * `POST /oauth/token`
 *
 * Client-facing token endpoint (RFC 6749 §3.2). Unauthenticated by user session;
 * authenticated by the grant parameters themselves (authorization code + PKCE verifier, or refresh token).
 *
 * Protections:
 * - Dual-key rate limiting (per client IP and per `client_id` account key).
 * - Supported grants: `authorization_code` and `refresh_token`.
 * - Strictly sets `Cache-Control: no-store, Pragma: no-cache`.
 *
 * @param context - Hono request context.
 * @returns HTTP response with token payload, RFC error object, or rate limit notification.
 */
export async function tokenHandler(context: OAuthContext): Promise<Response> {
  try {
    const body = (await context.req.parseBody()) as Record<string, string | File>
    const rawClientId = readFormField(body, 'client_id')

    const clientIp = getClientIp(context.req)
    const rateLimit = await checkDualKeyRateLimit({
      ipLimiter: context.get('rateLimiters').getLimiter('oauthToken'),
      accountLimiter: context.get('rateLimiters').getLimiter('oauthTokenAccount'),
      clientIp,
      accountKey: rawClientId || 'unknown',
    })
    if (!rateLimit.isAllowed) {
      return context.json(
        { error: OAUTH_ERRORS.INVALID_REQUEST, error_description: 'Too many requests' },
        429,
        { ...NO_STORE_HEADERS, ...(rateLimit.retryAfterSeconds !== undefined ? { 'Retry-After': String(rateLimit.retryAfterSeconds) } : {}) },
      )
    }

    const grantType = readFormField(body, 'grant_type')
    if (grantType === 'authorization_code') return handleAuthorizationCodeGrant(context, body)
    if (grantType === 'refresh_token') return handleRefreshTokenGrant(context, body)
    return tokenError(context, OAUTH_ERRORS.UNSUPPORTED_GRANT_TYPE, 'unsupported grant_type')
  } catch (error) {
    if (context.env.ENV !== 'production') {
      console.error('OAuth token error:', error)
    }
    return context.json({ error: OAUTH_ERRORS.SERVER_ERROR, error_description: 'An error occurred' }, 500, NO_STORE_HEADERS)
  }
}
