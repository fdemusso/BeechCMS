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
  it('sends the correct QueueMessage envelope to the binding', async () => {
    const queue = makeQueue()
    await new CloudflareQueueService(queue as any).enqueue('send-email', { to: 'a@b.com' })
    expect(queue.send).toHaveBeenCalledWith({ name: 'send-email', payload: { to: 'a@b.com' } })
  })

  it('never throws to the caller when queue.send fails', async () => {
    const queue = makeQueue({ sendShouldThrow: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      new CloudflareQueueService(queue as any).enqueue('send-email', {}),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('send-email'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })
})
