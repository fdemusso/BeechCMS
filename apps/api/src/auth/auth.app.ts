// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module @beechcms/api/auth
 * @description Authentication router sub-application providing login, refresh, and logout endpoints.
 */

/// <reference types="@cloudflare/workers-types" />
import { Hono, type Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sha256hex, SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { Env, Variables } from '../types'
import { AUTH_ERRORS } from './constants'
import {
  parseLoginBody,
  validateLoginInput,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from './utils/login-helpers'
import { generateRefreshToken } from './utils/refresh-token'
import { getClientIp } from '../shared/utils/request-utils'
import { checkDualKeyRateLimit, normalizeAccountKey } from '../shared/utils/dual-key-rate-limiter'

/** Refresh token expiration duration in days (7 days). */
const REFRESH_TOKEN_EXPIRY_DAYS = 7

/** Number of seconds in a 24-hour day. */
const SECONDS_PER_DAY = 24 * 60 * 60

/** Path scope for auth refresh cookies. */
const AUTH_COOKIE_PATH = '/auth'

/** Context type specialized for the authentication sub-application. */
type AuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * Determines whether the incoming request URL was transmitted over HTTPS.
 *
 * @param url - Absolute URL of the incoming request.
 * @returns `true` if the protocol is HTTPS; otherwise `false`.
 */
function isRequestSecure(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

/**
 * Constructs cookie options for setting the persistent refresh token.
 *
 * @param secure - Whether the cookie requires HTTPS transport.
 * @returns Options object compatible with `hono/cookie` `setCookie`.
 */
function getRefreshTokenCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
    path: AUTH_COOKIE_PATH,
  }
}

/**
 * Constructs cookie options for deleting the refresh token cookie.
 *
 * @param secure - Whether the cookie requires HTTPS transport.
 * @returns Options object compatible with `hono/cookie` `deleteCookie`.
 */
function getRefreshTokenDeleteCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    path: AUTH_COOKIE_PATH,
  }
}

/**
 * Builds a standardized 429 Too Many Requests response with optional Retry-After header.
 *
 * @param context - Hono request context.
 * @param retryAfterSeconds - Optional seconds to wait before retrying.
 * @returns Standard HTTP 429 response.
 */
function createRateLimitResponse(context: AuthContext, retryAfterSeconds?: number): Response {
  const headers: Record<string, string> = {}
  if (retryAfterSeconds !== undefined) {
    headers['Retry-After'] = String(retryAfterSeconds)
  }
  return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
}

/**
 * Handles unexpected authentication errors and returns a generic 500 error response.
 * In non-production environments, logs the error details for diagnostics.
 *
 * @param context - Hono request context.
 * @param error - The caught error instance or rejection reason.
 * @param operationName - Human-readable operation name for diagnostic logging.
 * @returns Standard HTTP 500 response.
 */
function handleAuthError(context: AuthContext, error: unknown, operationName: string): Response {
  if (context.env.ENV !== 'production') {
    console.error(`${operationName} error:`, error)
  }
  return context.json({ error: AUTH_ERRORS.GENERIC_ERROR }, 500)
}

/**
 * Hono router for all authentication endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`).
 */
export const authApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * POST /auth/login
 *
 * Authenticates user credentials via dual-key rate limiting, constant-time password hash comparison,
 * and issues a short-lived access JWT token plus a rotated HTTP-only refresh cookie.
 */
