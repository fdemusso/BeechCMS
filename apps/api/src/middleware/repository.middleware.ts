import { createMiddleware } from 'hono/factory'
import { D1ContentRepository } from '../shared/content.repository.d1'
import { D1IdempotencyRepository } from '../shared/idempotency.repository.d1'
import { D1MediaRepository } from '../shared/media.repository.d1'
import { D1SystemStatsRepository } from '../shared/system-stats.repository.d1'
import { D1UserRepository } from '../shared/d1-user.repository'
import { D1SessionRepository } from '../shared/d1-session.repository'
import { D1PasswordResetTokenRepository } from '../shared/d1-password-reset-token.repository'
import { D1ActivityLogRepository } from '../shared/d1-activity-log.repository'
import { D1NotificationRepository } from '../shared/d1-notification.repository'
import { D1WidgetRepository } from '../shared/d1-widget.repository'
import { D1SearchRepository } from '../shared/d1-search.repository'
import { D1AnalyticsRepository } from '../shared/d1-analytics.repository'
import { D1ContentScanRepository } from '../shared/d1-content-scan.repository'
import { SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { ContentRepository, IdempotencyRepository, MediaRepository, SystemStatsRepository, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogRepository, INotificationRepository, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, IClock, IIdGenerator } from '@beechcms/core'
import type { Env, Variables } from '../types'

interface RepositoryOverrides {
  repository?: ContentRepository
  idempotencyRepository?: IdempotencyRepository
  mediaRepository?: MediaRepository
  systemStatsRepository?: SystemStatsRepository
  userRepository?: IUserRepository
  sessionRepository?: ISessionRepository
  passwordResetTokenRepository?: IPasswordResetTokenRepository
  activityLogRepository?: IActivityLogRepository
  notificationRepository?: INotificationRepository
  widgetRepository?: IWidgetRepository
  searchRepository?: ISearchRepository
  analyticsRepository?: IAnalyticsRepository
  contentScanRepository?: IContentScanRepository
  clock?: IClock
  idGenerator?: IIdGenerator
}

export const repositoryMiddleware = (overrides?: RepositoryOverrides) => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    const resolvedClock = overrides?.clock ?? SystemClock
    const resolvedIdGenerator = overrides?.idGenerator ?? SystemIdGenerator
    const database = context.env.DB

    context.set('repository', overrides?.repository ?? new D1ContentRepository(database))
    context.set('idempotencyRepository', overrides?.idempotencyRepository ?? new D1IdempotencyRepository(database))
    context.set('mediaRepository', overrides?.mediaRepository ?? new D1MediaRepository(database))
    context.set('systemStatsRepository', overrides?.systemStatsRepository ?? new D1SystemStatsRepository(database))
    context.set('userRepository', overrides?.userRepository ?? new D1UserRepository(database))
    context.set('sessionRepository', overrides?.sessionRepository ?? new D1SessionRepository(database, resolvedClock))
    context.set('passwordResetTokenRepository', overrides?.passwordResetTokenRepository ?? new D1PasswordResetTokenRepository(database, resolvedIdGenerator))
    context.set('activityLogRepository', overrides?.activityLogRepository ?? new D1ActivityLogRepository(database))
    context.set('notificationRepository', overrides?.notificationRepository ?? new D1NotificationRepository(database, resolvedClock, resolvedIdGenerator))
    context.set('widgetRepository', overrides?.widgetRepository ?? new D1WidgetRepository(database))
    context.set('searchRepository', overrides?.searchRepository ?? new D1SearchRepository(database))
    context.set('analyticsRepository', overrides?.analyticsRepository ?? new D1AnalyticsRepository(database, resolvedClock))
    context.set('contentScanRepository', overrides?.contentScanRepository ?? new D1ContentScanRepository(database))
    await next()
  })
}
