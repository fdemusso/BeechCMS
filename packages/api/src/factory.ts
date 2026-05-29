// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Seed } from '@beechcms/core'
import { SeedRegistry } from '@beechcms/core'
import type { Env, Variables } from './types'

export interface BeechConfig {
  seeds: Seed[]
}

export function createBeechApp(config: BeechConfig): Hono<{ Bindings: Env; Variables: Variables }> {
  const seedRegistry = new SeedRegistry(config.seeds)

  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  app.use('*', async (c, next) => {
    c.set('getSeed', (slug: string) => seedRegistry.get(slug))
    c.set('seedRegistry', seedRegistry)
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

  return app
}
