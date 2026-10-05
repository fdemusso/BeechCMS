// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from 'vitest'
import type { JobRegistry, QueueMessage } from '@beechcms/core'
import type { Env } from '../../types'
import { dispatchQueueBatch } from './queue-consumer'

describe('dispatchQueueBatch', () => {
  it('reports an unaccepted continuation when the producer binding is missing', async () => {
    const ack = vi.fn()
    const retry = vi.fn()
    const accepted: boolean[] = []
    const jobs: JobRegistry = {
      cursor: async (payload, context) => {
        accepted.push(await context.queue.enqueue('cursor', payload))
      },
    }
    const batch: MessageBatch<QueueMessage> = {
      queue: 'jobs',
      metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
      messages: [{ id: 'message-1', timestamp: new Date(0), attempts: 1,
        body: { name: 'cursor', payload: { offset: 1 } }, ack, retry }],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    }
    const env = { DB: {}, JWT_SECRET: 'test-secret' } as Env

    // Missing producers must expose dropped continuations.
    const result = await dispatchQueueBatch(batch, env, {} as ExecutionContext, jobs)

    expect(result).toBeUndefined()
    expect(accepted).toEqual([false])

    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })
})
