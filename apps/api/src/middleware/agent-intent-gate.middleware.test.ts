// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import type { AgentIntentRecord } from '@beechcms/core'
import { FixedClock } from '@beechcms/testing'
import {
  agentIntentGate,
  AGENT_INTENT_TTL_SECONDS,
  MAX_INTENT_BODY_BYTES,
  type AgentIntentPendingResponse,
} from './agent-intent-gate.middleware'
import { intentPayloadHash, withIntentReplay } from '../shared/agent-intents/replay'
import { TEST_ENV as BASE_TEST_ENV } from '../../test/fixtures'
import type { Env, OAuthGrantContext, Variables } from '../types'

const NOW_MS = 1_700_000_000_000
const OAUTH_GRANT: OAuthGrantContext = { clientId: 'beech-mcp-cli', userId: 'user-1', scope: ['content:write', 'content:delete', 'schema:write'] }
const TEST_ENV: Env = { ...BASE_TEST_ENV, DB: {} as D1Database }
const PRODUCTION_ENV: Env = { ...TEST_ENV, ENV: 'production' }

function approvedIntent(overrides: Partial<AgentIntentRecord> = {}): AgentIntentRecord {
  return {
    id: 'intent-1', userId: 'user-1', clientId: 'beech-mcp-cli', operationId: 'seeds.delete', method: 'DELETE',
    path: '/api/seeds/articles', body: null, bodyHash: 'x', risk: 'destructive', summary: 's', status: 'approved',
    resultStatus: null, resultBody: null, createdAt: 0, expiresAt: 1, decidedAt: 0, ...overrides,
  }
}

function buildApp(options: { grant: OAuthGrantContext | null; stored?: AgentIntentRecord | null }) {
  const create = vi.fn().mockResolvedValue('intent-1')
  const findForUser = vi.fn().mockResolvedValue(options.stored ?? null)
  const log = vi.fn()
  const handlerReached = vi.fn()
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('oauthGrant', options.grant)
    c.set('clock', new FixedClock(NOW_MS))
    c.set('agentIntentRepository', { create, findForUser } as never)
    c.set('activityLogger', { log } as never)
    c.set('jwtPayload', { sub: 'user-1', email: 'a@b.com' })
    await next()
  })
  app.use('*', agentIntentGate({ dispatch: vi.fn() }))
  app.all('*', async (c) => {
    handlerReached()
    const text = await c.req.text()
    try {
      return c.json(JSON.parse(text))
    } catch {
      return c.json({ ok: true })
    }
  })
  return { app, create, findForUser, log, handlerReached }
}

const jsonInit = (method: string, body: string, contentType = 'application/json'): RequestInit => ({
  method,
  headers: { 'Content-Type': contentType },
  body,
})

