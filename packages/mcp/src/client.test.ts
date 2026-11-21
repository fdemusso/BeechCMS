import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearGrant, readGrant, resolveApiConfig } from '@beechcms/api-client'
import { MCP_OAUTH_SCOPE } from './constants.js'

vi.mock('@beechcms/api-client', () => {
  const requestSpy = vi.fn()
  const sendSpy = vi.fn()
  const createApiClientSpy = vi.fn(() => ({ request: requestSpy, send: sendSpy }))
  const resolveApiConfigSpy = vi.fn((overrides: { clientId?: string; scope?: string } = {}) => ({
    baseUrl: 'http://localhost:8789',
    oauth: { clientId: overrides.clientId ?? 'beech-mcp', scope: overrides.scope ?? '' }
  }))
  return {
    createApiClient: createApiClientSpy,
    resolveApiConfig: resolveApiConfigSpy,
    readGrant: vi.fn(),
    clearGrant: vi.fn(),
    BeechClientError: class BeechClientError extends Error {}
  }
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.mocked(readGrant).mockReset()
})

describe('mcp client', () => {
  it('forwards method, path and body to the shared client', async () => {
    const { createApiClient } = await import('@beechcms/api-client')
    const mockedCreate = createApiClient as any
    // Re-import client so the singleton is created fresh with the mock in place
    const { request } = await import('./client.js')
    const mockRequest = mockedCreate.mock.results[mockedCreate.mock.results.length - 1].value.request
    mockRequest.mockResolvedValueOnce({ data: { ok: true }, headers: new Headers() })

    const res = await request('POST', '/test', { a: 1 })
    expect(mockRequest).toHaveBeenCalledWith('POST', '/test', { a: 1 })
    expect(res.data).toEqual({ ok: true })
  })

  it('builds its client with the beech-mcp client id', async () => {
    const { createApiClient } = await import('@beechcms/api-client')
    // Re-import client so the singleton is created fresh with the mock in place
    await import('./client.js')

    expect(resolveApiConfig).toHaveBeenCalledWith({ clientId: 'beech-mcp', scope: MCP_OAUTH_SCOPE })
    expect(createApiClient).toHaveBeenCalledWith(expect.objectContaining({ oauth: expect.objectContaining({ clientId: 'beech-mcp' }) }))
  })

  it('a cached grant without agent:read is cleared once at startup', async () => {
    vi.mocked(readGrant).mockReturnValue({ accessToken: 'a', refreshToken: 'r', scope: 'schema:read schema:write', expiresAt: 0 })
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('./client.js')

    expect(clearGrant).toHaveBeenCalledExactlyOnceWith('http://localhost:8789', 'beech-mcp')
    expect(stderr).toHaveBeenCalledOnce()
    stderr.mockRestore()
  })

  it('a cached grant with agent:read is kept even when narrower than requested', async () => {
    vi.mocked(readGrant).mockReturnValue({ accessToken: 'a', refreshToken: 'r', scope: 'agent:read', expiresAt: 0 })

    await import('./client.js')

    expect(clearGrant).not.toHaveBeenCalled()
  })

  it('BEECH_OAUTH_SCOPE overrides the requested scope', async () => {
    const previous = process.env.BEECH_OAUTH_SCOPE
    process.env.BEECH_OAUTH_SCOPE = 'schema:read'
    try {
      await import('./client.js')

      expect(resolveApiConfig).toHaveBeenCalledWith({ clientId: 'beech-mcp', scope: 'schema:read' })
    } finally {
      if (previous === undefined) delete process.env.BEECH_OAUTH_SCOPE
      else process.env.BEECH_OAUTH_SCOPE = previous
    }
  })

  it('send forwards to the shared client and returns its Response untouched', async () => {
    const { createApiClient } = await import('@beechcms/api-client')
    const { send } = await import('./client.js')
    const mockSend = vi.mocked(createApiClient).mock.results[0].value.send as ReturnType<typeof vi.fn>
    const answer = new Response('{}', { status: 409 })
    mockSend.mockResolvedValueOnce(answer)

    const response = await send('POST', '/x', { a: 1 })

    expect(mockSend).toHaveBeenCalledWith('POST', '/x', { a: 1 })
    expect(response).toBe(answer)
  })

  it('scriptGrantScopes reads the beech-mcp-cli grant and splits its scopes', async () => {
    const { scriptGrantScopes } = await import('./client.js')
    vi.mocked(readGrant).mockReturnValue({ accessToken: 'a', refreshToken: 'r', scope: 'content:read  agent:read', expiresAt: 0 })

    const scopes = scriptGrantScopes()

    expect(readGrant).toHaveBeenLastCalledWith('http://localhost:8789', 'beech-mcp-cli')
    expect(scopes).toEqual(['content:read', 'agent:read'])
  })

  it('scriptGrantScopes is null when scripts never authorized', async () => {
    const { scriptGrantScopes } = await import('./client.js')
    vi.mocked(readGrant).mockReturnValue(undefined)

    const scopes = scriptGrantScopes()

    expect(scopes).toBeNull()
  })

  it('the pending actions url sits on the auth origin under /admin', async () => {
    const { apiUrls } = await import('./client.js')

    expect(apiUrls.pendingActionsUrl).toBe('http://localhost:8789/admin/?settings=connected-apps&section=agent-actions')
  })
})
