// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ActivityLogger } from './d1-activity-logger'
import type { ActivityLogEntry } from '@beechcms/core'
import { FixedClock } from '../clock/fixed-clock'
import { SequentialIdGenerator } from '../id-generator/sequential-id-generator'

const clock = new FixedClock(1700000000_000)
const makeIdGen = () => new SequentialIdGenerator()

function makeMockDb(opts: { runShouldThrow?: boolean } = {}) {
  const runMock = opts.runShouldThrow
    ? vi.fn().mockRejectedValue(new Error('db down'))
    : vi.fn().mockResolvedValue({ success: true })
  const bindMock = vi.fn<(...args: any[]) => any>(() => ({ run: runMock }))
  const prepareMock = vi.fn<(...args: any[]) => any>(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock }
}

const SAMPLE_ENTRY: ActivityLogEntry = {
  action: 'create',
  entityType: 'content',
  entityId: 'entry-1',
  entitySlug: 'posts',
  details: { title: 'Hello' },
  actor: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
}

describe('D1ActivityLogger', () => {
  it('inserts into activity_logs with the actor and entry payload bound in order', async () => {
    const { db, prepareMock, bindMock } = makeMockDb()
    const logger = new D1ActivityLogger(db, clock, makeIdGen())

    await logger.log(SAMPLE_ENTRY)

    expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO activity_logs'))
    const boundArguments = bindMock.mock.calls[0] as any[]
    expect(boundArguments[1]).toBe('user-1')
    expect(boundArguments[2]).toBe('admin@example.com')
    expect(boundArguments[3]).toBe('Admin')
    expect(boundArguments[4]).toBe('create')
    expect(boundArguments[5]).toBe('content')
    expect(boundArguments[6]).toBe('entry-1')
    expect(boundArguments[7]).toBe('posts')
    expect(boundArguments[8]).toBe('{"title":"Hello"}')
  })

  it('serialises details as null when absent', async () => {
    const { db, bindMock } = makeMockDb()
    await new D1ActivityLogger(db, clock, makeIdGen()).log({ ...SAMPLE_ENTRY, details: undefined })
    expect((bindMock.mock.calls[0] as any[])[8]).toBeNull()
  })

  it('falls back to "unknown" when actor email is empty', async () => {
    const { db, bindMock } = makeMockDb()
    await new D1ActivityLogger(db, clock, makeIdGen()).log({
      ...SAMPLE_ENTRY,
      actor: { id: 'u', email: '', name: null },
    })
    expect((bindMock.mock.calls[0] as any[])[2]).toBe('unknown')
  })

  it('schedules the insert via the background hook when provided', async () => {
    const { db } = makeMockDb()
    const scheduleBackgroundTask = vi.fn()
    const logger = new D1ActivityLogger(db, clock, makeIdGen(), scheduleBackgroundTask)

    logger.log(SAMPLE_ENTRY)

    expect(scheduleBackgroundTask).toHaveBeenCalledTimes(1)
    expect(scheduleBackgroundTask.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('never throws to the caller when the underlying INSERT fails', async () => {
    const { db } = makeMockDb({ runShouldThrow: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = new D1ActivityLogger(db, clock, makeIdGen())

    await expect(logger.log(SAMPLE_ENTRY)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