describe('agentIntentGate', () => {
  it('lets a JWT request through untouched, whatever its risk', async () => {
    const { app, create } = buildApp({ grant: null })

    const response = await app.request('/api/seeds/a', { method: 'DELETE' }, TEST_ENV)

    expect(response.status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', '/api/content/posts', undefined],
    ['POST', '/api/content/posts', '{"status":"draft"}'],
  ] as const)('lets the read or write request %s %s through', async (method, path, body) => {
    const { app, create } = buildApp({ grant: OAUTH_GRANT })

    const response = await app.request(path, { method, body }, PRODUCTION_ENV)

    expect(response.status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })

  it('stores a destructive request as an intent and answers 202 without running the handler', async () => {
    const { app, create, handlerReached } = buildApp({ grant: OAUTH_GRANT })

    const response = await app.request('/api/content/posts/e1?purge=true', { method: 'DELETE' }, TEST_ENV)

    expect(response.status).toBe(202)
    const body = await response.json<AgentIntentPendingResponse>()
    expect(body.intent).toMatchObject({ id: 'intent-1', operationId: 'content.delete', risk: 'destructive', status: 'pending' })
    expect(body.intent.expiresAt).toBe(NOW_MS / 1000 + AGENT_INTENT_TTL_SECONDS)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/content/posts/e1?purge=true',
      body: null,
      risk: 'destructive',
      expiresAt: NOW_MS / 1000 + AGENT_INTENT_TTL_SECONDS,
    }))
    expect(handlerReached).not.toHaveBeenCalled()
  })

  it('runs a publish immediately in development and stores it in production', async () => {
    const development = buildApp({ grant: OAUTH_GRANT })
    const production = buildApp({ grant: OAUTH_GRANT })
    const init = jsonInit('POST', '{"status":"published"}')

    const inDevelopment = await development.app.request('/api/content/posts', init, TEST_ENV)
    const inProduction = await production.app.request('/api/content/posts', init, PRODUCTION_ENV)

    expect(inDevelopment.status).toBe(200)
    expect(inProduction.status).toBe(202)
    expect(development.create).not.toHaveBeenCalled()
    expect(production.create).toHaveBeenCalledTimes(1)
  })

  it('reads the body for risk whatever the Content-Type', async () => {
    // Regression (sprint 04): the validator parses JSON whatever the header, so the gate must too.
    const { app } = buildApp({ grant: OAUTH_GRANT })

    const response = await app.request('/api/content/posts', jsonInit('POST', '{"status":"published"}', 'text/plain'), PRODUCTION_ENV)

    expect(response.status).toBe(202)
  })

  it('keeps the JSON body readable by the handler', async () => {
    const { app } = buildApp({ grant: OAUTH_GRANT })

    const response = await app.request('/api/content/posts', jsonInit('POST', '{"status":"draft","title":"Hi"}'), PRODUCTION_ENV)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'draft', title: 'Hi' })
  })

  it('treats a malformed JSON body as a plain write', async () => {
    const { app, create } = buildApp({ grant: OAUTH_GRANT })

    const response = await app.request('/api/content/posts', jsonInit('POST', '{'), PRODUCTION_ENV)

    expect(response.status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an oversized body with 413 and stores nothing', async () => {
    const { app, create } = buildApp({ grant: OAUTH_GRANT })
    const oversized = JSON.stringify({ status: 'published', pad: 'x'.repeat(MAX_INTENT_BODY_BYTES) })

    const response = await app.request('/api/content/posts', jsonInit('POST', oversized), PRODUCTION_ENV)

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: 'intent_body_too_large' })
    expect(create).not.toHaveBeenCalled()
  })

  it('admits a matching replay of an approved intent without storing a new one', async () => {
    const payloadHash = await intentPayloadHash('DELETE', '/api/seeds/articles', null)
    const { app, create } = buildApp({ grant: OAUTH_GRANT, stored: approvedIntent() })
    const env = withIntentReplay(TEST_ENV, { intentId: 'intent-1', userId: 'user-1', clientId: 'beech-mcp-cli', scope: ['schema:write'], payloadHash })

    const response = await app.request('/api/seeds/articles', { method: 'DELETE' }, env)

    expect(response.status).toBe(200)
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    ['another body', 'user-1', 'approved', '{"x":1}'],
    ['another user', 'user-2', 'approved', null],
    ['an already executed intent', 'user-1', 'executed', null],
  ] as const)('refuses a replay with %s', async (_label, replayUserId, storedStatus, requestBody) => {
    const payloadHash = await intentPayloadHash('DELETE', '/api/seeds/articles', null)
    const { app, handlerReached } = buildApp({ grant: OAUTH_GRANT, stored: approvedIntent({ status: storedStatus }) })
    const env = withIntentReplay(TEST_ENV, { intentId: 'intent-1', userId: replayUserId, clientId: 'beech-mcp-cli', scope: ['schema:write'], payloadHash })

    const response = await app.request('/api/seeds/articles', { method: 'DELETE', body: requestBody }, env)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'intent_replay_mismatch' })
    expect(handlerReached).not.toHaveBeenCalled()
  })

  it('logs the creation of an intent as the caller', async () => {
    const { app, log } = buildApp({ grant: OAUTH_GRANT })

    await app.request('/api/seeds/articles', { method: 'DELETE' }, TEST_ENV)

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'create',
      entityType: 'intent',
      entityId: 'intent-1',
      actor: expect.objectContaining({ id: 'user-1' }),
    }))
  })
})
