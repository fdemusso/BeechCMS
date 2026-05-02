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
import { contentRoutes } from './content'
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

export interface BeechConfig {
  seeds: Seed[]
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

function handleAuthError(c: any, err: unknown, operationName: string): Response {
  if (c.env.ENV !== 'production') {
    console.error(`${operationName} error:`, err)
  }
  return c.json({ error: AUTH_ERRORS.GENERIC_ERROR }, 500)
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
  const registry: Record<string, Seed> = Object.fromEntries(config.seeds.map(s => [s.slug, s]))
  const getSeedFn = (slug: string): Seed | null => registry[slug] ?? null

  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  // 1. Core Middleware (Seeds, CORS, Security)
  app.use('*', async (c, next) => {
    c.set('getSeed', getSeedFn)
    c.set('seedRegistry', registry)
    await next()
  })

  app.use('*', async (c, next) => {
    const origins = (c.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    return cors({
      origin: (origin) => {
        if (!origin) return origins[0] ?? null
        return origins.includes(origin) ? origin : null
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      credentials: true,
    })(c, next)
  })

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    c.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
  })

  // 2. Analytics Middleware
  app.use('/api/*', async (c, next) => {
    await next()
    if (c.req.method !== 'OPTIONS' && c.res.status >= 200 && c.res.status < 300) {
      const db = c.env.DB
      let executionCtx: any
      try { executionCtx = c.executionCtx } catch {}

      if (db && executionCtx) {
        const seed = extractPublicSeed(c.req.path)
        executionCtx.waitUntil((async () => {
          try {
            const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
            await db.prepare(
              `INSERT INTO analytics (day_ts, metric, seed, value)
               VALUES (?, 'requests', ?, 1)
               ON CONFLICT(day_ts, metric, seed) DO UPDATE SET value = value + 1`
            ).bind(today, seed).run()
          } catch (err) {
            console.error('Analytics middleware error:', err)
          }
        })())
      }
    }
  })

  // 3. Auth Routes
  app.post('/auth/login', async (c) => {
    try {
      let body: any
      try { body = await c.req.json() } catch { return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400) }
      const credentials = parseLoginBody(body)
      if (!credentials) return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
      const { email, password } = credentials
      if (!validateLoginInput(email, password)) return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)

      const loginLimiter = c.env.LOGIN_RATE_LIMITER
      if (loginLimiter) {
        const clientIp = getClientIp(c.req.raw.headers)
        const { success } = await loginLimiter.limit({ key: `${clientIp}:${email}` })
        if (!success) return c.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }

      const { DB, JWT_SECRET } = c.env
      const user = await findUserByEmail(DB, email)
      const hashToCompare = user?.password_hash ?? DUMMY_PASSWORD_HASH
      const isValid = await verifyPassword(password, hashToCompare)

      if (!user || !isValid) return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)

      const userProfile = await DB.prepare('SELECT name FROM users WHERE id = ? LIMIT 1').bind(user.id).first<{ name: string | null }>()
      const accessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
        issuer: c.env.JWT_ISSUER,
        audience: c.env.JWT_AUDIENCE,
      }, userProfile?.name ?? undefined)
      const refreshToken = generateRefreshToken()

      await saveRefreshToken(DB, user.id, refreshToken, REFRESH_TOKEN_EXPIRY_DAYS)
      setCookie(c, 'refresh_token', refreshToken, getRefreshTokenCookieOptions(isRequestSecure(c.req.url)))
      return c.json({ token: accessToken, expiresIn: '15m' }, 200)
    } catch (err) {
      return handleAuthError(c, err, 'Login')
    }
  })

  app.post('/auth/refresh', async (c) => {
    try {
      const refreshLimiter = c.env.REFRESH_RATE_LIMITER
      if (refreshLimiter) {
        const clientIp = getClientIp(c.req.raw.headers)
        const { success } = await refreshLimiter.limit({ key: clientIp })
        if (!success) return c.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }

      const refreshToken = getCookie(c, 'refresh_token')
      if (!refreshToken) return c.json({ error: 'Refresh token missing' }, 401)

      const { DB, JWT_SECRET } = c.env
      const validation = await validateRefreshToken(DB, refreshToken)
      if (!validation.valid || !validation.userId) return c.json({ error: 'Invalid refresh token' }, 401)

      const user = await DB.prepare('SELECT id, email, name FROM users WHERE id = ? LIMIT 1').bind(validation.userId).first<{ id: string; email: string; name: string | null }>()
      if (!user) return c.json({ error: 'User not found' }, 401)

      const revoked = await revokeRefreshToken(DB, refreshToken)
      if (!revoked) return c.json({ error: 'Invalid refresh token' }, 401)

      const newAccessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
        issuer: c.env.JWT_ISSUER,
        audience: c.env.JWT_AUDIENCE,
      }, user.name ?? undefined)
      const newRefreshToken = generateRefreshToken()

      await saveRefreshToken(DB, user.id, newRefreshToken, REFRESH_TOKEN_EXPIRY_DAYS)
      setCookie(c, 'refresh_token', newRefreshToken, getRefreshTokenCookieOptions(isRequestSecure(c.req.url)))
      return c.json({ token: newAccessToken, expiresIn: '15m' }, 200)
    } catch (err) {
      return handleAuthError(c, err, 'Refresh')
    }
  })

  app.post('/auth/logout', async (c) => {
    try {
      const refreshToken = getCookie(c, 'refresh_token')
      if (refreshToken) await revokeRefreshToken(c.env.DB, refreshToken)
      deleteCookie(c, 'refresh_token', getRefreshTokenDeleteCookieOptions(isRequestSecure(c.req.url)))
      return c.json({ message: 'Logged out' }, 200)
    } catch (err) {
      return handleAuthError(c, err, 'Logout')
    }
  })

  // 4. Setup & Password Reset
  app.route('/', setupApp)
  app.route('/', passwordResetApp)

  // 5. Protected CMS API
  const apiProtected = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiProtected.use('*', async (c, next) => {
    await authMiddleware(c.env.JWT_SECRET, {
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
    })(c, next)
  })

  apiProtected.route('/settings', settingsApp)
  apiProtected.route('/schema', schemaApp)
  apiProtected.route('/content', notificationsApp)
  apiProtected.route('/content', statsApp)
  apiProtected.route('/content', rotateFieldApp)
  apiProtected.route('/content', draftApp)
  apiProtected.route('/content', contentRoutes)
  apiProtected.route('/widget', widgetApp)
  
  app.route('/api', apiProtected)
  app.route('/api/search', searchRouter)
  app.route('/api', uploadRoutes)
  app.get('/api/media/:key', (c) => serveMediaHandler(c))

  // 6. Public API
  const apiPublic = new Hono<{ Bindings: Env; Variables: Variables }>()
  apiPublic.use('*', publicRateLimitMiddleware())
  apiPublic.use('*', apiKeyMiddleware())
  apiPublic.route('/', publicRoutes)
  app.route('/api/v1/public', apiPublic)

  return app
}
