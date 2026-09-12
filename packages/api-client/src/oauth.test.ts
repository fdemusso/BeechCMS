// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { get as httpGet } from 'node:http'
import { isValidCodeVerifier } from '@beechcms/core'

const spawnMock = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

function fetchAuthUrl(): string {
  const call = (spawnMock.mock.calls.at(-1) ?? []) as unknown[]
  const args = (call[1] as unknown[] | undefined) ?? []
  const found = [call[0], ...args].find(arg => typeof arg === 'string' && arg.startsWith('http'))
  if (!found) throw new Error('no URL found in spawn call')
  return found as string
}

async function waitForSpawn(): Promise<void> {
  const deadline = Date.now() + 2000
  while (spawnMock.mock.calls.length === 0) {
    if (Date.now() > deadline) throw new Error('spawn was never called')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function hitCallback(redirectUri: string, params: Record<string, string>): Promise<void> {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Promise((resolve, reject) => {
    httpGet(url, res => { res.resume(); res.on('end', resolve) }).on('error', reject)
  })
}

function tokenResponse(overrides: Partial<{ access_token: string; refresh_token: string; scope: string; expires_in: number }> = {}) {
  return new Response(
    JSON.stringify({
      access_token: overrides.access_token ?? 'access-token-1',
      token_type: 'Bearer',
      expires_in: overrides.expires_in ?? 900,
      refresh_token: overrides.refresh_token ?? 'refresh-token-1',
      scope: overrides.scope ?? 'schema:read schema:write',
    }),
    { status: 200 }
  )
}

const BASE_CONFIG = { apiUrl: 'http://api.test', authUrl: 'http://api.test', clientId: 'beech-mcp', scope: 'schema:read schema:write', timeoutMs: 2000 }

describe('oauth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    spawnMock.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('generates a PKCE verifier that satisfies isValidCodeVerifier from @beechcms/core', async () => {
    const { createPkcePair } = await import('./oauth.js')
    const { verifier, challenge } = await createPkcePair()
    expect(isValidCodeVerifier(verifier)).toBe(true)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('completes the flow: opens the browser, exchanges the code as form-urlencoded, returns the grant', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(tokenResponse())
    const { authorize } = await import('./oauth.js')

    const grantPromise = authorize(BASE_CONFIG)
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
    const redirectUri = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!

    await hitCallback(redirectUri, { code: 'auth-code-1', state })
    const grant = await grantPromise

    expect(grant.accessToken).toBe('access-token-1')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/oauth/token',
      expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    )
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = call[1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('redirect_uri')).toBe(redirectUri)
  })

  it('rejects on a state mismatch and never reaches the token endpoint', async () => {
    globalThis.fetch = vi.fn()
    const { authorize } = await import('./oauth.js')

    const grantPromise = authorize(BASE_CONFIG)
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    const redirectUri = authUrl.searchParams.get('redirect_uri')!

    await hitCallback(redirectUri, { code: 'auth-code-1', state: 'wrong-state' })

    await expect(grantPromise).rejects.toThrow('state mismatch')
    expect(globalThis.fetch).not.toHaveBeenCalled()

    await expect(hitCallback(redirectUri, {})).rejects.toThrow()
  })

  it('rejects with the server error_description on an ?error= callback', async () => {
    globalThis.fetch = vi.fn()
    const { authorize } = await import('./oauth.js')

    const grantPromise = authorize(BASE_CONFIG)
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    const redirectUri = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!

    await hitCallback(redirectUri, { error: 'access_denied', error_description: 'user declined', state })

    await expect(grantPromise).rejects.toThrow('user declined')
  })

  it('closes the loopback server on timeout, freeing the port', async () => {
    globalThis.fetch = vi.fn()
    const { authorize } = await import('./oauth.js')

    const grantPromise = authorize({ ...BASE_CONFIG, timeoutMs: 30 })
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    const redirectUri = authUrl.searchParams.get('redirect_uri')!

    await expect(grantPromise).rejects.toThrow('Authorization timed out')
    await expect(hitCallback(redirectUri, {})).rejects.toThrow()
  })

  it('exchanges a refresh token as form-urlencoded and returns the rotated grant', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(tokenResponse({ access_token: 'access-token-2', refresh_token: 'refresh-token-2' }))
    const { refresh } = await import('./oauth.js')

    const grant = await refresh(BASE_CONFIG, 'refresh-token-1')

    expect(grant.accessToken).toBe('access-token-2')
    expect(grant.refreshToken).toBe('refresh-token-2')
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = call[1].body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('refresh-token-1')
  })

  it('throws on a non-2xx refresh response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400 }))
    const { refresh } = await import('./oauth.js')

    await expect(refresh(BASE_CONFIG, 'stale-token')).rejects.toThrow('invalid_grant')
  })

  it('never writes to process.stdout during the flow', async () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write')
    globalThis.fetch = vi.fn().mockResolvedValue(tokenResponse())
    const { authorize } = await import('./oauth.js')

    const grantPromise = authorize(BASE_CONFIG)
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    const redirectUri = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!
    await hitCallback(redirectUri, { code: 'auth-code-1', state })
    await grantPromise

    expect(stdoutSpy).not.toHaveBeenCalled()
  })

  it('redirects the browser to the configured callback path so a client registered with /callback matches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(tokenResponse())
    const { authorize } = await import('./oauth.js')
    
    const config = { ...BASE_CONFIG, callbackPath: '/callback' }
    const grantPromise = authorize(config)
    await waitForSpawn()
    const authUrl = new URL(fetchAuthUrl())
    const redirectUri = authUrl.searchParams.get('redirect_uri')!
    expect(redirectUri).toMatch(/\/callback$/)
    
    const state = authUrl.searchParams.get('state')!
    await hitCallback(redirectUri, { code: 'auth-code-2', state })
    await grantPromise
  })
})
