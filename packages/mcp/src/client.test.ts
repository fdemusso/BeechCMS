import { describe, it, expect, vi } from 'vitest'
import { request } from './client.js'
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

describe('mcp client', () => {
  it('forwards method, path and body to the shared client', async () => {
    // The request method forwards to the singleton created on module load.
    const { createApiClient } = await import('@beechcms/api-client')
    const mockedCreate = createApiClient as any
    const mockRequest = mockedCreate().request
    mockRequest.mockResolvedValueOnce({ data: { ok: true }, headers: new Headers() })
    
    const res = await request('POST', '/test', { a: 1 })
    expect(mockRequest).toHaveBeenCalledWith('POST', '/test', { a: 1 })
    expect(res.data).toEqual({ ok: true })
  })

  it('builds its client with the beech-mcp client id', async () => {
    const { createApiClient } = await import('@beechcms/api-client')
    const config = resolveApiConfig()
    expect(config.oauth.clientId).toBe('beech-mcp')
    expect(createApiClient).toHaveBeenCalledWith(config)
  })
})
