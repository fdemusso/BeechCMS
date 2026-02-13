/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
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

// --- Tipi ---

/** Bindings Cloudflare Workers: DB (D1), JWT_SECRET, rate limiters, variabili env */
type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  LOGIN_RATE_LIMITER?: RateLimit
  REFRESH_RATE_LIMITER?: RateLimit
  CORS_ORIGINS?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

// --- Costanti e helper ---

/** Giorni di validità del refresh token */
const REFRESH_TOKEN_EXPIRY_DAYS = 7

/** Secondi in un giorno (per maxAge cookie) */
const SECONDS_PER_DAY = 24 * 60 * 60

/** Restituisce true se la richiesta è su HTTPS */
function isRequestSecure(url: string): boolean {
  return new URL(url).protocol === 'https:'
}

/** Estrae l'IP del client (header Cloudflare) o 'unknown' se non disponibile */
function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? 'unknown'
}

/** Opzioni comuni per il cookie refresh_token */
function getRefreshTokenCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
    path: '/auth',
  }
}

/** Logga l'errore solo in sviluppo e restituisce risposta 500 generica */
function handleAuthError(
  c: Context<{ Bindings: Bindings }>,
  err: unknown,
  operationName: string
): Response {
  if (c.env.ENV !== 'production') {
    console.error(`${operationName} error:`, err)
  }
  return c.json({ error: AUTH_ERRORS.GENERIC_ERROR }, 500)
}

// --- App ---

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// CORS: origins da CORS_ORIGINS (virgola-separati), default localhost per sviluppo
app.use('*', async (c, next) => {
  const origins = (c.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const corsMiddleware = cors({
    origin: (origin) => (origins.includes(origin) ? origin : origins[0] ?? null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Necessario per httpOnly cookies
  })
  return corsMiddleware(c, next)
})

// Security headers: protezione XSS, clickjacking, MIME sniffing
app.use('*', async (c, next) => {
  await next()
  c.header('X-Frame-Options', 'DENY')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  c.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
})

// Rota root di test
app.get('/', (c) => c.text('Beech API is running!'))

// POST /auth/login: autenticazione con email e password + refresh token
app.post('/auth/login', async (c) => {
  try {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
    }

    const credentials = parseLoginBody(body)
    if (!credentials) {
      return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
    }

    const { email, password } = credentials
    if (!validateLoginInput(email, password)) {
      return c.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
    }

    // Rate limiting: 5 tentativi per IP+email ogni 60 secondi
    const loginLimiter = c.env.LOGIN_RATE_LIMITER
    if (loginLimiter) {
      const clientIp = getClientIp(c.req.raw.headers)
      const { success } = await loginLimiter.limit({ key: `${clientIp}:${email}` })
      if (!success) {
        return c.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }
    }

    const { DB, JWT_SECRET } = c.env
    const user = await findUserByEmail(DB, email)
    // Sempre verifyPassword per evitare timing attack (utente non trovato vs password errata)
    const hashToCompare = user?.password_hash ?? DUMMY_PASSWORD_HASH
    const isValid = await verifyPassword(password, hashToCompare)

    if (!user || !isValid) {
      return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)
    }

    // Genera access token (15min) e refresh token (7 giorni)
    const accessToken = await generateAccessToken(user.id, user.email, JWT_SECRET)
    const refreshToken = generateRefreshToken()

    // Salva refresh token in DB (hashed)
    await saveRefreshToken(DB, user.id, refreshToken, REFRESH_TOKEN_EXPIRY_DAYS)

    setCookie(c, 'refresh_token', refreshToken, {
      ...getRefreshTokenCookieOptions(isRequestSecure(c.req.url)),
    })

    // Restituisci solo access token nel body
    return c.json({ token: accessToken, expiresIn: '15m' }, 200)
  } catch (err) {
    return handleAuthError(c, err, 'Login')
  }
})

// POST /auth/refresh: ottieni nuovo access token usando refresh token
app.post('/auth/refresh', async (c) => {
  try {
    // Rate limiting: 20 richieste per IP ogni 60 secondi
    const refreshLimiter = c.env.REFRESH_RATE_LIMITER
    if (refreshLimiter) {
      const clientIp = getClientIp(c.req.raw.headers)
      const { success } = await refreshLimiter.limit({ key: clientIp })
      if (!success) {
        return c.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429)
      }
    }

    // Leggi refresh token dal cookie usando helper Hono
    const refreshToken = getCookie(c, 'refresh_token')

    if (!refreshToken) {
      return c.json({ error: 'Refresh token missing' }, 401)
    }

    const { DB, JWT_SECRET } = c.env

    // Valida refresh token
    const validation = await validateRefreshToken(DB, refreshToken)
    if (!validation.valid || !validation.userId) {
      return c.json({ error: 'Invalid refresh token' }, 401)
    }

    // Ottieni info utente per generare nuovo access token
    const user = await DB.prepare(
      'SELECT id, email FROM users WHERE id = ? LIMIT 1'
    ).bind(validation.userId).first<{ id: string; email: string }>()

    if (!user) {
      return c.json({ error: 'User not found' }, 401)
    }

    // ROTAZIONE: Invalida vecchio refresh token
    await revokeRefreshToken(DB, refreshToken)

    // Genera NUOVO access token e NUOVO refresh token
    const newAccessToken = await generateAccessToken(user.id, user.email, JWT_SECRET)
    const newRefreshToken = generateRefreshToken()

    // Salva nuovo refresh token in DB
    await saveRefreshToken(DB, user.id, newRefreshToken, REFRESH_TOKEN_EXPIRY_DAYS)

    setCookie(c, 'refresh_token', newRefreshToken, {
      ...getRefreshTokenCookieOptions(isRequestSecure(c.req.url)),
    })

    // Restituisci nuovo access token
    return c.json({ token: newAccessToken, expiresIn: '15m' }, 200)
  } catch (err) {
    return handleAuthError(c, err, 'Refresh')
  }
})

// POST /auth/logout: invalida refresh token e cancella cookie
app.post('/auth/logout', async (c) => {
  try {
    // Leggi refresh token dal cookie usando helper Hono
    const refreshToken = getCookie(c, 'refresh_token')

    if (refreshToken) {
      await revokeRefreshToken(c.env.DB, refreshToken)
    }

    deleteCookie(c, 'refresh_token', {
      path: '/auth',
      secure: isRequestSecure(c.req.url),
      sameSite: 'Strict',
    })

    return c.json({ message: 'Logged out' }, 200)
  } catch (err) {
    return handleAuthError(c, err, 'Logout')
  }
})

// API Content: CRUD universale protetto da JWT
const apiContent = new Hono<{ Bindings: Bindings; Variables: Variables }>()
apiContent.use('*', async (c, next) => {
  await authMiddleware(c.env.JWT_SECRET)(c, next)
})
apiContent.route('/', contentRoutes)
app.route('/api/content', apiContent)

export default app
