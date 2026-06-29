// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IQueueService, QueueMessage } from '@beechcms/core'

/**
 * Production producer. Sends a QueueMessage envelope onto the Cloudflare Queue
 * binding. Cloudflare guarantees at-least-once delivery + retries on the
 * consumer side, so enqueue only needs to hand off the message.
 */
export class CloudflareQueueService implements IQueueService {
  constructor(private readonly queue: Queue<QueueMessage>) {}

  async enqueue<T>(name: string, payload: T): Promise<void> {
    try {
      await this.queue.send({ name, payload } satisfies QueueMessage<T>)
    } catch (error) {
      // Never crash the originating request (contract parity w/ notifications).
      console.error(`CloudflareQueueService: failed to enqueue "${name}"`, error)
    }
  }
}
