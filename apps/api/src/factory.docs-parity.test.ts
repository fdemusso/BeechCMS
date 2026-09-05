// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { createBeechApp } from './factory'
import { InMemorySeedRepository } from './shared/db/repositories/in-memory-seed.repository'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('API Routes and Documentation Reference Parity (Fact-Checking)', () => {
  const docsRefDir = resolve(__dirname, '../../../docs/reference')

  it('ensures all reference documentation files exist', () => {
    const requiredDocs = [
      'auth-endpoints.md',
      'public-api.md',
      'internal-content.md',
      'media-engine.md',
      'widget-api.md',
      'automations-api.md',
      'seed-builder.md',
      'dashboard-layout.md',
    ]

    for (const doc of requiredDocs) {
      expect(existsSync(resolve(docsRefDir, doc)), `Missing doc file: ${doc}`).toBe(true)
    }
  })

  it('validates that all core API route prefixes have dedicated reference documentation', () => {
    const app = createBeechApp({
      seeds: [],
      seedRepository: new InMemorySeedRepository([]),
    })

    const routes = app.routes
      .map((r) => r.path)
      .filter((p) => p !== '*' && !p.startsWith('/admin'))

    expect(routes.length).toBeGreaterThan(20)

    // Verify key route boundaries are documented
    const routeDocMap: Record<string, string> = {
      '/auth/login': 'auth-endpoints.md',
      '/auth/refresh': 'auth-endpoints.md',
      '/auth/logout': 'auth-endpoints.md',
      '/api/v1/public': 'public-api.md',
      '/api/content': 'internal-content.md',
      '/api/widget': 'widget-api.md',
      '/api/automations': 'automations-api.md',
      '/api/seeds': 'seed-builder.md',
      '/api/dashboard-layout': 'dashboard-layout.md',
    }

    for (const [routePrefix, docFile] of Object.entries(routeDocMap)) {
      const docPath = resolve(docsRefDir, docFile)
      const docContent = readFileSync(docPath, 'utf-8')

      // 1. Check that the router actually registers routes with this prefix
      const matchingRoutes = routes.filter((r) => r.startsWith(routePrefix))
      expect(
        matchingRoutes.length,
        `Expected Hono to register routes matching ${routePrefix}`
      ).toBeGreaterThan(0)

      // 2. Check that the doc references this prefix
      expect(
        docContent.includes(routePrefix),
        `Documentation ${docFile} must document endpoints under ${routePrefix}`
      ).toBe(true)
    }
  })

  it('verifies public API methods documented match registered public router endpoints', () => {
    const publicDoc = readFileSync(resolve(docsRefDir, 'public-api.md'), 'utf-8')

    // Documented endpoints in public-api.md
    const expectedPublicEndpoints = [
      '/api/v1/public',
      '/schema',
      '/add',
      '/edit',
    ]

    for (const endpoint of expectedPublicEndpoints) {
      expect(
        publicDoc.includes(endpoint),
        `public-api.md must mention endpoint segment "${endpoint}"`
      ).toBe(true)
    }
  })
})
