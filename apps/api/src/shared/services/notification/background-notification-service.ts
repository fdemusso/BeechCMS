// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  INotificationService,
  CreateNotificationInput,
  INotificationRepository,
  NotificationType,
} from '@beechcms/core'

const DEFAULT_NOTIFICATION_TYPE: NotificationType = 'info'

type ScheduleBackgroundTask = (task: Promise<unknown>) => void

/**
 * Production implementation of {@link INotificationService}.
 *
 * Delegates persistence to the injected {@link INotificationRepository}.
 * When `scheduleBackgroundTask` is provided (wired to
 * `c.executionCtx.waitUntil`), the repository write runs after the response
 * is flushed so the public-API request that triggered it is never delayed.
 */
export class BackgroundNotificationService implements INotificationService {
  constructor(
    private readonly notificationRepository: INotificationRepository,
    private readonly scheduleBackgroundTask?: ScheduleBackgroundTask
  ) {}

  notify(input: CreateNotificationInput): Promise<void> | void {
    const persistPromise = this.runPersist(input)

    if (this.scheduleBackgroundTask) {
      this.scheduleBackgroundTask(persistPromise)
      return
    }

    return persistPromise
  }

  private async runPersist(input: CreateNotificationInput): Promise<void> {
    try {
      await this.notificationRepository.create({
        title: input.title,
        message: input.message,
        type: input.type ?? DEFAULT_NOTIFICATION_TYPE,
      })
    } catch (error) {
      console.error('BackgroundNotificationService: failed to create notification', error)
    }
  }
}
