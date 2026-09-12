// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { createControlPlane, CLI_OAUTH_CLIENT_ID } from '../lib/control-plane.js'
import { CliError } from '../lib/d1-context.js'
import type { Seed } from '@beechcms/core'

const { requestSpy, createApiClientSpy, BeechClientError } = vi.hoisted(() => {
  const reqSpy = vi.fn()
  class MockBeechClientError extends Error {
    constructor(message: string, public status?: number, public problem?: any) {
      super(message)
      this.name = 'BeechClientError'
    }
  }
  return {
    requestSpy: reqSpy,
    createApiClientSpy: vi.fn((config: any) => ({ request: reqSpy })),
    BeechClientError: MockBeechClientError
  }
})

vi.mock('@beechcms/api-client', () => ({
  createApiClient: createApiClientSpy,
  resolveApiConfig: (config: any) => ({ baseUrl: 'http://localhost:8789', oauth: config }),
  BeechClientError,
}))

describe('control-plane', () => {
  const seed: Seed = { slug: 'test', label: 'Test', displayNameAlias: 'test', branches: [] }

  it('posts the candidate to mcp-plan and returns the server verdict unchanged', async () => {
    const cp = createControlPlane()
    requestSpy.mockResolvedValueOnce({ data: { applicable: true } })
    const plan = await cp.plan('test', seed)
    expect(plan.applicable).toBe(true)
    expect(requestSpy).toHaveBeenCalledWith('POST', '/api/seeds/test/mcp-plan', { candidate: seed })
  })

  it('sends source=code on apply so a created seed is manifest-owned', async () => {
    const cp = createControlPlane()
    requestSpy.mockResolvedValueOnce({ data: { newVersion: 2 } })
    await cp.apply({ slug: 'test', candidate: seed, expectedVersion: 1, planId: 'p1' })
    expect(requestSpy).toHaveBeenCalledWith('POST', '/api/seeds/test/mcp-apply', {
      candidate: seed,
      expectedVersion: 1,
      planId: 'p1',
      source: 'code',
    })
  })

  it('maps a 409 to a CliError telling the operator to re-plan', async () => {
    const cp = createControlPlane()
    const error = new BeechClientError('conflict', 409)
    requestSpy.mockRejectedValueOnce(error)
    let caught: any
    try { await cp.apply({ slug: 'test', candidate: seed, expectedVersion: 1, planId: 'p1' }) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(CliError)
    expect(caught.cause).toBe(error)
    expect(caught.hint).toContain('beech schema plan')
  })

  it('maps a 403 insufficient-scope failure to an authorization CliError', async () => {
    const cp = createControlPlane()
    const error = new BeechClientError('insufficient', 403)
    requestSpy.mockRejectedValueOnce(error)
    let caught: any
    try { await cp.plan('test', seed) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(CliError)
    expect(caught.message).toContain('Not authorized')
    expect(caught.cause).toBe(error)
  })

  it('uses the beech-mcp-cli client id and the /callback redirect path', () => {
    // Mechanism: the config passed to createApiClient contains the correct auth parameters.
    createControlPlane()
    const config = createApiClientSpy.mock.calls[createApiClientSpy.mock.calls.length - 1][0] as any
    expect(config.oauth.clientId).toBe(CLI_OAUTH_CLIENT_ID)
    expect(config.oauth.callbackPath).toBe('/callback')
  })
})
