// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../types'
import { zodJson } from './zod-json'

const schema = z.object({
  title: z.string().trim().min(1),
  count: z.number().optional(),
})

function buildApp(onInvalid: Parameters<typeof zodJson>[1] = (context) => context.json({ error: 'invalid' }, 400)) {
  const handler = vi.fn((context: { req: { valid: (target: 'json') => unknown }; json: (body: unknown) => Response }) =>
    context.json(context.req.valid('json')),
  )
  const app = new Hono<AppEnv>()
  app.post('/items', zodJson(schema, onInvalid), handler as never)
  return { app, handler }
}

function post(app: Hono<AppEnv>, body: string) {
  return app.request('/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
}

describe('zodJson', () => {
  it('hands the handler the body the schema parsed, transforms applied', async () => {
    const { app } = buildApp()

    const response = await post(app, JSON.stringify({ title: '  Hello  ', count: 2, extra: true }))

    expect(await response.json()).toEqual({ title: 'Hello', count: 2 })
  })

  it('refuses a body that is not JSON through onInvalid, without running the handler', async () => {
    const { app, handler } = buildApp()

    const response = await post(app, '{not json')

    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses a body that is JSON but fails the schema', async () => {
    const { app, handler } = buildApp()

    const response = await post(app, JSON.stringify({ title: '   ' }))

    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuses an empty body', async () => {
    const { app } = buildApp()

    const response = await post(app, '')

    expect(response.status).toBe(400)
  })

  it('tells onInvalid the body was malformed when it is not JSON', async () => {
    const { app } = buildApp((context, _error, cause) => context.json({ cause }, 400))

    const response = await post(app, '{not json')

    expect(await response.json()).toEqual({ cause: 'malformed' })
  })

  it('tells onInvalid the body was invalid when it is JSON the schema rejects', async () => {
    const { app } = buildApp((context, _error, cause) => context.json({ cause }, 400))

    const response = await post(app, JSON.stringify({ title: '' }))

    expect(await response.json()).toEqual({ cause: 'invalid' })
  })

  it('refuses a malformed body even when the schema would accept null', async () => {
    const lenient = new Hono<AppEnv>()
    lenient.post('/items', zodJson(z.null().or(z.object({})), (context) => context.json({ error: 'invalid' }, 400)), (context) => context.json({ ok: true }))

    const response = await post(lenient, '{not json')

    expect(response.status).toBe(400)
  })

  it('hands onInvalid the ZodError so the endpoint can report the first issue', async () => {
    const { app } = buildApp((context, error) => context.json({ field: error.issues[0]?.path[0] }, 422))

    const response = await post(app, JSON.stringify({ title: '' }))

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ field: 'title' })
  })
})
