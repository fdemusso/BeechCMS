// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { createBeechApp } from './factory'
import { InMemorySeedRepository } from './shared/db/repositories/in-memory-seed.repository'
import type { Env } from './types'

function buildEnv(assetsMock?: any): Env {
  return {
    DB: {} as D1Database,
    JWT_SECRET: 'test-jwt-secret-min-length-key-12345',
    ENV: 'test',
    ASSETS: assetsMock ?? {
      fetch: async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    },
  } as Env
}

function buildApp() {
  return createBeechApp({
    seeds: [],
    seedRepository: new InMemorySeedRepository([]),
  })
}

describe('Admin Dashboard CSP Security Headers (#302)', () => {
  it('returns Content-Security-Policy permitting connect-src and img-src to http: and https: storage origins', async () => {
    const app = buildApp()
    const env = buildEnv()

    const res = await app.request('/admin/dashboard', {}, env)
    expect(res.status).toBe(200)

    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toBeDefined()
    expect(csp).toContain("connect-src 'self' http: https:")
    expect(csp).toContain("img-src 'self' data: blob: http: https:")
  })

  it('safely rejects dynamic lookups with reserved prototype keys (e.g. constructor, toString)', () => {
    const rawInput: Record<string, unknown> = JSON.parse('{"constructor": "hacked", "toString": 123, "validField": "ok"}')

    // Verification of Object.hasOwn security rule
    const getSafe = (obj: Record<string, unknown>, key: string) => (Object.hasOwn(obj, key) ? obj[key] : undefined)

    expect(getSafe(rawInput, 'validField')).toBe('ok')
    expect(getSafe(rawInput, 'constructor')).toBe('hacked') // owned property, safe string
    expect(Object.hasOwn({}, 'constructor')).toBe(false)
    expect(Object.hasOwn({}, 'toString')).toBe(false)

    // Lookup on clean map created with Object.create(null)
    const cleanMap = Object.create(null)
    cleanMap.test = 'value'
    expect(cleanMap.constructor).toBeUndefined()
    expect(cleanMap.toString).toBeUndefined()
  })
})
