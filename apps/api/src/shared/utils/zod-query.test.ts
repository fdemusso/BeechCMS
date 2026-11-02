// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../types'
import { zodQuery } from './zod-query'

const schema = z.object({
  limit: z.string().optional(),
  slug: z.string().trim().min(1).optional(),
})

function buildApp(onInvalid?: Parameters<typeof zodQuery>[1]) {
  const handler = vi.fn((context: { req: { valid: (target: 'query') => unknown }; json: (body: unknown) => Response }) =>
    context.json(context.req.valid('query')),
  )
  const app = new Hono<AppEnv>()
  app.get('/items', zodQuery(schema, onInvalid), handler as never)
  return { app, handler }
}

describe('zodQuery', () => {
  it('hands the parsed query to the handler', async () => {
    const { app } = buildApp()

    const response = await app.request('/items?limit=5&slug=posts')

    expect(await response.json()).toEqual({ limit: '5', slug: 'posts' })
  })

  it('resolves a repeated key to its first value, as context.req.query does', async () => {
    const { app } = buildApp()

    const response = await app.request('/items?limit=1&limit=2')

    expect(await response.json()).toEqual({ limit: '1' })
  })

  it('drops a key the schema does not name', async () => {
    const { app } = buildApp()

    const response = await app.request('/items?limit=5&seedSlug=posts')

    expect(await response.json()).toEqual({ limit: '5' })
  })

  it('passes the handler the value the schema transformed', async () => {
    const { app } = buildApp()

    const response = await app.request('/items?slug=%20posts%20')

    expect(await response.json()).toEqual({ slug: 'posts' })
  })

  it('answers 400 without running the handler when the schema refuses the query', async () => {
    const { app, handler } = buildApp()

    const response = await app.request('/items?slug=%20')

    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets the caller shape the refusal through onInvalid', async () => {
    const { app } = buildApp((context, error) => context.json({ issues: error.issues.length }, 422))

    const response = await app.request('/items?slug=%20')

    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ issues: 1 })
  })
})
