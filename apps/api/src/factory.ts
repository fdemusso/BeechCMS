// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Seed, ContentRepository, IdempotencyRepository, BeechBucket, MediaRepository, SystemStatsRepository } from '@beechcms/core'
import { sha256hex, SystemClock, SystemIdGenerator, SeedRegistry, buildBackrefMap } from '@beechcms/core'
import type { Env, Variables } from './types'
import { getClientIp } from './shared/request-utils'

// Imports delle rotte e middleware
import { AUTH_ERRORS } from './auth/constants'
import {
  parseLoginBody,
  validateLoginInput,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from './auth/login'
import { generateRefreshToken } from './auth/refresh'
import { authMiddleware } from './middleware'
import contentFeature from './features/content'
import { widgetApp } from './widget'
import { rotateFieldApp } from './features/rotate-field'
import { passwordResetApp } from './features/password-reset'
import { setupApp } from './features/setup'
import { draftApp } from './features/draft'
import { settingsApp } from './features/settings/settings.handler'
import { schemaApp } from './features/schema/schema.handler'
import { notificationsApp } from './features/notifications'
import { automationsApp } from './features/automations'
import { statsApp } from './features/stats'
import { backrefsApp } from './features/backrefs'
import { uploadRoutes, serveMediaHandler } from './upload'
import { publicRoutes, apiKeyMiddleware, publicRateLimitMiddleware } from './public'
import { searchRouter } from "./search"
import { repositoryMiddleware } from './middleware/repository.middleware'
import { storageMiddleware } from './middleware/storage.middleware'
import { authProvidersMiddleware } from './middleware/auth-providers.middleware'
import { rateLimiterMiddleware } from './middleware/rate-limit.middleware'
import { observabilityMiddleware } from './middleware/observability.middleware'

export interface BeechConfig {
  seeds: Seed[] | Record<string, Seed>
  repository?: ContentRepository
  idempotencyRepository?: IdempotencyRepository
  bucket?: BeechBucket
  mediaRepository?: MediaRepository
  systemStatsRepository?: SystemStatsRepository
}

// --- Costanti e helper ---
const REFRESH_TOKEN_EXPIRY_DAYS = 7
const SECONDS_PER_DAY = 24 * 60 * 60

function isRequestSecure(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

function getRefreshTokenCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
    path: '/auth',
  }
}

function getRefreshTokenDeleteCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    path: '/auth',
  }
}

function handleAuthError(context: any, error: unknown, operationName: string): Response {
  if (context.env.ENV !== 'production') {
    console.error(`${operationName} error:`, error)
  }
  return context.json({ error: AUTH_ERRORS.GENERIC_ERROR }, 500)
}

function extractPublicSeed(path: string): string {
  const match = path.match(/^\/api\/v1\/public\/([^/?]+)/)
  return match ? match[1] : ''
}

/**
 * Builds a fully configured Hono app with the given seeds injected into context.
 * This is the main entry point for a BeechCMS project.
 */
