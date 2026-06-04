// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
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
import { D1SiteSettingsRepository } from '../shared/site-settings.repository.d1'
import { D1DemoDataRepository } from '../shared/demo-data.repository.d1'
import { D1SetupChecklistRepository } from '../shared/d1-setup-checklist.repository'
import { D1SeedLayoutRepository } from '../shared/seed-layout.repository.d1'
import { D1SeedRepository } from '../shared/seed.repository.d1'
import { SystemClock, SystemIdGenerator } from '@beechcms/core'
import type { ContentRepository, IdempotencyRepository, MediaRepository, SystemStatsRepository, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogRepository, INotificationRepository, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, IClock, IIdGenerator, IAutomationRunner, IAutomationRepository, IScheduler, ISiteSettingsRepository, IDemoDataRepository, ISeedLayoutRepository, ISeedRepository } from '@beechcms/core'
import { NoOpScheduler } from '@beechcms/core'
import { AutomationRunner } from '../features/automations'
import { D1AutomationRepository } from '../shared/automations.repository.d1'
import { ExecutionContextScheduler } from '../shared/execution-context-scheduler'
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
  automationRepository?: IAutomationRepository
  automationRunner?: IAutomationRunner
  scheduler?: IScheduler
  siteSettingsRepository?: ISiteSettingsRepository
  demoDataRepository?: IDemoDataRepository
  seedLayoutRepository?: ISeedLayoutRepository
  seedRepository?: ISeedRepository
}

function buildScheduler(context: Context): IScheduler {
  try {
    return new ExecutionContextScheduler(context.executionCtx)
  } catch {
    return new NoOpScheduler()
  }
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
    context.set('clock', resolvedClock)
    context.set('idGenerator', resolvedIdGenerator)
    const automationRepository = overrides?.automationRepository
      ?? new D1AutomationRepository(database)

    context.set('automationRepository', automationRepository)
    context.set(
      'automationRunner',
      overrides?.automationRunner ?? new AutomationRunner({
        automationRepository,
        contentRepository: context.get('repository'),
        getSeed: context.get('getSeed'),
        idGenerator: resolvedIdGenerator,
        env: context.env as unknown as Record<string, string | undefined>,
      }),
    )
    context.set('scheduler', overrides?.scheduler ?? buildScheduler(context))
    context.set('siteSettingsRepository', overrides?.siteSettingsRepository ?? new D1SiteSettingsRepository(database))
    context.set('demoDataRepository', overrides?.demoDataRepository ?? new D1DemoDataRepository(database))
    context.set('setupChecklistRepository', new D1SetupChecklistRepository(database))
    context.set('seedLayoutRepository', overrides?.seedLayoutRepository ?? new D1SeedLayoutRepository(database))
    context.set('seedRepository', overrides?.seedRepository ?? new D1SeedRepository(database))
    await next()
  })
}
