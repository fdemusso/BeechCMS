// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { storageMiddleware } from './storage.middleware'

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  app.use('*', storageMiddleware())
  app.get('/test', (c) => c.json({ imageTransformer: c.var.imageTransformer === null ? null : c.var.imageTransformer.constructor.name }))
  return app
}

describe('storageMiddleware', () => {
  it('sets imageTransformer to null when the IMAGES binding is absent', async () => {
    const app = buildApp()

    const response = await app.request('/test', undefined, {})

    const body = await response.json<{ imageTransformer: string | null }>()
    expect(body.imageTransformer).toBeNull()
  })

  it('sets imageTransformer to a CloudflareImagesTransformer when the IMAGES binding is present', async () => {
    const app = buildApp()
    const IMAGES = { info: () => {}, input: () => {}, hosted: {} } as unknown as ImagesBinding

    const response = await app.request('/test', undefined, { IMAGES })

    const body = await response.json<{ imageTransformer: string | null }>()
    expect(body.imageTransformer).toBe('CloudflareImagesTransformer')
  })
})
