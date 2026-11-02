// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QStashNotificationService } from './qstash-notification-service'

const fetchMock = vi.fn()

describe('QStashNotificationService', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{"messageId":"msg_123"}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('publishes the notification to the QStash REST endpoint targeting the webhook URL', async () => {
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test/')
    await service.notify({
      title: 'Hello',
      message: 'World',
      type: 'success',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://qstash.upstash.io/v2/publish/https://beechcms.test/api/webhooks/qstash')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer fake_token',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({ title: 'Hello', message: 'World', type: 'success' })
  })

  it('honours the base URL override for local development', async () => {
    const service = new QStashNotificationService('t', 'https://beechcms.test', undefined, 'http://localhost:8080/')
    await service.notify({ title: 'T', message: 'M' })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/v2/publish/https://beechcms.test/api/webhooks/qstash')
  })

  it('delegates to the background scheduler when provided', () => {
    const schedule = vi.fn()
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test', schedule)

    service.notify({ title: 'T', message: 'M' })

    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('never throws to the caller when the publish write fails', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test')

    await expect(service.notify({ title: 'T', message: 'M' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('logs and swallows a non-2xx publish response', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new QStashNotificationService('bad', 'https://beechcms.test')

    await expect(service.notify({ title: 'T', message: 'M' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
