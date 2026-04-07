import { Hono } from 'hono'
import { publicReadHandler } from './public-read'

type Bindings = {
  DB: D1Database
  PUBLIC_API_KEY?: string
  ENV?: string
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

const publicApp = new Hono<{ Bindings: Bindings; Variables: Variables }>()

/**
 * Step 1 smoke endpoint to validate API key middleware flow.
 */
publicApp.get('/health', (c) => {
  return c.json({ ok: true, service: 'public-api' }, 200)
})

publicApp.get('/:seed', publicReadHandler)

export const publicRoutes = publicApp

