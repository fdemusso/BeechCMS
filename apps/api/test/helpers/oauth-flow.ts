// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { expect } from 'vitest'
import { deriveCodeChallenge, OAUTH_SCOPES } from '@beechcms/core'
import type { createBeechApp } from '../../src/factory'
import type { D1TestDatabase } from './d1-test-database'
import { TEST_ENV } from '../fixtures'

/** Seeded script client; it can never request `agent:approve`. */
export const DEFAULT_CLIENT_ID = 'beech-mcp-cli'
export const REDIRECT_URI = 'http://127.0.0.1:8977/callback'
/** Each seeded client registers its own loopback callback path. */
const REDIRECT_URI_BY_CLIENT: Record<string, string> = {
  'beech-mcp-cli': REDIRECT_URI,
  'beech-mcp': 'http://127.0.0.1:8977/oauth/callback',
}
export const CODE_VERIFIER = 'b'.repeat(64)
export const SEED_SLUG = 'articles'
/** Every scope the script client may request: all but `agent:approve`. */
export const CLI_SCOPES = OAUTH_SCOPES.filter(scope => scope !== 'agent:approve').join(' ')
/** Every scope the MCP client may request. */
export const MCP_SCOPES = OAUTH_SCOPES.join(' ')

export const CANDIDATE_SEED = {
  label: 'Articles',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text' },
    { alias: 'body', label: 'Body', type: 'richtext' },
  ],
}

/** Approves a consent request as `adminToken`'s user and returns the authorization code. */
export async function requestConsent(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, adminToken: string, scope: string, state: string, clientId = DEFAULT_CLIENT_ID) {
  const codeChallenge = await deriveCodeChallenge(CODE_VERIFIER)
  const consentRes = await app.request('/oauth/authorize/consent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT_URI_BY_CLIENT[clientId] ?? REDIRECT_URI,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      approved: true,
    }),
  }, { ...TEST_ENV, DB: db })
  expect(consentRes.status).toBe(200)
  const { redirectTo } = await consentRes.json<{ redirectTo: string }>()
  return new URL(redirectTo).searchParams.get('code')!
}

/** Exchanges an authorization code for tokens. */
export async function exchangeCode(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, code: string, clientId = DEFAULT_CLIENT_ID) {
  const tokenRes = await app.request('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI_BY_CLIENT[clientId] ?? REDIRECT_URI,
      client_id: clientId,
      code_verifier: CODE_VERIFIER,
    }).toString(),
  }, { ...TEST_ENV, DB: db })
  expect(tokenRes.status).toBe(200)
  return tokenRes.json<{ access_token: string; refresh_token: string; scope: string }>()
}

/** Consent plus code exchange in one step. */
export async function issueToken(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, adminToken: string, scope: string, state: string, clientId = DEFAULT_CLIENT_ID) {
  const code = await requestConsent(app, db, adminToken, scope, state, clientId)
  return exchangeCode(app, db, code, clientId)
}

/** Creates the `articles` seed through the admin JWT. */
export async function createTargetSeed(app: ReturnType<typeof createBeechApp>, db: D1TestDatabase, adminToken: string) {
  const planRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-plan`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate: CANDIDATE_SEED }),
  }, { ...TEST_ENV, DB: db })
  expect(planRes.status).toBe(200)
  const { expectedVersion } = await planRes.json<{ expectedVersion: number }>()

  const createRes = await app.request(`/api/seeds/${SEED_SLUG}/mcp-apply`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate: CANDIDATE_SEED, expectedVersion, planId: 'seed-init' }),
  }, { ...TEST_ENV, DB: db })
  expect(createRes.status).toBe(200)
}
