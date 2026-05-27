// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { INotificationService, CreateNotificationInput } from '@beechcms/core'
import { Client } from '@upstash/qstash'

type ScheduleBackgroundTask = (task: Promise<unknown>) => void

/**
 * QStash implementation of {@link INotificationService}.
 *
 * This service acts as a publisher, sending the notification payload to Upstash QStash,
 * which guarantees delivery and retries. QStash will then forward the payload to the
 * local webhook endpoint where it is actually inserted into D1.
 */
export class QStashNotificationService implements INotificationService {
  private readonly client: Client
  private readonly webhookUrl: string

  constructor(
    token: string,
    appUrl: string,
    private readonly scheduleBackgroundTask?: ScheduleBackgroundTask,
    qstashUrl?: string
  ) {
    this.client = new Client({ 
      token,
      ...(qstashUrl ? { baseUrl: qstashUrl } : {})
    })
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
      await this.client.publishJSON({
        url: this.webhookUrl,
        body: input,
      })
    } catch (error) {
      console.error('QStashNotificationService: failed to publish notification', error)
    }
  }
}
