// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { InMemoryQueueService } from './in-memory-queue-service'
import type { JobContext, JobRegistry } from '@beechcms/core'

function makeContext(): JobContext {
  return {
    repository: {} as any,
    bucket: {} as any,
    clock: { now: () => 0 },
    idGenerator: { nextId: () => 'id' },
    env: {},
  }
}

describe('InMemoryQueueService', () => {
  it('runs the handler inline when no scheduleBackgroundTask is provided', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const ctx = makeContext()
    await new InMemoryQueueService({ 'send-email': handler }, ctx).enqueue('send-email', { to: 'a@b.com' })
    expect(handler).toHaveBeenCalledWith({ to: 'a@b.com' }, ctx)
  })

  it('delegates the task to scheduleBackgroundTask when provided', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const schedule = vi.fn()
    await new InMemoryQueueService({ 'send-email': handler }, makeContext(), schedule).enqueue(
      'send-email',
      {},
    )
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('logs an error and returns when no handler is registered for the job name', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await new InMemoryQueueService({}, makeContext()).enqueue('unknown-job', {})
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-job'))
    consoleSpy.mockRestore()
  })

  it('catches handler errors and logs them without throwing to the caller', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('job failed'))
    const jobs: JobRegistry = { 'bad-job': handler }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      new InMemoryQueueService(jobs, makeContext()).enqueue('bad-job', {}),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('bad-job'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('catches a synchronously thrown handler error and logs it without throwing to the caller', async () => {
    const handler = vi.fn(() => {
      throw new Error('sync failure')
    })
    const jobs: JobRegistry = { 'sync-throw': handler }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      new InMemoryQueueService(jobs, makeContext()).enqueue('sync-throw', {}),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('sync-throw'),
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('handles a synchronous handler that returns void/undefined without throwing to the caller', async () => {
    const handler = vi.fn(() => undefined)
    const jobs: JobRegistry = { 'sync-void': handler as unknown as JobRegistry['sync-void'] }
    await expect(
      new InMemoryQueueService(jobs, makeContext()).enqueue('sync-void', {}),
    ).resolves.toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rejects job names inherited from the prototype chain instead of invoking them', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await new InMemoryQueueService({}, makeContext()).enqueue('constructor', {})
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('constructor'))
    consoleSpy.mockRestore()
  })
})
