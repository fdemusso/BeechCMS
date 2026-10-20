// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { createMiddleware } from 'hono/factory'
import { NoOpQueueService, SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { IQueueService, JobRegistry, JobContext, QueueMessage } from '@beechcms/core'
import type { AppEnv } from '../types'
import { CloudflareQueueService } from '../shared/services/queue/cloudflare-queue-service'
import { InMemoryQueueService } from '../shared/services/queue/in-memory-queue-service'

export interface QueueOverrides {
  queue?: IQueueService
}

/**
 * Injects `queue` into context. Must run AFTER repositoryMiddleware and
 * storageMiddleware: the in-memory fallback builds a JobContext from
 * `repository` + `bucket` already present in context.
 */
export const queueMiddleware = (jobs: JobRegistry = {}, overrides?: QueueOverrides) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    let scheduleBackgroundTask: ((task: Promise<unknown>) => void) | undefined
    try {
      const executionContext = context.executionCtx
      scheduleBackgroundTask = executionContext.waitUntil.bind(executionContext)
    } catch {
      scheduleBackgroundTask = undefined
    }

    let queue: IQueueService
    if (overrides?.queue) {
      queue = overrides.queue
    } else if (context.env.QUEUE) {
      queue = new CloudflareQueueService(context.env.QUEUE as Queue<QueueMessage>)
    } else {
      // The in-memory transport IS the context's queue: a chunked job re-enqueuing itself in
      // local dev must reach the same in-process dispatcher. The cycle is broken by assigning
      // after construction rather than by making JobContext.queue optional, which would push a
      // null-check into every handler.
      const jobContext: JobContext = {
        repository: context.get('repository'),
        bucket: context.get('bucket'),
        clock: SystemClock,
        idGenerator: SystemIdGenerator,
        queue: new NoOpQueueService(),
        env: context.env as unknown as Record<string, string | undefined>,
      }
      const inMemoryQueue = new InMemoryQueueService(jobs, jobContext, scheduleBackgroundTask)
      jobContext.queue = inMemoryQueue
      queue = inMemoryQueue
    }

    context.set('queue', queue)
    const repository = context.get('repository') as any
    if (repository && typeof repository.setQueue === 'function') {
      repository.setQueue(queue)
    }
    await next()
  })
}