export function createBeechApp(config: BeechConfig): Hono<{ Bindings: Env; Variables: Variables }> {
  const seedsArray = Array.isArray(config.seeds) ? config.seeds : Object.values(config.seeds)
  // Filter out any invalid objects that might have leaked into the registry (e.g. module exports)
  const validSeeds = seedsArray.filter(s => s && typeof s === 'object' && 'slug' in s)
  const seedRegistry = new SeedRegistry(validSeeds)

  // Build once at factory time — read-only, safe to share across requests
  const backrefMap = buildBackrefMap(validSeeds)

  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  // 1. Core Middleware (Seeds, CORS, Security)
  app.use('*', async (context, next) => {
    context.set('getSeed', (slug: string) => seedRegistry.get(slug))
    context.set('seedRegistry', seedRegistry)
    context.set('backrefMap', backrefMap)
    await next()
  })

  // 1.1 Repository Injection
  app.use('*', repositoryMiddleware({
    repository: config.repository,
    idempotencyRepository: config.idempotencyRepository,
    mediaRepository: config.mediaRepository,
    systemStatsRepository: config.systemStatsRepository,
  }))

  app.use('*', storageMiddleware({
    bucket: config.bucket,
  }))

  app.use('*', authProvidersMiddleware())
  app.use('*', rateLimiterMiddleware())
  app.use('*', observabilityMiddleware())

  app.use('*', async (context, next) => {
    const isDev = context.env.ENV !== 'production'

    return cors({
      origin: (origin) => {
        if (!origin) return origin ?? ''

        // In dev, allow all localhost/127.0.0.1 origins regardless of port
        if (isDev) {
          try {
            const { hostname } = new URL(origin)
            if (hostname === 'localhost' || hostname === '127.0.0.1') return origin
          } catch {}
        }

        const origins = (context.env.CORS_ORIGINS ?? 'http://localhost:5173')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)

        if (origins.includes(origin)) return origin

        // Allow same-origin requests
        try {
          const originUrl = new URL(origin)
          const requestUrl = new URL(context.req.url)
          if (originUrl.hostname === requestUrl.hostname && originUrl.port === requestUrl.port) {
            return origin
          }
        } catch {}

        return null
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    })(context, next)
  })

  app.use('*', async (context, next) => {
    await next()
    if (context.req.path.startsWith('/admin')) return
    context.header('X-Frame-Options', 'DENY')
    context.header('X-Content-Type-Options', 'nosniff')
    context.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    context.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    context.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
  })

  // 2. Analytics Middleware
  app.use('/api/*', async (context, next) => {
    await next()
    if (context.req.method === 'OPTIONS') return
    if (context.res.status < 200 || context.res.status >= 300) return

    let executionCtx: any
    try { executionCtx = context.executionCtx } catch {}
    if (!executionCtx) return

    const analyticsRepository = context.get('analyticsRepository')
    if (!analyticsRepository) return

    const seedSlug = extractPublicSeed(context.req.path)

    executionCtx.waitUntil(
      analyticsRepository.recordRequest(seedSlug).catch((error: unknown) => {
        console.error('Analytics middleware error:', error)
      })
    )
  })

  // 3. Auth Routes
  app.post('/auth/login', async (context) => {
    try {
      let body: any
      try { body = await context.req.json() } catch { return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400) }
      const credentials = parseLoginBody(body)
      if (!credentials) return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
      const { email, password } = credentials
      if (!validateLoginInput(email, password)) return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)

      const clientIp = getClientIp(context.req)
      const loginRateLimit = await context.get('rateLimiters').getLimiter('login').checkLimit(clientIp)
      if (!loginRateLimit.isAllowed) return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)

      const user = await context.get('userRepository').findByEmail(email)
      const hashToCompare = user?.passwordHash ?? DUMMY_PASSWORD_HASH
      const isValid = await verifyPassword(password, hashToCompare, context.get('hashProvider'))

      if (!user || !isValid) return context.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)

      const accessToken = await context.get('tokenService').issue({ sub: user.id, email: user.email, name: user.name ?? undefined })
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

  app.post('/auth/refresh', async (context) => {
    try {
      const refreshClientIp = getClientIp(context.req)
      const refreshRateLimit = await context.get('rateLimiters').getLimiter('tokenRefresh').checkLimit(refreshClientIp)
      if (!refreshRateLimit.isAllowed) return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)

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

      // Issue new tokens before revoking the old one: if saveRefreshToken fails,
      // the old token stays valid and the user is not locked out.
      const newAccessToken = await context.get('tokenService').issue({ sub: user.id, email: user.email, name: user.name ?? undefined })
      const newRefreshToken = generateRefreshToken()
      const newRefreshTokenHash = await sha256hex(newRefreshToken)

      await context.get('sessionRepository').saveRefreshToken({
        id: SystemIdGenerator.uuid(),
        userId: user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt: nowSeconds + REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
      })

      const revoked = await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
      if (!revoked) return context.json({ error: 'Invalid refresh token' }, 401)

      setCookie(context, 'refresh_token', newRefreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
      return context.json({ token: newAccessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      return handleAuthError(context, error, 'Refresh')
    }
  })

  app.post('/auth/logout', async (context) => {
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

  // 4. Setup & Password Reset
  app.route('/', setupApp)
  app.route('/', passwordResetApp)

  // 5. Protected CMS API
  const apiProtected = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiProtected.use('*', authMiddleware())

  apiProtected.route('/settings', settingsApp)
  apiProtected.route('/schema', schemaApp)
  apiProtected.route('/content', notificationsApp)
  apiProtected.route('/content', statsApp)
  apiProtected.route('/content', rotateFieldApp)
  apiProtected.route('/content', draftApp)
  apiProtected.route('/content', backrefsApp)
  apiProtected.route('/content', contentFeature)
  apiProtected.route('/widget', widgetApp)
  apiProtected.route('/automations', automationsApp)
  apiProtected.route('/', uploadRoutes)
  
  // 6. Public API (must be registered before apiProtected to avoid auth middleware interception)
  const apiPublic = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiPublic.use('*', publicRateLimitMiddleware())
  apiPublic.use('*', apiKeyMiddleware())
  apiPublic.route('/', publicRoutes)
  app.route('/api/v1/public', apiPublic)

  app.get('/api/media/:key', (context) => serveMediaHandler(context))
  app.route('/api', apiProtected)
  app.route('/api/search', searchRouter)

  // 7. Dashboard SPA — serve static assets from Workers Assets binding
  app.get('/admin', (context) => context.redirect('/admin/', 301))
  app.get('/admin/*', async (context) => {
    if (!context.env.ASSETS) {
      return context.text('Dashboard not configured. Set up the ASSETS binding in wrangler.toml pointing to node_modules/@beechcms/api/assets/dashboard', 503)
    }
    const url = new URL(context.req.url)
    const originalPath = url.pathname
    url.pathname = originalPath.replace(/^\/admin/, '') || '/'
    
    let assetResponse = await context.env.ASSETS.fetch(new Request(url.toString(), context.req.raw))
    if (assetResponse.status === 404) {
      // SPA fallback: any unmatched /admin/* route serves index.html
      assetResponse = await context.env.ASSETS.fetch(new Request(new URL('/index.html', context.req.url)))
    }
    // ASSETS returns an immutable Response — wrap it to inject security headers
    const headers = new Headers(assetResponse.headers)
    headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'"
    )
    headers.set('X-Frame-Options', 'DENY')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    return new Response(assetResponse.body, { status: assetResponse.status, headers })
  })

  return app
}
