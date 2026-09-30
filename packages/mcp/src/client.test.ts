import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveApiConfig } from '@beechcms/api-client'

vi.mock('@beechcms/api-client', () => {
  const requestSpy = vi.fn()
  const createApiClientSpy = vi.fn(() => ({ request: requestSpy }))
  const resolveApiConfigSpy = vi.fn(() => ({
    baseUrl: 'http://localhost:8789',
    oauth: { clientId: 'beech-mcp' }
  }))
  return {
    createApiClient: createApiClientSpy,
    resolveApiConfig: resolveApiConfigSpy,
    BeechClientError: class BeechClientError extends Error {}
  }
})

beforeEach(() => {
  vi.resetModules()
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
    // Re-import client so the singleton is created fresh — this triggers createApiClient(resolveApiConfig())
    await import('./client.js')
    const config = resolveApiConfig()
    expect(config.oauth.clientId).toBe('beech-mcp')
    expect(createApiClient).toHaveBeenCalledWith(config)
  })
})
