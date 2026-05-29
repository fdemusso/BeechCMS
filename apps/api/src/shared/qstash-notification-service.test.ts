// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QStashNotificationService } from './qstash-notification-service'
import { Client } from '@upstash/qstash'

// Mock the @upstash/qstash Client
vi.mock('@upstash/qstash', () => {
  const publishJSON = vi.fn().mockResolvedValue({ messageId: 'msg_123' })
  return {
    Client: vi.fn().mockImplementation(() => ({
      publishJSON,
    })),
  }
})

describe('QStashNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates publishing to the QStash client with correct URL', async () => {
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test/')
    await service.notify({
      title: 'Hello',
      message: 'World',
      type: 'success',
    })

    const clientInstance = vi.mocked(Client).mock.results[0].value
    expect(clientInstance.publishJSON).toHaveBeenCalledWith({
      url: 'https://beechcms.test/api/webhooks/qstash',
      body: {
        title: 'Hello',
        message: 'World',
        type: 'success',
      },
    })
  })

  it('delegates to the background scheduler when provided', () => {
    const schedule = vi.fn()
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test', schedule)
    
    service.notify({ title: 'T', message: 'M' })
    
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('never throws to the caller when the publish write fails', async () => {
    // Override the mock for this specific test
    const mockPublish = vi.fn().mockRejectedValue(new Error('network error'))
    vi.mocked(Client).mockImplementationOnce(() => ({
      publishJSON: mockPublish,
    }) as any)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new QStashNotificationService('fake_token', 'https://beechcms.test')
    
    await expect(service.notify({ title: 'T', message: 'M' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
