// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { createMiddleware } from 'hono/factory'
import { SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { IQueueService, JobRegistry, JobContext, QueueMessage } from '@beechcms/core'
import type { AppEnv } from '../types'
import { CloudflareQueueService } from '../shared/cloudflare-queue-service'
import { InMemoryQueueService } from '../shared/in-memory-queue-service'

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
      const jobContext: JobContext = {
        repository: context.get('repository'),
        bucket: context.get('bucket'),
        clock: SystemClock,
        idGenerator: SystemIdGenerator,
        env: context.env as unknown as Record<string, string | undefined>,
      }
      queue = new InMemoryQueueService(jobs, jobContext, scheduleBackgroundTask)
    }

    context.set('queue', queue)
    await next()
  })
}
