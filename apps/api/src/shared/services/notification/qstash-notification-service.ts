// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { INotificationService, CreateNotificationInput } from '@beechcms/core'

const DEFAULT_QSTASH_URL = 'https://qstash.upstash.io'

type ScheduleBackgroundTask = (task: Promise<unknown>) => void

/**
 * QStash implementation of {@link INotificationService}.
 *
 * This service acts as a publisher, sending the notification payload to Upstash QStash,
 * which guarantees delivery and retries. QStash will then forward the payload to the
 * local webhook endpoint where it is actually inserted into D1.
 */
export class QStashNotificationService implements INotificationService {
  private readonly token: string
  private readonly publishUrl: string
  private readonly webhookUrl: string

  constructor(
    token: string,
    appUrl: string,
    private readonly scheduleBackgroundTask?: ScheduleBackgroundTask,
    qstashUrl?: string
  ) {
    this.token = token
    this.publishUrl = `${(qstashUrl ?? DEFAULT_QSTASH_URL).replace(/\/+$/, '')}/v2/publish/`
    this.webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/qstash`
  }

  notify(input: CreateNotificationInput): Promise<void> | void {
    const publishPromise = this.runPublish(input)

    if (this.scheduleBackgroundTask) {
      this.scheduleBackgroundTask(publishPromise)
      return
    }

    return publishPromise
  }

  private async runPublish(input: CreateNotificationInput): Promise<void> {
    try {
      const response = await fetch(this.publishUrl + this.webhookUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        throw new Error(`QStash publish failed with status ${response.status}`)
      }
    } catch (error) {
      console.error('QStashNotificationService: failed to publish notification', error)
    }
  }
}
