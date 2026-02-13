/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AUTH_ERRORS } from './auth/constants'
import {
  parseLoginBody,
  validateLoginInput,
  findUserByEmail,
  verifyPassword,
  generateJwt,
} from './auth/login'
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

// CORS: permetti tutte le origini in sviluppo; in produzione restringere a ['https://dashboard.tuodominio.com']
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// Rota root di test
app.get('/', (c) => c.text('Beech API is running!'))

// POST /auth/login: autenticazione con email e password
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

    const token = await generateJwt(user.id, user.email, JWT_SECRET)
    return c.json({ token, expiresIn: '2h' }, 200)
  } catch (err) {
    console.error('Login error:', err)
    return c.json({ error: AUTH_ERRORS.DATABASE_ERROR }, 500)
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
