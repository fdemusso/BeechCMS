// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IQueueService, QueueMessage } from '@beechcms/core'

/**
 * Production producer. Sends a QueueMessage envelope onto the Cloudflare Queue
 * binding. Cloudflare guarantees at-least-once delivery + retries on the
 * consumer side once a message is accepted, but `send()` itself rejects
 * outright for transport-level failures (e.g. the 128 KiB per-message size
 * limit) — those never reach the consumer, so callers MUST be told the
 * message was dropped instead of assuming it was scheduled.
 */
export class CloudflareQueueService implements IQueueService {
  constructor(private readonly queue: Queue<QueueMessage>) {}

  async enqueue<T>(name: string, payload: T): Promise<boolean> {
    try {
      await this.queue.send({ name, payload } satisfies QueueMessage<T>)
      return true
    } catch (error) {
      // Never crash the originating request (contract parity w/ notifications),
      // but surface the drop via the return value instead of a false success.
      console.error(`CloudflareQueueService: failed to enqueue "${name}"`, error)
      return false
    }
  }
}
