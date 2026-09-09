// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import { oauthScopeMiddleware, resolveRequiredScope } from './oauth-scope.middleware'
import type { Env, Variables, OAuthGrantContext } from '../types'

function buildApp(grant: OAuthGrantContext | null) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('oauthGrant', grant)
    await next()
  })
  app.use('*', oauthScopeMiddleware())
  app.all('*', (c) => c.json({ ok: true }))
  return app
}

function grant(scope: OAuthScope[]): OAuthGrantContext {
  return { clientId: 'client-1', userId: 'user-1', scope }
}

describe('oauthScopeMiddleware', () => {
  it('passes through when oauthGrant is null (JWT passthrough)', async () => {
    const app = buildApp(null)
    const res = await app.request('/api/anything/not/listed')
    expect(res.status).toBe(200)
  })

  it.each([
    ['GET', '/api/seeds', 'schema:read'],
    ['GET', '/api/seeds/articles', 'schema:read'],
    ['GET', '/api/schema', 'schema:read'],
    ['POST', '/api/seeds/articles/mcp-plan', 'schema:read'],
    ['POST', '/api/seeds/articles/mcp-apply', 'schema:write'],
  ] as const)('%s %s with exact scope %s -> 200', async (method, path, scope) => {
    const app = buildApp(grant([scope]))
    const res = await app.request(path, { method })
    expect(res.status).toBe(200)
  })

  it('rejects a write-scope-only grant on a read route', async () => {
    const app = buildApp(grant(['schema:write']))
    const res = await app.request('/api/seeds/articles')
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'insufficient_scope' })
    expect(res.headers.get('WWW-Authenticate')).toContain('scope="schema:read"')
  })

  it('rejects a read-only grant on mcp-apply', async () => {
    const app = buildApp(grant(['schema:read']))
    const res = await app.request('/api/seeds/articles/mcp-apply', { method: 'POST' })
    expect(res.status).toBe(403)
  })

  it('allows a read+write grant on mcp-apply', async () => {
    const app = buildApp(grant(['schema:read', 'schema:write']))
    const res = await app.request('/api/seeds/articles/mcp-apply', { method: 'POST' })
    expect(res.status).toBe(200)
  })

  const defaultDenyPaths: Array<[string, string]> = [
    ['GET', '/api/content/articles'],
    ['POST', '/api/content/articles'],
    ['GET', '/api/settings'],
    ['GET', '/api/search?q=x'],
    ['PUT', '/api/schema/articles/layout'],
    ['DELETE', '/api/seeds/articles'],
    ['GET', '/api/seeds/articles/orphans'],
    ['POST', '/api/seeds/articles/branches'],
    ['POST', '/api/seeds/articles/fts/rebuild'],
    ['GET', '/api/dashboard-layout'],
    ['GET', '/api/automations'],
    ['GET', '/api/widget'],
  ]

  it.each(defaultDenyPaths)('default-deny: %s %s -> 403 with maximal grant', async (method, path) => {
    const app = buildApp(grant(['schema:read', 'schema:write']))
    const res = await app.request(path, { method })
    expect(res.status).toBe(403)
  })

  it('discriminates by method: POST /api/seeds is denied while GET /api/seeds is allowed', async () => {
    const app = buildApp(grant(['schema:read', 'schema:write']))
    const post = await app.request('/api/seeds', { method: 'POST' })
    expect(post.status).toBe(403)
    const get = await app.request('/api/seeds', { method: 'GET' })
    expect(get.status).toBe(200)
  })
})

describe('resolveRequiredScope', () => {
  it.each([
    ['GET', '/api/seeds', 'schema:read'],
    ['GET', '/api/seeds/articles', 'schema:read'],
    ['GET', '/api/schema', 'schema:read'],
    ['POST', '/api/seeds/articles/mcp-plan', 'schema:read'],
    ['POST', '/api/seeds/articles/mcp-apply', 'schema:write'],
  ] as const)('resolves %s %s -> %s', (method, path, scope) => {
    expect(resolveRequiredScope(method, path)).toBe(scope)
  })

  it('returns null for unlisted routes', () => {
    expect(resolveRequiredScope('GET', '/api/seeds/articles/orphans')).toBeNull()
    expect(resolveRequiredScope('PUT', '/api/schema')).toBeNull()
  })
})
