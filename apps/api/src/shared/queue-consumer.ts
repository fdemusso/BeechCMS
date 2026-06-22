// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { JobRegistry, JobContext, QueueMessage } from '@beechcms/core'
import { D1ContentRepository } from './content.repository.d1'
import { createBucketProvider } from './storage/factory'
import type { Env } from '../types'

/**
 * Consumer-side dispatch. Mirrors index.ts `scheduled()`: builds an
 * engine-mediated JobContext from bindings (NEVER exposes env.DB to jobs) and
 * routes each message to its handler. ack() on success/unknown-name (drop),
 * retry() on throw so Cloudflare re-delivers.
 */
export async function dispatchQueueBatch(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  _ctx: ExecutionContext,
  jobs: JobRegistry,
): Promise<void> {
  const context: JobContext = {
    repository: new D1ContentRepository(env.DB),
    bucket: createBucketProvider(env, env.MEDIA_BASE_URL ?? ''),
    clock: SystemClock,
    idGenerator: SystemIdGenerator,
    env: env as unknown as Record<string, string | undefined>,
  }

  for (const message of batch.messages) {
    const { name, payload } = message.body
    const handler = jobs[name]
    if (!handler) {
      console.error(`[queue] no handler for "${name}" — dropping message`)
      message.ack()
      continue
    }
    try {
      await handler(payload, context)
      message.ack()
    } catch (error) {
      console.error(`[queue] job "${name}" failed — will retry`, error)
      message.retry()
    }
  }
}
