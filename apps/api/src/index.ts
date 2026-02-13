/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { AUTH_ERRORS } from './auth/constants'
import {
  parseLoginBody,
  validateLoginInput,
  findUserByEmail,
  verifyPassword,
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

// Bindings per Cloudflare Workers: DB (D1) e JWT_SECRET
type Bindings = {
  DB: D1Database
  JWT_SECRET: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// CORS: specifica origin per permettere cookies (credentials: true)
app.use(
  '*',
  cors({
    origin: 'http://localhost:5173', // Dashboard locale
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Necessario per httpOnly cookies
  })
)

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

    const { DB, JWT_SECRET } = c.env
    const user = await findUserByEmail(DB, email)

    if (!user) {
      return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)
    }

    const isValid = await verifyPassword(password, user.password_hash)
    if (!isValid) {
      return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)
    }

    // Genera access token (15min) e refresh token (7 giorni)
    const accessToken = await generateAccessToken(user.id, user.email, JWT_SECRET)
    const refreshToken = generateRefreshToken()

    // Salva refresh token in DB (hashed)
    await saveRefreshToken(DB, user.id, refreshToken, 7)

    // Imposta refresh token in httpOnly cookie usando helper Hono
    setCookie(c, 'refresh_token', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60, // 7 giorni
      path: '/auth',
    })

    // Restituisci solo access token nel body
    return c.json({ token: accessToken, expiresIn: '15m' }, 200)
  } catch (err) {
    console.error('Login error:', err)
    return c.json({ error: AUTH_ERRORS.DATABASE_ERROR }, 500)
  }
})

// POST /auth/refresh: ottieni nuovo access token usando refresh token
app.post('/auth/refresh', async (c) => {
  try {
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
    await saveRefreshToken(DB, user.id, newRefreshToken, 7)

    // Imposta nuovo refresh token in cookie usando helper Hono
    setCookie(c, 'refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/auth',
    })

    // Restituisci nuovo access token
    return c.json({ token: newAccessToken, expiresIn: '15m' }, 200)
  } catch (err) {
    console.error('Refresh error:', err)
    return c.json({ error: 'Refresh failed' }, 500)
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

    // Cancella cookie usando helper Hono
    deleteCookie(c, 'refresh_token', {
      path: '/auth',
      secure: true,
      sameSite: 'Strict',
    })

    return c.json({ message: 'Logged out' }, 200)
  } catch (err) {
    console.error('Logout error:', err)
    return c.json({ error: 'Logout failed' }, 500)
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