authApp.post('/auth/login', async (context) => {
  try {
    const clientIp = getClientIp(context.req)

    const rawBody: unknown = await context.req.json().catch(() => null)
    const credentials = parseLoginBody(rawBody)

    if (!credentials || !validateLoginInput(credentials.email, credentials.password)) {
      const ipLimit = await context.get('rateLimiters').getLimiter('login').checkLimit(clientIp)
      if (!ipLimit.isAllowed) {
        return createRateLimitResponse(context, ipLimit.retryAfterSeconds)
      }
      return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
    }

    const { email, password } = credentials

    // Dual-Key Rate Limit Check (pre-database, pre-crypto)
    const dualKeyResult = await checkDualKeyRateLimit({
      ipLimiter: context.get('rateLimiters').getLimiter('login'),
      accountLimiter: context.get('rateLimiters').getLimiter('loginAccount'),
      clientIp,
      accountKey: email,
    })

    if (!dualKeyResult.isAllowed) {
      return createRateLimitResponse(context, dualKeyResult.retryAfterSeconds)
    }

    const normalizedEmail = normalizeAccountKey(email)
    const user = await context.get('userRepository').findByEmail(normalizedEmail)
    const hashToCompare = user?.passwordHash ?? DUMMY_PASSWORD_HASH
    const isValid = await verifyPassword(password, hashToCompare, context.get('hashProvider'))

    if (!user || !isValid) return context.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)

    const accessToken = await context.get('tokenService').issue({
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
      surname: user.surname ?? undefined,
      role: user.role,
    })
    const refreshToken = generateRefreshToken()
    const refreshTokenHash = await sha256hex(refreshToken)
    const nowSeconds = SystemClock.nowSeconds()

    await context.get('sessionRepository').saveRefreshToken({
      id: SystemIdGenerator.uuid(),
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: nowSeconds + REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
    })

    setCookie(context, 'refresh_token', refreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
    return context.json({ token: accessToken, expiresIn: '15m' }, 200)
  } catch (error) {
    return handleAuthError(context, error, 'Login')
  }
})

/**
 * POST /auth/refresh
 *
 * Rotates an existing refresh token session, issuing a new JWT access token and replacing
 * the refresh token cookie with automatic single-use rotation and atomic revocation rollback.
 */
authApp.post('/auth/refresh', async (context) => {
  try {
    const clientIp = getClientIp(context.req)
    const refreshRateLimit = await context.get('rateLimiters').getLimiter('tokenRefresh').checkLimit(clientIp)
    if (!refreshRateLimit.isAllowed) {
      return createRateLimitResponse(context, refreshRateLimit.retryAfterSeconds)
    }

    const refreshToken = getCookie(context, 'refresh_token')
    if (!refreshToken) return context.json({ error: 'Refresh token missing' }, 401)

    const nowSeconds = SystemClock.nowSeconds()
    const tokenHash = await sha256hex(refreshToken)
    const activeSession = await context.get('sessionRepository').findActiveByHash(tokenHash, nowSeconds)
    if (!activeSession) return context.json({ error: 'Invalid refresh token' }, 401)

    const user = await context.get('userRepository').findById(activeSession.userId)
    if (!user) {
      await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
      return context.json({ error: 'User not found' }, 401)
    }

    // Issue new tokens before revoking the old one to avoid lockout on persistence failure
    const newAccessToken = await context.get('tokenService').issue({
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
      surname: user.surname ?? undefined,
      role: user.role,
    })
    const newRefreshToken = generateRefreshToken()
    const newRefreshTokenHash = await sha256hex(newRefreshToken)

    await context.get('sessionRepository').saveRefreshToken({
      id: SystemIdGenerator.uuid(),
      userId: user.id,
      tokenHash: newRefreshTokenHash,
      expiresAt: nowSeconds + REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
    })

    try {
      const revoked = await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
      if (!revoked) {
        await context.get('sessionRepository').revokeByHash(newRefreshTokenHash, nowSeconds)
        return context.json({ error: 'Invalid refresh token' }, 401)
      }

      setCookie(context, 'refresh_token', newRefreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
      return context.json({ token: newAccessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      await context.get('sessionRepository').revokeByHash(newRefreshTokenHash, nowSeconds).catch(() => {})
      throw error
    }
  } catch (error) {
    return handleAuthError(context, error, 'Refresh')
  }
})

/**
 * POST /auth/logout
 *
 * Revokes the active session associated with the provided refresh token cookie and clears the cookie.
 */
authApp.post('/auth/logout', async (context) => {
  try {
    const refreshToken = getCookie(context, 'refresh_token')
    if (refreshToken) {
      const nowSeconds = SystemClock.nowSeconds()
      const tokenHash = await sha256hex(refreshToken)
      await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
    }
    deleteCookie(context, 'refresh_token', getRefreshTokenDeleteCookieOptions(isRequestSecure(context.req.url)))
    return context.json({ message: 'Logged out' }, 200)
  } catch (error) {
    return handleAuthError(context, error, 'Logout')
  }
})
