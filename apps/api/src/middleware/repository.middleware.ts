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
import type { ContentRepository, IdempotencyRepository, MediaRepository, SystemStatsRepository, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogRepository, INotificationRepository } from '@beechcms/core'
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
}

export const repositoryMiddleware = (overrides?: RepositoryOverrides) => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    context.set('repository', overrides?.repository ?? new D1ContentRepository(context.env.DB))
    context.set('idempotencyRepository', overrides?.idempotencyRepository ?? new D1IdempotencyRepository(context.env.DB))
    context.set('mediaRepository', overrides?.mediaRepository ?? new D1MediaRepository(context.env.DB))
    context.set('systemStatsRepository', overrides?.systemStatsRepository ?? new D1SystemStatsRepository(context.env.DB))
    context.set('userRepository', overrides?.userRepository ?? new D1UserRepository(context.env.DB))
    context.set('sessionRepository', overrides?.sessionRepository ?? new D1SessionRepository(context.env.DB))
    context.set('passwordResetTokenRepository', overrides?.passwordResetTokenRepository ?? new D1PasswordResetTokenRepository(context.env.DB))
    context.set('activityLogRepository', overrides?.activityLogRepository ?? new D1ActivityLogRepository(context.env.DB))
    context.set('notificationRepository', overrides?.notificationRepository ?? new D1NotificationRepository(context.env.DB))
    await next()
  })
}
