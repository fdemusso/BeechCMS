// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { IActivityLogger, INotificationService, IClock, IIdGenerator } from '@beechcms/core'
import { SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { AppEnv } from '../types'
import { D1ActivityLogger } from '../shared/d1-activity-logger'
import { BackgroundNotificationService } from '../shared/background-notification-service'
import { QStashNotificationService } from '../shared/qstash-notification-service'

export interface ObservabilityOverrides {
  activityLogger?: IActivityLogger
  notificationService?: INotificationService
  clock?: IClock
  idGenerator?: IIdGenerator
}

/**
 * Observability middleware.
 *
 * Injects the activity logger and the notification service into the Hono
 * context. Both depend on `executionCtx.waitUntil` to fire-and-forget their
 * persistence work in production. The notification service additionally
 * depends on the notification repository — `repositoryMiddleware` MUST run
 * before this middleware in the factory pipeline.
 *
 * Tests can pass their own implementations via `overrides` to bypass D1.
 */
export const observabilityMiddleware = (overrides?: ObservabilityOverrides) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    let scheduleBackgroundTask: ((task: Promise<unknown>) => void) | undefined
    try {
      const executionContext = context.executionCtx
      scheduleBackgroundTask = executionContext.waitUntil.bind(executionContext)
    } catch {
      scheduleBackgroundTask = undefined
    }

    const resolvedClock = overrides?.clock ?? SystemClock
    const resolvedIdGenerator = overrides?.idGenerator ?? SystemIdGenerator

    const activityLogger =
      overrides?.activityLogger ??
      new D1ActivityLogger(context.env.DB, resolvedClock, resolvedIdGenerator, scheduleBackgroundTask)

    let notificationService: INotificationService
    if (overrides?.notificationService) {
      notificationService = overrides.notificationService
    } else if (context.env.QSTASH_TOKEN && (context.env.QSTASH_CALLBACK_URL || context.env.APP_URL)) {
      notificationService = new QStashNotificationService(
        context.env.QSTASH_TOKEN,
        (context.env.QSTASH_CALLBACK_URL ?? context.env.APP_URL) as string,
        scheduleBackgroundTask,
        context.env.QSTASH_URL
      )
    } else {
      notificationService = new BackgroundNotificationService(
        context.get('notificationRepository'),
        scheduleBackgroundTask
      )
    }

    context.set('activityLogger', activityLogger)
    context.set('notificationService', notificationService)

    await next()
  })
}
