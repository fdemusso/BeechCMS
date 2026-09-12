// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { D1ContentRepository } from '../shared/db/repositories/content.repository.d1'
import { D1IdempotencyRepository } from '../shared/db/repositories/idempotency.repository.d1'
import { D1MediaRepository } from '../shared/db/repositories/media.repository.d1'
import { D1SystemStatsRepository } from '../shared/db/repositories/system-stats.repository.d1'
import { D1UserRepository } from '../shared/db/repositories/d1-user.repository'
import { D1SessionRepository } from '../shared/db/repositories/d1-session.repository'
import { D1PasswordResetTokenRepository } from '../shared/db/repositories/d1-password-reset-token.repository'
import { D1ActivityLogRepository } from '../shared/db/repositories/d1-activity-log.repository'
import { D1NotificationRepository } from '../shared/db/repositories/d1-notification.repository'
import { D1WidgetRepository } from '../shared/db/repositories/d1-widget.repository'
import { D1SearchRepository } from '../shared/db/repositories/d1-search.repository'
import { D1AnalyticsRepository } from '../shared/db/repositories/d1-analytics.repository'
import { D1ContentScanRepository } from '../shared/db/repositories/d1-content-scan.repository'
import { D1SiteSettingsRepository } from '../shared/db/repositories/site-settings.repository.d1'
import { D1DemoDataRepository } from '../shared/db/repositories/demo-data.repository.d1'
import { D1SetupChecklistRepository } from '../shared/db/repositories/d1-setup-checklist.repository'
import { D1SeedLayoutRepository } from '../shared/db/repositories/seed-layout.repository.d1'
import { D1DashboardLayoutRepository } from '../shared/db/repositories/dashboard-layout.repository.d1'
import { D1SeedRepository } from '../shared/db/repositories/seed.repository.d1'
import { D1SchemaMutator } from '../shared/db/migrations/schema-mutator.d1'
import { D1KanbanPositionRepository } from '../shared/db/repositories/kanban-position.repository.d1'
import { D1TimeTrapTokenRepository } from '../shared/db/repositories/time-trap-token.repository.d1'
import { D1OAuthClientRepository } from '../shared/db/repositories/d1-oauth-client.repository'
import { D1OAuthAuthorizationCodeRepository } from '../shared/db/repositories/d1-oauth-authorization-code.repository'
import { D1OAuthTokenRepository } from '../shared/db/repositories/d1-oauth-token.repository'
import { D1OAuthConsentRepository } from '../shared/db/repositories/d1-oauth-consent.repository'
import { D1RoleRepository } from '../shared/db/repositories/d1-role.repository'
import { D1RoleAssignmentRepository } from '../shared/db/repositories/d1-role-assignment.repository'
import { D1InvitationRepository } from '../shared/db/repositories/d1-invitation.repository'
import { SystemClock, SystemIdGenerator, VirusTotalAntivirusProvider, PrivacyService, PermissionRoleGuard } from '@beechcms/core'
import type { ContentRepository, IdempotencyRepository, MediaRepository, SystemStatsRepository, IUserRepository, ISessionRepository, IPasswordResetTokenRepository, IActivityLogRepository, INotificationRepository, IWidgetRepository, ISearchRepository, IAnalyticsRepository, IContentScanRepository, IClock, IIdGenerator, IAutomationRunner, IAutomationRepository, IScheduler, ISiteSettingsRepository, IDemoDataRepository, ISeedLayoutRepository, ISeedRepository, ISchemaMutator, IDashboardLayoutRepository, BeechHooks, IKanbanPositionRepository, IAntivirusProvider, ITimeTrapTokenRepository, IPrivacyService, IOAuthClientRepository, IOAuthAuthorizationCodeRepository, IOAuthTokenRepository, IOAuthConsentRepository, IRoleGuard, IRoleRepository, IRoleAssignmentRepository, IInvitationRepository, IDeletionLedger } from '@beechcms/core'
import { NoOpScheduler } from '@beechcms/core'
import { AutomationRunner } from '../features/automations/engine/automation-runner'
import { D1AutomationRepository } from '../shared/db/repositories/automations.repository.d1'
import { ExecutionContextScheduler } from '../shared/services/scheduler/execution-context-scheduler'
import { createBucketProvider } from '../shared/storage/factory'
import { R2DeletionLedger } from '../shared/storage/deletion-ledger'
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
  schemaMutator?: ISchemaMutator
  dashboardLayoutRepository?: IDashboardLayoutRepository
  kanbanPositionRepository?: IKanbanPositionRepository
  antivirusProvider?: IAntivirusProvider
  timeTrapTokenRepository?: ITimeTrapTokenRepository
  oauthClientRepository?: IOAuthClientRepository
  oauthAuthorizationCodeRepository?: IOAuthAuthorizationCodeRepository
  oauthTokenRepository?: IOAuthTokenRepository
  oauthConsentRepository?: IOAuthConsentRepository
  roleGuard?: IRoleGuard
  roleRepository?: IRoleRepository
  roleAssignmentRepository?: IRoleAssignmentRepository
  invitationRepository?: IInvitationRepository
  hooks?: BeechHooks
  privacyService?: IPrivacyService
  deletionLedger?: IDeletionLedger
}

