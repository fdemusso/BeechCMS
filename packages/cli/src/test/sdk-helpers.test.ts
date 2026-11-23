// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { createBeechSdk } from '../sdk/create-sdk.js'
import type { ImportJob, SdkClock, SdkRequest, SdkTransport } from '../sdk/types.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const UPLOAD_URL = 'http://storage.test/bucket/key?sig=1'

const gateBody = {
  intent: {
    id: 'a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10',
    operationId: 'content.import',
    risk: 'publish',
    summary: 'Import 3 rows into posts',
    status: 'pending',
    expiresAt: 1_900_000_600,
  },
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

const importJob = (state: ImportJob['state']): ImportJob => ({
  id: 'j1', targetSeed: 'posts', format: 'ndjson', state, rowsRead: 3, insertedRows: state === 'completed' ? 3 : 0,
  failedRows: state === 'failed' ? 3 : 0, errors: [], createdAt: 1, updatedAt: 1, finishedAt: null,
})

describe('SDK helpers', () => {
  function recordingTransport(answer: (request: SdkRequest) => Response) {
    const requests: SdkRequest[] = []
    const transport: SdkTransport = {
      async send(request) {
        requests.push(request)
        return answer(request)
      },
    }
    return { requests, transport }
  }

  function manualClock(): SdkClock & { sleeps: number[] } {
    let current = 0
    const sleeps: number[] = []
    return { now: () => current, sleep: async ms => { sleeps.push(ms); current += ms }, sleeps }
  }

  function storageStub(status = 200) {
    const calls: { url: string; init: RequestInit }[] = []
    const stub = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(null, { status })
    }) as typeof fetch
    return { calls, stub }
  }

  function pagedList(total: number) {
    return (request: SdkRequest): Response => {
      const query = new URLSearchParams(request.path.split('?')[1])
      const page = Number(query.get('page'))
      const limit = Number(query.get('limit'))
      const first = (page - 1) * limit
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - first)) }, (_, index) => ({ id: `e${first + index}` }))
      return jsonResponse({ items, total, page, limit })
    }
  }

  it('listAll walks pages of 100 until it holds total entries', async () => {
    const { requests, transport } = recordingTransport(pagedList(205))
    const { sdk } = createBeechSdk({ transport })

    const entries = await sdk.content.listAll('posts')

    expect(requests).toHaveLength(3)
    expect(entries).toHaveLength(205)
  })

  it('listAll stops on an empty page even if total says more', async () => {
    const { requests, transport } = recordingTransport(request => {
      const page = Number(new URLSearchParams(request.path.split('?')[1]).get('page'))
      return jsonResponse({ items: page === 1 ? [{ id: 'e0' }] : [], total: 50, page, limit: 100 })
    })
    const { sdk } = createBeechSdk({ transport })

    const entries = await sdk.content.listAll('posts')

    expect(entries).toHaveLength(1)
    expect(requests).toHaveLength(2)
  })

  it('listAll refuses above maxItems after the first page', async () => {
    const { requests, transport } = recordingTransport(pagedList(300))
    const { sdk } = createBeechSdk({ transport })

    const failure = sdk.content.listAll('posts', { maxItems: 200 })

    await expect(failure).rejects.toMatchObject({ code: 'list_cap_exceeded', body: { total: 300, maxItems: 200 } })
    expect(requests).toHaveLength(1)
  })

  it('uploadFile presigns, PUTs the bytes without a bearer token, then confirms', async () => {
    const { requests, transport } = recordingTransport(request =>
      request.path.endsWith('/presign')
        ? jsonResponse({ uploadUrl: UPLOAD_URL, key: 'media/k1.png', expiresIn: 300 })
        : jsonResponse({ url: 'http://cdn.test/media/k1.png' }),
    )
    const storage = storageStub()
    const { sdk } = createBeechSdk({ transport, fetch: storage.stub })
    const data = new Uint8Array([1, 2, 3])

    const outcome = await sdk.media.uploadFile({ filename: 'k1.png', mimeType: 'image/png', data })

    expect(outcome).toEqual({ kind: 'executed', status: 200, data: { key: 'media/k1.png', url: 'http://cdn.test/media/k1.png' } })
    expect(requests.map(request => request.path)).toEqual(['/api/upload/presign', '/api/upload/confirm'])
    expect(storage.calls).toHaveLength(1)
    expect(storage.calls[0].init.method).toBe('PUT')
    expect(storage.calls[0].init.headers).not.toHaveProperty('Authorization')
  })

  it('uploadFile does not confirm when the storage PUT fails', async () => {
    const { requests, transport } = recordingTransport(() => jsonResponse({ uploadUrl: UPLOAD_URL, key: 'media/k1.png', expiresIn: 300 }))
    const { sdk } = createBeechSdk({ transport, fetch: storageStub(403).stub })

    const failure = sdk.media.uploadFile({ filename: 'k1.png', mimeType: 'image/png', data: new Uint8Array([1]) })

    await expect(failure).rejects.toMatchObject({ code: 'storage_put_failed', status: 403, operationId: 'media.uploadFile' })
    expect(requests.map(request => request.path)).toEqual(['/api/upload/presign'])
  })

  it('uploadFile in dry-run never PUTs', async () => {
    const { transport } = recordingTransport(() => jsonResponse({}))
    const storage = storageStub()
    const { sdk } = createBeechSdk({ transport, fetch: storage.stub, dryRun: true })

    const outcome = await sdk.media.uploadFile({ filename: 'k1.png', mimeType: 'image/png', data: new Uint8Array([1]) })

    expect(outcome.kind).toBe('dry-run')
    expect(storage.calls).toHaveLength(0)
  })

  it('importFile presigns for import with the format MIME and never confirms', async () => {
    const { requests, transport } = recordingTransport(request => {
      if (request.path.endsWith('/presign')) return jsonResponse({ uploadUrl: UPLOAD_URL, key: 'imports/u/rows.ndjson', expiresIn: 300 })
      if (request.path.endsWith('/import')) return jsonResponse({ jobId: 'j1' }, 202)
      return jsonResponse(importJob('completed'))
    })
    const { sdk } = createBeechSdk({ transport, fetch: storageStub().stub, clock: manualClock() })

    const outcome = await sdk.content.importFile('posts', { filename: 'rows.ndjson', format: 'ndjson', data: new Uint8Array([1]) })

    expect(requests[0].body).toMatchObject({ purpose: 'import', mimeType: 'application/json' })
    expect(requests.some(request => request.path === '/api/upload/confirm')).toBe(false)
    expect(outcome).toMatchObject({ kind: 'executed', data: { id: 'j1', state: 'completed' } })
  })

  it('importFile returns a pending import without polling', async () => {
    const { requests, transport } = recordingTransport(request => {
      if (request.path.endsWith('/presign')) return jsonResponse({ uploadUrl: UPLOAD_URL, key: 'imports/u/rows.csv', expiresIn: 300 })
      return jsonResponse(gateBody, 202)
    })
    const { sdk } = createBeechSdk({ transport, fetch: storageStub().stub, clock: manualClock() })

    const outcome = await sdk.content.importFile('posts', { filename: 'rows.csv', format: 'csv', data: new Uint8Array([1]) })

    expect(outcome).toEqual({ kind: 'pending', intent: gateBody.intent })
    expect(requests.some(request => request.path.includes('import-jobs'))).toBe(false)
  })

  it('waitForImport returns a failed job instead of throwing', async () => {
    const { transport } = recordingTransport(() => jsonResponse(importJob('failed')))
    const { sdk } = createBeechSdk({ transport, clock: manualClock() })

    const job = await sdk.content.waitForImport('j1')

    expect(job).toMatchObject({ state: 'failed', failedRows: 3 })
  })

  it('waitForImport times out with import_wait_timeout', async () => {
    const { transport } = recordingTransport(() => jsonResponse(importJob('processing')))
    const clock = manualClock()
    const { sdk } = createBeechSdk({ transport, clock })

    const failure = sdk.content.waitForImport('j1', { intervalMs: 1000, timeoutMs: 3000 })

    await expect(failure).rejects.toMatchObject({ code: 'import_wait_timeout', body: { state: 'processing' } })
    expect(clock.sleeps).toEqual([1000, 1000, 1000])
  })
})
