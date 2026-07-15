// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { webhooksApp } from './index'

const verifyMock = vi.fn()

vi.mock('@upstash/qstash', () => ({
  Receiver: vi.fn().mockImplementation(function Receiver() {
    return { verify: verifyMock }
  }),
}))

function buildApp(create = vi.fn().mockResolvedValue(undefined)) {
  const app = new Hono()
  app.use('*', async (context, next) => {
    context.set('notificationRepository', { create })
    await next()
  })
  app.route('/', webhooksApp)
  return { app, create }
}

describe('webhooksApp POST /qstash', () => {
  beforeEach(() => {
    verifyMock.mockReset()
  })

  it('passes the request URL to receiver.verify for endpoint binding', async () => {
    verifyMock.mockResolvedValue(true)
    const { app, create } = buildApp()

    await app.request(
      'http://localhost/qstash',
      {
        method: 'POST',
        headers: {
          'Upstash-Signature': 'sig',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 't', message: 'm' }),
      },
      {
        QSTASH_CURRENT_SIGNING_KEY: 'current',
        QSTASH_NEXT_SIGNING_KEY: 'next',
      },
    )

    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost/qstash' }),
    )
    expect(create).toHaveBeenCalled()
  })

  it('rejects a signature valid for a different endpoint (cross-endpoint replay)', async () => {
    // Simulates verify() rejecting because the signed url does not match this endpoint.
    verifyMock.mockResolvedValue(false)
    const { app, create } = buildApp()

    const response = await app.request(
      'http://localhost/qstash',
      {
        method: 'POST',
        headers: {
          'Upstash-Signature': 'sig-for-other-endpoint',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 't', message: 'm' }),
      },
      {
        QSTASH_CURRENT_SIGNING_KEY: 'current',
        QSTASH_NEXT_SIGNING_KEY: 'next',
      },
    )

    expect(response.status).toBe(401)
    expect(create).not.toHaveBeenCalled()
  })
})
