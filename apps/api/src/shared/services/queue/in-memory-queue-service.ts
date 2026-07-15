// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IQueueService, JobRegistry, JobContext } from '@beechcms/core'

type ScheduleBackgroundTask = (task: Promise<unknown>) => void

/**
 * Dev/offline + test fallback used when the QUEUE binding is absent. Runs the
 * matching handler in-process. In production this is never selected. Uses
 * executionCtx.waitUntil when available so enqueue stays non-blocking; falls
 * back to awaiting inline (tests) otherwise.
 */
export class InMemoryQueueService implements IQueueService {
  constructor(
    private readonly jobs: JobRegistry,
    private readonly context: JobContext,
    private readonly scheduleBackgroundTask?: ScheduleBackgroundTask,
  ) {}

  async enqueue<T>(name: string, payload: T): Promise<void> {
    const handler = Object.hasOwn(this.jobs, name) ? this.jobs[name] : undefined
    if (!handler) {
      console.error(`InMemoryQueueService: no handler registered for "${name}"`)
      return
    }

    let run: Promise<void>
    try {
      const result = handler(payload, this.context)
      run = Promise.resolve(result).catch((error) => {
        console.error(`InMemoryQueueService: job "${name}" failed`, error)
      })
    } catch (error) {
      console.error(`InMemoryQueueService: job "${name}" failed synchronously`, error)
      return
    }

    if (this.scheduleBackgroundTask) {
      this.scheduleBackgroundTask(run)
      return
    }
    await run
  }
}
