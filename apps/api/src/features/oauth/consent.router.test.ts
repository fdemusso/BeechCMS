// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Order of the checks on the dashboard-facing OAuth routes: the admin gate runs before the body is
 * read, so a caller without a session learns nothing about the consent contract.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../../factory'
import { D1TestDatabase } from '../../../test/helpers/d1-test-database'
import { seedTestUsers } from '../../../test/helpers/seed-fixtures'
import { TEST_USERS, TEST_ENV } from '../../../test/fixtures'

describe('oauthConsentApp', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [] })
  })

  async function login() {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    const body = await res.json<{ token: string }>()
    return body.token
  }

  describe('POST /oauth/authorize/consent', () => {
    it('a body that is not JSON is refused with 400 invalid_request and mints no code', async () => {
      const token = await login()

      const response = await app.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{not json',
      }, { ...TEST_ENV, DB: db })

      expect(response.status).toBe(400)
      const body = await response.json<{ error: string }>()
      expect(body.error).toBe('invalid_request')
      const row = await db.prepare('SELECT COUNT(*) AS n FROM oauth_authorization_codes').first<{ n: number }>()
      expect(row?.n).toBe(0)
    })

    it('a caller without a session gets 401 whatever the body, before the body is read', async () => {
      const response = await app.request('/oauth/authorize/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }, { ...TEST_ENV, DB: db })

      expect(response.status).toBe(401)
    })
  })

  describe('gate', () => {
    it('refuses every verb on the connected-apps paths with 401, not 404, when there is no session', async () => {
      const verbs = ['GET', 'POST', 'PUT', 'DELETE'] as const
      const paths = ['/oauth/consents', '/oauth/consents/beech-mcp-cli', '/oauth/authorize/request', '/oauth/authorize/consent']

      const statuses = await Promise.all(
        paths.flatMap(path => verbs.map(async method => {
          const response = await app.request(path, { method }, { ...TEST_ENV, DB: db })
          return `${method} ${path} ${response.status}`
        })),
      )

      // The gate is `.use(path)`, so it answers all methods; a per-route middleware would let
      // an unrouted verb fall through to 404.
      expect(statuses.filter(line => !line.endsWith(' 401'))).toEqual([])
    })
  })
})
