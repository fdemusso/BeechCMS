// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { BackgroundNotificationService } from './background-notification-service'
import type { INotificationRepository, NotificationRecord } from '@beechcms/core'

function makeRepository(opts: { createShouldThrow?: boolean } = {}): INotificationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    stats: vi.fn().mockResolvedValue({ totalCount: 0, latestCreatedAt: 0, readCount: 0 }),
    create: opts.createShouldThrow
      ? vi.fn().mockRejectedValue(new Error('db down'))
      : vi.fn().mockResolvedValue('generated-id'),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
    delete: vi.fn(),
  } as unknown as INotificationRepository & {
    create: ReturnType<typeof vi.fn>
  }
}

describe('BackgroundNotificationService', () => {
  it('delegates persistence to the repository with the provided fields', async () => {
    const repo = makeRepository()
    await new BackgroundNotificationService(repo).notify({
      title: 'Hello',
      message: 'World',
      type: 'success',
    })
    expect(repo.create).toHaveBeenCalledWith({
      title: 'Hello',
      message: 'World',
      type: 'success',
    })
  })

  it('defaults to type "info" when none is provided', async () => {
    const repo = makeRepository()
    await new BackgroundNotificationService(repo).notify({ title: 'T', message: 'M' })
    expect(repo.create).toHaveBeenCalledWith({ title: 'T', message: 'M', type: 'info' })
  })

  it('delegates to the background scheduler when provided', () => {
    const repo = makeRepository()
    const schedule = vi.fn()
    new BackgroundNotificationService(repo, schedule).notify({ title: 'T', message: 'M' })
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(schedule.mock.calls[0][0]).toBeInstanceOf(Promise)
  })

  it('never throws to the caller when the repository write fails', async () => {
    const repo = makeRepository({ createShouldThrow: true })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = new BackgroundNotificationService(repo)
    await expect(service.notify({ title: 'T', message: 'M' })).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
