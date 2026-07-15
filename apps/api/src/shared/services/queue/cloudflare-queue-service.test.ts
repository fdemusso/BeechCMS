// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { CloudflareQueueService } from './cloudflare-queue-service'

function makeQueue(opts: { sendShouldThrow?: boolean } = {}) {
  return {
    send: opts.sendShouldThrow
      ? vi.fn().mockRejectedValue(new Error('queue unavailable'))
      : vi.fn().mockResolvedValue(undefined),
  }
}

describe('CloudflareQueueService', () => {
  it('sends the correct QueueMessage envelope to the binding and reports success', async () => {
    const queue = makeQueue()
    const result = await new CloudflareQueueService(queue as any).enqueue('send-email', { to: 'a@b.com' })
    expect(queue.send).toHaveBeenCalledWith({ name: 'send-email', payload: { to: 'a@b.com' } })
    expect(result).toBe(true)
  })

  it('never throws to the caller when queue.send fails, but reports failure via return value', async () => {
    const queue = makeQueue({ sendShouldThrow: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      new CloudflareQueueService(queue as any).enqueue('send-email', {}),
    ).resolves.toBe(false)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('send-email'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('reports failure (not a false success) when the payload exceeds the 128 KiB queue message limit', async () => {
    // Cloudflare Queues rejects send() outright once a message exceeds the
    // per-message size limit; simulate that transport-level rejection here.
    const oversizedPayload = { blob: 'x'.repeat(140 * 1024) } // > 128 KiB
    const queue = {
      send: vi.fn().mockRejectedValue(new Error('MessageSendMaxMessageSizeExceededError: message size limit exceeded')),
    }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await new CloudflareQueueService(queue as any).enqueue('bulk-export', oversizedPayload)

    expect(result).toBe(false)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bulk-export'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})
