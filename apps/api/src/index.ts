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
// TODO: refactor — rotate-field è una VSA slice. Il resto di index.ts (auth inline, content monolith)
// va migrato a slices dedicati sotto src/features/ seguendo lo stesso pattern.
import { rotateFieldApp } from './features/rotate-field'
import { uploadRoutes, serveMediaHandler } from './upload'
import { publicRoutes, apiKeyMiddleware, publicRateLimitMiddleware } from './public'
import { searchRouter } from "./search"
import type { Env, Variables } from './types'

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

function getRefreshTokenDeleteCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'Strict' as const,
    path: '/auth',
  }
}

/** Logga l'errore solo in sviluppo e restituisce risposta 500 generica */
function handleAuthError(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  err: unknown,
  operationName: string
): Response {
  if (c.env.ENV !== 'production') {
    console.error(`${operationName} error:`, err)
  }
  return c.json({ error: AUTH_ERRORS.GENERIC_ERROR }, 500)
}

// --- App ---

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// CORS: origins da CORS_ORIGINS (virgola-separati), default localhost per sviluppo
app.use('*', async (c, next) => {
  const origins = (c.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const corsMiddleware = cors({
    // Se l'Origin non è in allowlist, non impostare Access-Control-Allow-Origin.
    // Con credentials=true è importante evitare fallback permissivi.
    origin: (origin) => {
      if (!origin) return origins[0] ?? null
      return origins.includes(origin) ? origin : null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
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

// Middleware Analytics: traccia le richieste per la dashboard (Cloudflare-style metrics)
app.use('/api/*', async (c, next) => {
  await next()
  
  // Tracciamo solo richieste andate a buon fine (2xx) e non OPTIONS
  if (c.req.method !== 'OPTIONS' && c.res.status >= 200 && c.res.status < 300) {
    const db = c.env.DB
    // Protezione per ambienti (es. test) dove executionCtx non è definito
    let executionCtx: { waitUntil: (p: Promise<any>) => void } | undefined
    try {
      executionCtx = c.executionCtx
    } catch {
      // In ambiente di test Hono lancia se non presente
    }

    if (db && executionCtx) {
      // Usa waitUntil per non bloccare la risposta al client
      executionCtx.waitUntil((async () => {
        try {
          const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
          
          // 1. Incrementa contatore richieste totali
          await db.prepare(
            `INSERT INTO analytics (day_ts, metric, value) 
             VALUES (?, 'requests', 1) 
             ON CONFLICT(day_ts, metric) DO UPDATE SET value = value + 1`
          ).bind(today).run()
          
          // Nota: per i visitatori unici servirebbe una tabella di appoggio per gli IP.
          // In questo prototipo simuliamo la crescita basandoci sulle richieste o tramite seed.
        } catch (err) {
          console.error('Analytics middleware error:', err)
        }
      })())
    }
  }
})

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
    const accessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
    })
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
    const revoked = await revokeRefreshToken(DB, refreshToken)
    if (!revoked) {
      // Token già consumato/revocato (race) o appena scaduto: tratta come invalido.
      return c.json({ error: 'Invalid refresh token' }, 401)
    }

    // Genera NUOVO access token e NUOVO refresh token
    const newAccessToken = await generateAccessToken(user.id, user.email, JWT_SECRET, {
      issuer: c.env.JWT_ISSUER,
      audience: c.env.JWT_AUDIENCE,
    })
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
      ...getRefreshTokenDeleteCookieOptions(isRequestSecure(c.req.url)),
    })

    return c.json({ message: 'Logged out' }, 200)
  } catch (err) {
    return handleAuthError(c, err, 'Logout')
  }
})

// API Content: CRUD universale protetto da JWT
const apiContent = new Hono<{ Bindings: Env; Variables: Variables }>()
apiContent.use('*', async (c, next) => {
  await authMiddleware(c.env.JWT_SECRET, {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
  })(c, next)
})
// Specific routes before wildcard content routes to avoid pattern conflicts
apiContent.route('/', rotateFieldApp)
apiContent.route('/', contentRoutes)
app.route('/api/content', apiContent)
app.route('/api/search', searchRouter)

// API Upload: POST /api/upload (JWT) + GET /api/media/:key (pubblico)
app.route('/api', uploadRoutes)
app.get('/api/media/:key', (c) => serveMediaHandler(c))

// API Pubblica: endpoint per consumatori esterni, protetti da API Key
const apiPublic = new Hono<{ Bindings: Env; Variables: Variables }>()
apiPublic.use('*', publicRateLimitMiddleware())
apiPublic.use('*', apiKeyMiddleware())
apiPublic.route('/', publicRoutes)
app.route('/api/v1/public', apiPublic)

export default app
