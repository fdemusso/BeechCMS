// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { createBeechSdk } from '../sdk/create-sdk.js'
import { BeechSdkError } from '../sdk/errors.js'
import type { ContentFilterGroup, SdkRequest, SdkTransport } from '../sdk/types.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const gateBody = {
  intent: {
    id: 'a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10',
    operationId: 'content.delete',
    risk: 'destructive',
    summary: 'Permanently delete posts entry e1',
    status: 'pending',
    expiresAt: 1_900_000_600,
  },
}

describe('SDK invocation', () => {
  function recordingTransport(...answers: Response[]) {
    const requests: SdkRequest[] = []
    const queue = [...answers]
    const transport: SdkTransport = {
      async send(request) {
        requests.push(request)
        return queue.shift() ?? new Response('{}', { status: 200, headers: JSON_HEADERS })
      },
    }
    return { requests, transport }
  }

  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

  it('encodes path params, so a storage key with a slash stays one segment', async () => {
    const { requests, transport } = recordingTransport()
    const { sdk } = createBeechSdk({ transport })

    await sdk.media.delete('imports/u/a.csv')

    expect(requests[0].path).toBe('/api/upload/imports%2Fu%2Fa.csv')
  })

  it('drops undefined query values and JSON-encodes filters', async () => {
    const { requests, transport } = recordingTransport()
    const { sdk } = createBeechSdk({ transport })
    const group: ContentFilterGroup = { columnId: 'br_01', type: 'text', conditions: [{ op: 'eq', value: 'x' }] }

    await sdk.content.list('posts', { search: undefined, filters: [group] })

    const query = new URLSearchParams(requests[0].path.split('?')[1])
    expect(query.get('page')).toBe('1')
    expect(query.get('filters')).toBe(JSON.stringify([group]))
    expect(query.has('search')).toBe(false)
  })

  it('content.list always asks for a page, so the answer is never the bare array', async () => {
    const { requests, transport } = recordingTransport()
    const { sdk } = createBeechSdk({ transport })

    await sdk.content.list('posts')

    expect(requests[0].path).toBe('/api/content/posts?page=1')
  })

  it('a 202 gate body becomes a pending outcome and lands in the journal', async () => {
    const { transport } = recordingTransport(jsonResponse(gateBody, 202))
    const { sdk, journal } = createBeechSdk({ transport })

    const outcome = await sdk.content.delete('posts', 'e1', { purge: 'true' })

    expect(outcome).toEqual({ kind: 'pending', intent: gateBody.intent })
    expect(journal.pendingIntents.map(intent => intent.id)).toEqual([gateBody.intent.id])
    expect(journal.calls[0]).toMatchObject({ outcome: 'pending', risk: 'destructive', operationId: 'content.delete' })
  })

  it('a 202 import-job body is an executed outcome, not an intent', async () => {
    // Regression guard: intents are detected by body shape, never by status 202 alone.
    const { transport } = recordingTransport(jsonResponse({ jobId: 'j1' }, 202))
    const { sdk, journal } = createBeechSdk({ transport })

    const outcome = await sdk.content.import('posts', { objectKey: 'imports/u/a.csv', format: 'csv' })

    expect(outcome).toEqual({ kind: 'executed', status: 202, data: { jobId: 'j1' } })
    expect(journal.pendingIntents).toHaveLength(0)
  })

  it('a problem body becomes BeechSdkError with its type as code', async () => {
    const { transport } = recordingTransport(jsonResponse({ type: 'content-not-found', title: 'Not found', status: 404, detail: 'No entry e9' }, 404))
    const { sdk } = createBeechSdk({ transport })

    const failure = sdk.content.get('posts', 'e9')

    await expect(failure).rejects.toMatchObject({ name: 'BeechSdkError', status: 404, code: 'content-not-found', operationId: 'content.get' })
  })

  it('an OAuth error body becomes BeechSdkError with its error as code', async () => {
    const { transport } = recordingTransport(jsonResponse({ error: 'insufficient_scope', error_description: "Token lacks 'content:write'" }, 403))
    const { sdk } = createBeechSdk({ transport })

    const failure = sdk.content.create('posts', { status: 'draft' })

    await expect(failure).rejects.toMatchObject({ status: 403, code: 'insufficient_scope', operationId: 'content.create' })
  })

  it('a transport failure is rethrown as BeechSdkError carrying the operation id', async () => {
    const transport: SdkTransport = { send: async () => { throw new BeechSdkError('API down', 0, 'unreachable', '', null) } }
    const { sdk, journal } = createBeechSdk({ transport })

    const failure = sdk.content.get('posts', 'e1')

    await expect(failure).rejects.toMatchObject({ status: 0, code: 'unreachable', operationId: 'content.get' })
    expect(journal.calls[0].outcome).toBe('error')
  })

  it('a 204 answer is executed with null data', async () => {
    const { transport } = recordingTransport(new Response(null, { status: 204 }))
    const { sdk } = createBeechSdk({ transport })

    const outcome = await sdk.media.delete('k1')

    expect(outcome).toEqual({ kind: 'executed', status: 204, data: null })
  })

  it('export returns the text body unchanged', async () => {
    const csv = 'title\nHello\n'
    const { transport } = recordingTransport(new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } }))
    const { sdk } = createBeechSdk({ transport })

    const result = await sdk.content.export('posts', { format: 'csv' })

    expect(result).toBe(csv)
  })

  it('dry-run records a write with its body and sends nothing', async () => {
    const { requests, transport } = recordingTransport()
    const { sdk, journal } = createBeechSdk({ transport, dryRun: true })

    const outcome = await sdk.content.create('posts', { status: 'published' })

    expect(outcome).toMatchObject({ kind: 'dry-run', call: { operationId: 'content.create', risk: 'publish', outcome: 'dry-run', status: null, body: { status: 'published' } } })
    expect(requests).toHaveLength(0)
    expect(journal.calls).toHaveLength(1)
  })

  it('dry-run still sends reads', async () => {
    const { requests, transport } = recordingTransport(jsonResponse({ id: 'e1' }))
    const { sdk } = createBeechSdk({ transport, dryRun: true })

    const entry = await sdk.content.get('posts', 'e1')

    expect(entry).toEqual({ id: 'e1' })
    expect(requests).toHaveLength(1)
  })

  it('an invalid JSON answer is journaled as an error record before BeechSdkError invalid_json is thrown', async () => {
    const { transport } = recordingTransport(new Response('{not json', { status: 200, headers: JSON_HEADERS }))
    const { sdk, journal } = createBeechSdk({ transport })

    const failure = await sdk.content.get('posts', 'e1').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(BeechSdkError)
    expect(failure).toMatchObject({ code: 'invalid_json', status: 200, operationId: 'content.get' })
    expect(journal.calls).toEqual([expect.objectContaining({ operationId: 'content.get', outcome: 'error', status: 200 })])
  })

  describe('layout preconditions', () => {
    it('layout.update sends the updatedAt it was given as a quoted If-Match', async () => {
      const { requests, transport } = recordingTransport()
      const { sdk } = createBeechSdk({ transport })

      await sdk.layout.update({ version: 1, pages: [] }, { ifMatch: 1767225600 })

      expect(requests[0]).toMatchObject({ method: 'PUT', path: '/api/dashboard-layout', body: { version: 1, pages: [] }, headers: { 'If-Match': '"1767225600"' } })
    })

    it('layout.update with ifMatch null sends If-None-Match: * for a first save', async () => {
      const { requests, transport } = recordingTransport()
      const { sdk } = createBeechSdk({ transport })

      await sdk.layout.update({ version: 1, pages: [] }, { ifMatch: null })

      expect(requests[0].headers).toEqual({ 'If-None-Match': '*' })
    })

    it('layout.reset sends no body and its precondition header', async () => {
      const { requests, transport } = recordingTransport()
      const { sdk } = createBeechSdk({ transport })

      await sdk.layout.reset({ ifMatch: 5 })

      expect(requests[0]).toMatchObject({ method: 'DELETE', path: '/api/dashboard-layout', headers: { 'If-Match': '"5"' } })
      expect(requests[0].body).toBeUndefined()
    })

    it('layout.update without a precondition is refused before any request', async () => {
      const { requests, transport } = recordingTransport()
      const { sdk } = createBeechSdk({ transport })

      const failure = (sdk.layout.update as (body: unknown) => Promise<unknown>)({ version: 1, pages: [] })

      await expect(failure).rejects.toThrow('needs { ifMatch }')
      expect(requests).toHaveLength(0)
    })

    it('a stale precondition answers 409 layout-conflict as a BeechSdkError', async () => {
      const { transport } = recordingTransport(jsonResponse({ type: 'layout-conflict', detail: 'stale' }, 409))
      const { sdk } = createBeechSdk({ transport })

      const failure = await sdk.layout.update({ version: 1, pages: [] }, { ifMatch: 1 }).catch((error: unknown) => error)

      expect(failure).toMatchObject({ name: 'BeechSdkError', status: 409, code: 'layout-conflict' })
    })

    it('dry-run records the write without sending the precondition request', async () => {
      const { requests, transport } = recordingTransport()
      const { sdk } = createBeechSdk({ transport, dryRun: true })

      const outcome = await sdk.layout.update({ version: 1, pages: [] }, { ifMatch: 1 })

      expect(outcome.kind).toBe('dry-run')
      expect(requests).toHaveLength(0)
    })
  })
})
