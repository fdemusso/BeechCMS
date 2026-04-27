/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Seed } from '@beech/core'
import type { Env, Variables } from './types'

export interface BeechConfig {
  seeds: Seed[]
}

/**
 * Builds a fully configured Hono app with the given seeds injected into context.
 * Seeds are available in every handler via c.get('getSeed') and c.get('seedRegistry').
 */
export function createBeechApp(config: BeechConfig): Hono<{ Bindings: Env; Variables: Variables }> {
  const registry: Record<string, Seed> = Object.fromEntries(config.seeds.map(s => [s.slug, s]))
  const getSeedFn = (slug: string): Seed | null => registry[slug] ?? null

  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  // Inject seed registry into every request context
  app.use('*', async (c, next) => {
    c.set('getSeed', getSeedFn)
    c.set('seedRegistry', registry)
    await next()
  })

  // CORS
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

  // Security headers
  app.use('*', async (c, next) => {
    await next()
    c.header('X-Frame-Options', 'DENY')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    c.header('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'")
  })

  return app
}
