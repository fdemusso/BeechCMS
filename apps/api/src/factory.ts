/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Seed } from '@beechcms/core'
import type { Env, Variables } from './types'

// Imports delle rotte e middleware
import { AUTH_ERRORS } from './auth/constants'
import {
  parseLoginBody,
  validateLoginInput,
  findUserByEmail,
  verifyPassword,
  DUMMY_PASSWORD_HASH,
} from './auth/login'
import {
  generateRefreshToken,
  saveRefreshToken,
  generateAccessToken,
  validateRefreshToken,
  revokeRefreshToken,
} from './auth/refresh'
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
import { statsApp } from './features/stats'
import { uploadRoutes, serveMediaHandler } from './upload'
import { publicRoutes, apiKeyMiddleware, publicRateLimitMiddleware } from './public'
import { searchRouter } from "./search"
import { repositoryMiddleware } from './middleware/repository.middleware'

export interface BeechConfig {
  seeds: Seed[] | Record<string, Seed>
}

// --- Costanti e helper ---
const REFRESH_TOKEN_EXPIRY_DAYS = 7
const SECONDS_PER_DAY = 24 * 60 * 60

function isRequestSecure(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? 'unknown'
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
  const registry: Record<string, Seed> = Object.fromEntries(seedsArray.map(s => [s.slug, s]))
  const getSeedFn = (slug: string): Seed | null => registry[slug] ?? null

  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  // 1. Core Middleware (Seeds, CORS, Security)
  app.use('*', async (context, next) => {
    context.set('getSeed', getSeedFn)
    context.set('seedRegistry', registry)
    await next()
  })

  // 1.1 Repository Injection
  app.use('*', repositoryMiddleware())

  app.use('*', async (context, next) => {
    const origins = (context.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    return cors({
      origin: (origin) => {
        // If same-origin (no Origin header) or matched in CORS_ORIGINS
        if (!origin || origins.includes(origin)) return origin || origins[0]
        
        // Allow same-origin if the host matches
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
    if (context.req.method !== 'OPTIONS' && context.res.status >= 200 && context.res.status < 300) {
      const db = context.env.DB
      let executionCtx: any
      try { executionCtx = context.executionCtx } catch {}

      if (db && executionCtx) {
        const seed = extractPublicSeed(context.req.path)
        executionCtx.waitUntil((async () => {
          try {
            const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
            await db.prepare(
              `INSERT INTO analytics (day_ts, metric, seed, value)
               VALUES (?, 'requests', ?, 1)
               ON CONFLICT(day_ts, metric, seed) DO UPDATE SET value = value + 1`
            ).bind(today, seed).run()
          } catch (error) {
            console.error('Analytics middleware error:', error)
          }
        })())
      }
    }
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

      const loginLimiter = context.env.LOGIN_RATE_LIMITER
      if (loginLimiter) {
        const clientIp = getClientIp(context.req.raw.headers)
        const { success } = await loginLimiter.limit({ key: `${clientIp}:${email}` })
        if (!success) return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }

      const { DB, JWT_SECRET } = context.env
      const user = await findUserByEmail(DB, email)
      const hashToCompare = user?.password_hash ?? DUMMY_PASSWORD_HASH
      const isValid = await verifyPassword(password, hashToCompare)

      if (!user || !isValid) return context.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)

      const userProfile = await DB.prepare('SELECT name FROM users WHERE id = ? LIMIT 1').bind(user.id).first<{ name: string | null }>()
      const accessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
        issuer: context.env.JWT_ISSUER,
        audience: context.env.JWT_AUDIENCE,
      }, userProfile?.name ?? undefined)
      const refreshToken = generateRefreshToken()

      await saveRefreshToken(DB, user.id, refreshToken, REFRESH_TOKEN_EXPIRY_DAYS)
      setCookie(context, 'refresh_token', refreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
      return context.json({ token: accessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      return handleAuthError(context, error, 'Login')
    }
  })

  app.post('/auth/refresh', async (context) => {
    try {
      const refreshLimiter = context.env.REFRESH_RATE_LIMITER
      if (refreshLimiter) {
        const clientIp = getClientIp(context.req.raw.headers)
        const { success } = await refreshLimiter.limit({ key: clientIp })
        if (!success) return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }

      const refreshToken = getCookie(context, 'refresh_token')
      if (!refreshToken) return context.json({ error: 'Refresh token missing' }, 401)

      const { DB, JWT_SECRET } = context.env
      const validation = await validateRefreshToken(DB, refreshToken)
      if (!validation.valid || !validation.userId) return context.json({ error: 'Invalid refresh token' }, 401)

      const user = await DB.prepare('SELECT id, email, name FROM users WHERE id = ? LIMIT 1').bind(validation.userId).first<{ id: string; email: string; name: string | null }>()
      if (!user) return context.json({ error: 'User not found' }, 401)

      const revoked = await revokeRefreshToken(DB, refreshToken)
      if (!revoked) return context.json({ error: 'Invalid refresh token' }, 401)

      const newAccessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
        issuer: context.env.JWT_ISSUER,
        audience: context.env.JWT_AUDIENCE,
      }, user.name ?? undefined)
      const newRefreshToken = generateRefreshToken()

      await saveRefreshToken(DB, user.id, newRefreshToken, REFRESH_TOKEN_EXPIRY_DAYS)
      setCookie(context, 'refresh_token', newRefreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
      return context.json({ token: newAccessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      return handleAuthError(context, error, 'Refresh')
    }
  })

  app.post('/auth/logout', async (context) => {
    try {
      const refreshToken = getCookie(context, 'refresh_token')
      if (refreshToken) await revokeRefreshToken(context.env.DB, refreshToken)
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
  apiProtected.use('*', async (context, next) => {
    await authMiddleware(context.env.JWT_SECRET, {
      issuer: context.env.JWT_ISSUER,
      audience: context.env.JWT_AUDIENCE,
    })(context, next)
  })

  apiProtected.route('/settings', settingsApp)
  apiProtected.route('/schema', schemaApp)
  apiProtected.route('/content', notificationsApp)
  apiProtected.route('/content', statsApp)
  apiProtected.route('/content', rotateFieldApp)
  apiProtected.route('/content', draftApp)
  apiProtected.route('/content', contentFeature)
  apiProtected.route('/widget', widgetApp)
  
  app.route('/api', apiProtected)
  app.route('/api/search', searchRouter)
  app.route('/api', uploadRoutes)
  app.get('/api/media/:key', (context) => serveMediaHandler(context))

  // 6. Public API
  const apiPublic = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiPublic.use('*', publicRateLimitMiddleware())
  apiPublic.use('*', apiKeyMiddleware())
  apiPublic.route('/', publicRoutes)
  app.route('/api/v1/public', apiPublic)

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
