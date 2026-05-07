import { createMiddleware } from 'hono/factory'
import type { IActivityLogger, INotificationService } from '@beechcms/core'
import type { AppEnv } from '../types'
import { D1ActivityLogger } from '../shared/d1-activity-logger'
import { BackgroundNotificationService } from '../shared/background-notification-service'

export interface ObservabilityOverrides {
  activityLogger?: IActivityLogger
  notificationService?: INotificationService
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

    const activityLogger =
      overrides?.activityLogger ?? new D1ActivityLogger(context.env.DB, scheduleBackgroundTask)

    const notificationService =
      overrides?.notificationService ??
      new BackgroundNotificationService(context.get('notificationRepository'), scheduleBackgroundTask)

    context.set('activityLogger', activityLogger)
    context.set('notificationService', notificationService)

    await next()
  })
}