function buildScheduler(context: Context): IScheduler {
  try {
    return new ExecutionContextScheduler(context.executionCtx)
  } catch {
    return new NoOpScheduler()
  }
}

class NoOpPrivacyService implements IPrivacyService {
  async encrypt(plaintext: string): Promise<string> { return plaintext }
  async decrypt(ciphertext: string): Promise<string> { return ciphertext }
  async hash(plaintext: string): Promise<string> { return plaintext }
}

export const repositoryMiddleware = (overrides?: RepositoryOverrides) => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    const resolvedClock = overrides?.clock ?? SystemClock
    const resolvedIdGenerator = overrides?.idGenerator ?? SystemIdGenerator
    const database = context.env.DB

    const privacyService = overrides?.privacyService ?? (context.env.PRIVACY_MASTER_KEY ? new PrivacyService(context.env.PRIVACY_MASTER_KEY) : new NoOpPrivacyService())
    context.set('privacyService', privacyService)

    // Built here rather than read from context.get('bucket'): storageMiddleware runs AFTER
    // this middleware in factory.ts, and reordering it would rewire every other repository
    // consumer. Mirrors storage.middleware.ts:21's own createBucketProvider call.
    const baseUrl = context.env.MEDIA_BASE_URL?.trim().replace(/\/+$/, '') || new URL(context.req.url).origin
    const deletionLedger = overrides?.deletionLedger ?? new R2DeletionLedger(createBucketProvider(context.env, baseUrl))
    context.set('deletionLedger', deletionLedger)

    context.set('repository', overrides?.repository ?? new D1ContentRepository(database, overrides?.hooks, privacyService, undefined, deletionLedger))
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
    // getSeed is set later by seedRegistryMiddleware — capture context by closure so the
    // runner reads the live value at call time, not at middleware creation time.
    context.set(
      'automationRunner',
      overrides?.automationRunner ?? new AutomationRunner({
        automationRepository,
        contentRepository: context.get('repository'),
        getSeed: (slug: string) => context.get('getSeed')?.(slug) ?? null,
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
    context.set('schemaMutator', overrides?.schemaMutator ?? new D1SchemaMutator(database))
    context.set('dashboardLayoutRepository', overrides?.dashboardLayoutRepository ?? new D1DashboardLayoutRepository(database))
    context.set('kanbanPositionRepository', overrides?.kanbanPositionRepository ?? new D1KanbanPositionRepository(database))
    context.set('antivirusProvider', overrides?.antivirusProvider ?? new VirusTotalAntivirusProvider(context.env.VIRUSTOTAL_API_KEY))
    context.set('timeTrapTokenRepository', overrides?.timeTrapTokenRepository ?? new D1TimeTrapTokenRepository(database))
    context.set('oauthClientRepository', overrides?.oauthClientRepository ?? new D1OAuthClientRepository(database))
    context.set('oauthAuthorizationCodeRepository', overrides?.oauthAuthorizationCodeRepository ?? new D1OAuthAuthorizationCodeRepository(database, resolvedClock))
    context.set('oauthTokenRepository', overrides?.oauthTokenRepository ?? new D1OAuthTokenRepository(database, resolvedClock))
    context.set('oauthConsentRepository', overrides?.oauthConsentRepository ?? new D1OAuthConsentRepository(database, resolvedIdGenerator))
    context.set('roleGuard', overrides?.roleGuard ?? new PermissionRoleGuard())
    context.set('roleRepository', overrides?.roleRepository ?? new D1RoleRepository(database, resolvedIdGenerator))
    context.set('roleAssignmentRepository', overrides?.roleAssignmentRepository ?? new D1RoleAssignmentRepository(database, resolvedIdGenerator))
    context.set('invitationRepository', overrides?.invitationRepository ?? new D1InvitationRepository(database, resolvedIdGenerator))
    await next()
  })
}
