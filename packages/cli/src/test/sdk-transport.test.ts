// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendSpy, resolveApiConfigSpy, BeechClientError } = vi.hoisted(() => {
  class MockBeechClientError extends Error {
    constructor(message: string, readonly status?: number) {
      super(message)
      this.name = 'BeechClientError'
    }
  }
  return {
    sendSpy: vi.fn(),
    resolveApiConfigSpy: vi.fn((overrides: Record<string, unknown>) => ({ baseUrl: 'http://localhost:8789', oauth: overrides })),
    BeechClientError: MockBeechClientError,
  }
})

vi.mock('@beechcms/api-client', () => ({
  createApiClient: () => ({ send: sendSpy, baseUrl: 'http://localhost:8789' }),
  resolveApiConfig: resolveApiConfigSpy,
  BeechClientError,
}))

import { CLI_OAUTH_SCOPE } from '../lib/control-plane.js'
import { createApiClientTransport } from '../sdk/api-client-transport.js'

describe('createApiClientTransport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the CLI client, callback and scope', () => {
    createApiClientTransport()

    expect(resolveApiConfigSpy).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'beech-mcp-cli', callbackPath: '/callback', scope: CLI_OAUTH_SCOPE }))
    expect(CLI_OAUTH_SCOPE.split(' ')).not.toContain('agent:approve')
  })

  it('maps a 401 client error to BeechSdkError unauthorized', async () => {
    sendSpy.mockRejectedValueOnce(new BeechClientError('Authorization failed', 401))
    const transport = createApiClientTransport()

    const failure = transport.send({ method: 'GET', path: '/api/seeds' })

    await expect(failure).rejects.toMatchObject({ name: 'BeechSdkError', status: 401, code: 'unauthorized' })
  })

  it('maps an unreachable API to BeechSdkError status 0 unreachable', async () => {
    sendSpy.mockRejectedValueOnce(new BeechClientError('Cannot reach the BeechCMS API'))
    const transport = createApiClientTransport()

    const failure = transport.send({ method: 'GET', path: '/api/seeds' })

    await expect(failure).rejects.toMatchObject({ name: 'BeechSdkError', status: 0, code: 'unreachable' })
  })
})
