// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type {
  AgentOperationSpec,
  ExcludedOperationSpec,
  OperationMethod,
  OperationRisk,
  OperationRiskInput,
  OperationRiskRule,
  OperationSpec,
} from './types.js'
import type { OAuthScope } from '../oauth/scopes.js'

const DOCS_AUTH = 'auth-endpoints.md'
const DOCS_MCP = 'mcp-server.md'
const DOCS_PUBLIC = 'public-api.md'
const DOCS_CONTENT = 'internal-content.md'
const DOCS_MEDIA = 'media-engine.md'
const DOCS_WIDGETS = 'widget-api.md'
const DOCS_AUTOMATIONS = 'automations-api.md'
const DOCS_SEEDS = 'seed-builder.md'
const DOCS_LAYOUT = 'dashboard-layout.md'
const DOCS_RBAC = 'rbac-api.md'

const EXCLUSION_REASONS = {
  SESSION: 'Interactive dashboard session or first-admin bootstrap; human only.',
  PASSWORD: 'Password and reset credentials never pass through an agent.',
  INVITE_REDEEM: "Invitation redemption is the invitee's own action.",
  OAUTH_FLOW: 'OAuth authorization and token endpoints are driven by the host, not by agent code.',
  OAUTH_GRANTS: 'An agent never manages its own OAuth grants.',
  PRE_AUTH: 'Pre-authentication endpoint outside apiProtected; not OAuth-gated.',
  PUBLIC_API: 'Public API authenticates with API keys, not OAuth; deferred (ROADMAP §7 decision 8).',
  INTERNAL: 'Internal callback or binary serving; not an agent operation.',
  SCHEMA_DIRECT: 'Direct schema writes; agents use seeds.plan and seeds.apply, the single audited path.',
  IDENTITY: 'Changes account identity or sessions; human only (lock-out risk).',
  SECRET: "Carries a secret's current and next value through the model.",
  ACCOUNT_PASSWORD: 'Creates an account with a password; agents use invitations.',
} as const

type ExclusionReasonKey = keyof typeof EXCLUSION_REASONS

/** Builds an `agent` entry; `docs` is omitted from the object when not given. */
const agent = (
  id: string,
  method: OperationMethod,
  path: string,
  scope: OAuthScope,
  risk: OperationRiskRule,
  summary: string,
  docs?: string,
): AgentOperationSpec => ({ id, method, path, summary, exposure: 'agent', scope, risk, ...(docs ? { docs } : {}) })

/** Builds an `excluded` entry from a reason key; `docs` is omitted when not given. */
const excluded = (
  id: string,
  method: OperationMethod,
  path: string,
  reason: ExclusionReasonKey,
  summary: string,
  docs?: string,
): ExcludedOperationSpec => ({
  id, method, path, summary, exposure: 'excluded', excludedReason: EXCLUSION_REASONS[reason], ...(docs ? { docs } : {}),
})

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * `publish` iff the body's `status` is `'published'` after trim, mirroring the
 * handlers' `cleanStr` read of `status`; any other body is a plain `write`.
 */
function publishWhenStatusPublished({ body }: OperationRiskInput): OperationRisk {
  if (!isPlainObject(body)) return 'write'
  const { status } = body
  return typeof status === 'string' && status.trim() === 'published' ? 'publish' : 'write'
}

/** `destructive` iff `?purge=true` exactly (the handler purges on nothing else); else a soft trash. */
function destructiveWhenPurge({ query }: OperationRiskInput): OperationRisk {
  return query.purge === 'true' ? 'destructive' : 'write'
}

/**
 * Every HTTP operation `createBeechApp()` mounts (custom routes excepted), with its
 * agent exposure, required OAuth scope and risk. Kept in lock-step with the router by
 * `apps/api/src/factory.operations-parity.test.ts`; lookup goes through `matchOperation()`.
 */
export const OPERATION_CATALOG: readonly OperationSpec[] = [
  // --- Auth & OAuth ------------------------------------------------------------
  excluded('auth.login', 'POST', '/auth/login', 'SESSION', 'Sign in with email and password', DOCS_AUTH),
  excluded('auth.refresh', 'POST', '/auth/refresh', 'SESSION', 'Rotate the refresh token and issue a new access token', DOCS_AUTH),
  excluded('auth.logout', 'POST', '/auth/logout', 'SESSION', 'End the current session', DOCS_AUTH),
  excluded('auth.setupStatus', 'GET', '/auth/setup', 'SESSION', 'Report whether the first admin account still needs to be created', DOCS_AUTH),
  excluded('auth.setup', 'POST', '/auth/setup', 'SESSION', 'Create the first admin account', DOCS_AUTH),
  excluded('auth.features', 'GET', '/auth/features', 'PRE_AUTH', 'List the authentication features enabled on this instance', DOCS_AUTH),
  excluded('auth.forgotPassword', 'POST', '/auth/forgot-password', 'PASSWORD', 'Send a password reset email', DOCS_AUTH),
  excluded('auth.resetPassword', 'POST', '/auth/reset-password', 'PASSWORD', 'Set a new password with a reset token', DOCS_AUTH),
  excluded('auth.invitationGet', 'GET', '/auth/invitations/:token', 'INVITE_REDEEM', 'Read the invitation behind a token', DOCS_AUTH),
  excluded('auth.invitationAccept', 'POST', '/auth/invitations/accept', 'INVITE_REDEEM', 'Accept an invitation and create the invitee account', DOCS_AUTH),
  excluded('oauth.authorize', 'GET', '/oauth/authorize', 'OAUTH_FLOW', 'Start the OAuth authorization code flow', DOCS_MCP),
  excluded('oauth.authorizeRequest', 'GET', '/oauth/authorize/request', 'OAUTH_FLOW', 'Read the pending authorization request for the consent screen', DOCS_MCP),
  excluded('oauth.consent', 'POST', '/oauth/authorize/consent', 'OAUTH_FLOW', 'Approve or deny a pending authorization request', DOCS_MCP),
  excluded('oauth.token', 'POST', '/oauth/token', 'OAUTH_FLOW', 'Exchange an authorization code or refresh token for tokens', DOCS_MCP),
  excluded('oauth.revoke', 'POST', '/oauth/revoke', 'OAUTH_FLOW', 'Revoke an OAuth token', DOCS_MCP),
  excluded('oauth.consentsList', 'GET', '/oauth/consents', 'OAUTH_GRANTS', 'List the OAuth clients the current user has authorized', DOCS_MCP),
  excluded('oauth.consentRevoke', 'DELETE', '/oauth/consents/:clientId', 'OAUTH_GRANTS', "Revoke a client's consent and its tokens", DOCS_MCP),

  // --- Public & internal -------------------------------------------------------
  excluded('public.health', 'GET', '/api/v1/public/health', 'PUBLIC_API', 'Check that the public API is up', DOCS_PUBLIC),
  excluded('public.timetrapToken', 'GET', '/api/v1/public/timetrap/token', 'PUBLIC_API', 'Issue a time-trap token for public form submissions', DOCS_PUBLIC),
  excluded('public.searchEmbed', 'GET', '/api/v1/public/search/embed', 'PUBLIC_API', 'Serve the embeddable public search configuration', DOCS_PUBLIC),
  excluded('public.searchIndex', 'GET', '/api/v1/public/search/index/:seedSlug/:file', 'PUBLIC_API', 'Serve a static search index file for a seed', DOCS_PUBLIC),
  excluded('public.schema', 'GET', '/api/v1/public/:seed/schema', 'PUBLIC_API', 'Read the public schema of a seed', DOCS_PUBLIC),
  excluded('public.list', 'GET', '/api/v1/public/:seed', 'PUBLIC_API', 'List the public entries of a seed', DOCS_PUBLIC),
  excluded('public.create', 'POST', '/api/v1/public/:seed/add', 'PUBLIC_API', 'Create an entry through the public API', DOCS_PUBLIC),
  excluded('public.replace', 'PUT', '/api/v1/public/:seed/edit/:id', 'PUBLIC_API', 'Replace an entry through the public API', DOCS_PUBLIC),
  excluded('public.update', 'PATCH', '/api/v1/public/:seed/edit/:id', 'PUBLIC_API', 'Partially update an entry through the public API', DOCS_PUBLIC),
  excluded('internal.qstashCallback', 'POST', '/api/webhooks/qstash', 'INTERNAL', 'Receive a QStash job callback'),
  excluded('internal.mediaServe', 'GET', '/api/media/:key{.+}', 'INTERNAL', 'Serve a stored media object', DOCS_MEDIA),

  // --- Settings ----------------------------------------------------------------
  agent('settings.get', 'GET', '/api/settings', 'settings:read', 'read', 'Read the site-wide settings'),
  agent('settings.update', 'PUT', '/api/settings', 'settings:write', 'publish', 'Update the site-wide settings'),
  agent('settings.me', 'GET', '/api/settings/me', 'settings:read', 'read', 'Read the current user profile and permissions'),
  excluded('settings.profileUpdate', 'PUT', '/api/settings/profile', 'IDENTITY', 'Update the current user profile'),
  excluded('settings.passwordUpdate', 'PUT', '/api/settings/password', 'PASSWORD', 'Change the current user password'),
  agent('settings.avatarUpdate', 'PUT', '/api/settings/avatar', 'settings:write', 'write', 'Set the current user avatar'),
  agent('settings.sessionsList', 'GET', '/api/settings/sessions', 'settings:read', 'read', 'List the current user active sessions'),
  excluded('settings.sessionRevoke', 'DELETE', '/api/settings/sessions/:id', 'IDENTITY', 'Revoke one of the current user sessions'),
  agent('settings.activity', 'GET', '/api/settings/activity', 'settings:read', 'read', 'List the current user recent activity'),
  agent('settings.storage', 'GET', '/api/settings/storage', 'analytics:read', 'read', 'Report storage usage', DOCS_MEDIA),
  agent('settings.storageOrphansDelete', 'POST', '/api/settings/storage/orphans/delete', 'media:write', 'destructive', 'Delete orphaned storage objects', DOCS_MEDIA),
  agent('settings.notificationPrefsGet', 'GET', '/api/settings/notifications', 'settings:read', 'read', 'Read the current user notification preferences'),
  agent('settings.notificationPrefsUpdate', 'PUT', '/api/settings/notifications', 'settings:write', 'write', 'Update the current user notification preferences'),
  agent('settings.uiPreferencesGet', 'GET', '/api/settings/ui-preferences', 'settings:read', 'read', 'Read the current user UI preferences'),
  agent('settings.uiPreferencesUpdate', 'PUT', '/api/settings/ui-preferences', 'settings:write', 'write', 'Update the current user UI preferences'),

  // --- Schema layout & dashboard layout ----------------------------------------
  agent('schema.snapshot', 'GET', '/api/schema', 'schema:read', 'read', 'Export the full schema snapshot', DOCS_SEEDS),
  agent('schema.layoutUpdate', 'PUT', '/api/schema/:slug/layout', 'schema:write', 'write', 'Save the editor layout of a seed', DOCS_SEEDS),
  agent('schema.layoutReset', 'DELETE', '/api/schema/:slug/layout', 'schema:write', 'write', 'Reset the editor layout of a seed to its default', DOCS_SEEDS),
  agent('layout.get', 'GET', '/api/dashboard-layout', 'settings:read', 'read', 'Read the dashboard layout', DOCS_LAYOUT),
  agent('layout.roles', 'GET', '/api/dashboard-layout/roles', 'settings:read', 'read', 'List the roles that have a dashboard layout', DOCS_LAYOUT),
  agent('layout.update', 'PUT', '/api/dashboard-layout', 'settings:write', 'write', 'Save the dashboard layout', DOCS_LAYOUT),
  agent('layout.reset', 'DELETE', '/api/dashboard-layout', 'settings:write', 'destructive', 'Reset the dashboard layout to its default', DOCS_LAYOUT),

  // --- Seeds -------------------------------------------------------------------
  agent('seeds.list', 'GET', '/api/seeds', 'schema:read', 'read', 'List all seeds', DOCS_SEEDS),
  agent('seeds.get', 'GET', '/api/seeds/:slug', 'schema:read', 'read', 'Read one seed definition', DOCS_SEEDS),
  excluded('seeds.create', 'POST', '/api/seeds', 'SCHEMA_DIRECT', 'Create a seed', DOCS_SEEDS),
  excluded('seeds.update', 'PUT', '/api/seeds/:slug', 'SCHEMA_DIRECT', 'Replace a seed definition', DOCS_SEEDS),
  excluded('seeds.addBranch', 'POST', '/api/seeds/:slug/branches', 'SCHEMA_DIRECT', 'Add a branch to a seed', DOCS_SEEDS),
  agent('seeds.plan', 'POST', '/api/seeds/:slug/mcp-plan', 'schema:read', 'read', 'Compute the migration plan for a seed change without applying it', DOCS_SEEDS),
  agent('seeds.apply', 'POST', '/api/seeds/:slug/mcp-apply', 'schema:write', 'write', 'Apply a planned seed change', DOCS_SEEDS),
  agent('seeds.ftsRebuild', 'POST', '/api/seeds/:slug/fts/rebuild', 'schema:write', 'write', 'Rebuild the full-text search index of a seed', DOCS_SEEDS),
  agent('seeds.orphansList', 'GET', '/api/seeds/:slug/orphans', 'schema:read', 'read', 'List orphaned columns of a seed', DOCS_SEEDS),
  agent('seeds.purgeStatus', 'GET', '/api/seeds/purges/:id', 'schema:read', 'read', 'Read the status of a seed purge job', DOCS_SEEDS),
  agent('seeds.delete', 'DELETE', '/api/seeds/:slug', 'schema:write', 'destructive', 'Delete a seed', DOCS_SEEDS),
  agent('seeds.hardDelete', 'DELETE', '/api/seeds/:slug/hard', 'schema:write', 'destructive', 'Delete a seed and purge its content table', DOCS_SEEDS),
  agent('seeds.branchDrop', 'DELETE', '/api/seeds/:slug/branches/:branchId', 'schema:write', 'destructive', 'Drop a branch from a seed', DOCS_SEEDS),
  agent('seeds.branchRename', 'PATCH', '/api/seeds/:slug/branches/:branchId/rename', 'schema:write', 'destructive', 'Rename a branch of a seed', DOCS_SEEDS),
  agent('seeds.branchRetype', 'PATCH', '/api/seeds/:slug/branches/:branchId/retype', 'schema:write', 'destructive', 'Change the type of a branch of a seed', DOCS_SEEDS),
  agent('seeds.orphanDrop', 'DELETE', '/api/seeds/:slug/orphans/:column', 'schema:write', 'destructive', 'Drop an orphaned column of a seed', DOCS_SEEDS),

  // --- Users, roles, assignments, invitations ----------------------------------
  agent('users.list', 'GET', '/api/rbac/users', 'users:read', 'read', 'List users', DOCS_RBAC),
  excluded('users.create', 'POST', '/api/rbac/users', 'ACCOUNT_PASSWORD', 'Create a user with a password', DOCS_RBAC),
  agent('users.get', 'GET', '/api/rbac/users/:userId', 'users:read', 'read', 'Read one user', DOCS_RBAC),
  agent('users.assignments', 'GET', '/api/rbac/users/:userId/assignments', 'users:read', 'read', 'List the role assignments of a user', DOCS_RBAC),
  agent('users.setActive', 'PATCH', '/api/rbac/users/:userId/active', 'users:write', 'destructive', 'Activate or deactivate a user account', DOCS_RBAC),
  agent('roles.list', 'GET', '/api/rbac/roles', 'users:read', 'read', 'List roles', DOCS_RBAC),
  agent('roles.create', 'POST', '/api/rbac/roles', 'users:write', 'write', 'Create a role', DOCS_RBAC),
  agent('roles.update', 'PUT', '/api/rbac/roles/:roleId', 'users:write', 'destructive', 'Update the permissions of a role', DOCS_RBAC),
  agent('roles.delete', 'DELETE', '/api/rbac/roles/:roleId', 'users:write', 'destructive', 'Delete a role', DOCS_RBAC),
  agent('assignments.create', 'POST', '/api/rbac/assignments', 'users:write', 'destructive', 'Assign a role to a user', DOCS_RBAC),
  agent('assignments.delete', 'DELETE', '/api/rbac/assignments/:assignmentId', 'users:write', 'destructive', 'Remove a role assignment', DOCS_RBAC),
  agent('invitations.list', 'GET', '/api/rbac/invitations', 'users:read', 'read', 'List pending invitations', DOCS_RBAC),
  agent('invitations.create', 'POST', '/api/rbac/invitations', 'users:write', 'destructive', 'Invite a new user by email', DOCS_RBAC),
  agent('invitations.regenerate', 'POST', '/api/rbac/invitations/:invitationId/regenerate', 'users:write', 'destructive', 'Regenerate and resend an invitation', DOCS_RBAC),
  agent('invitations.delete', 'DELETE', '/api/rbac/invitations/:invitationId', 'users:write', 'write', 'Cancel an invitation', DOCS_RBAC),

  // --- Content literal prefixes: notifications, stats --------------------------
  agent('notifications.list', 'GET', '/api/content/notifications', 'content:read', 'read', 'List notifications'),
  agent('notifications.markRead', 'PATCH', '/api/content/notifications/:id/read', 'content:write', 'write', 'Mark a notification as read'),
  agent('notifications.markUnread', 'PATCH', '/api/content/notifications/:id/unread', 'content:write', 'write', 'Mark a notification as unread'),
  agent('notifications.delete', 'DELETE', '/api/content/notifications/:id', 'content:write', 'write', 'Delete a notification'),
  agent('notifications.markAllRead', 'POST', '/api/content/notifications/mark-all-read', 'content:write', 'write', 'Mark every notification as read'),
  agent('stats.mediaLibrary', 'GET', '/api/content/stats/media-library', 'media:read', 'read', 'List the media library with usage counts', DOCS_MEDIA),
  agent('stats.unusedMedia', 'GET', '/api/content/stats/unused-media', 'media:read', 'read', 'List media no entry references', DOCS_MEDIA),
  agent('stats.setupChecklist', 'GET', '/api/content/stats/setup-checklist', 'settings:read', 'read', 'Report the progress of the setup checklist'),
  agent('stats.total', 'GET', '/api/content/stats/total', 'analytics:read', 'read', 'Count entries across all seeds'),
  agent('stats.recentActivity', 'GET', '/api/content/stats/recent-activity', 'analytics:read', 'read', 'List recent content activity'),
  agent('stats.health', 'GET', '/api/content/stats/health', 'analytics:read', 'read', 'Report system health'),
  agent('stats.cloudflare', 'GET', '/api/content/stats/cloudflare', 'analytics:read', 'read', 'Report Cloudflare usage metrics'),
  agent('stats.breakdown', 'GET', '/api/content/stats/breakdown', 'analytics:read', 'read', 'Break down entry counts by seed and status'),
  agent('stats.storageSync', 'POST', '/api/content/stats/storage/sync', 'settings:write', 'write', 'Resynchronize the storage usage counters', DOCS_MEDIA),

  // --- Content per seed --------------------------------------------------------
  excluded('content.rotateField', 'POST', '/api/content/:slug/:id/rotate-field', 'SECRET', 'Rotate the value of a secret field', DOCS_CONTENT),
  agent('drafts.list', 'GET', '/api/content/drafts', 'content:read', 'read', 'List drafts across all seeds', DOCS_CONTENT),
  agent('drafts.save', 'PUT', '/api/content/:slug/:id/draft', 'content:write', 'write', 'Save a draft of an entry', DOCS_CONTENT),
  agent('drafts.get', 'GET', '/api/content/:slug/:id/draft', 'content:read', 'read', 'Read the draft of an entry', DOCS_CONTENT),
  agent('drafts.publish', 'POST', '/api/content/:slug/:id/draft/publish', 'content:write', 'publish', 'Publish the draft of an entry', DOCS_CONTENT),
  agent('drafts.discard', 'DELETE', '/api/content/:slug/:id/draft', 'content:write', 'write', 'Discard the draft of an entry', DOCS_CONTENT),
  agent('content.backrefs', 'GET', '/api/content/:targetSlug/:targetId/backrefs', 'content:read', 'read', 'List the entries that reference an entry', DOCS_CONTENT),
  agent('content.importStatus', 'GET', '/api/content/import-jobs/:id', 'content:read', 'read', 'Read the status of an import job', DOCS_CONTENT),
  agent('content.export', 'GET', '/api/content/:slug/export', 'content:read', 'read', 'Export the entries of a seed', DOCS_CONTENT),
  agent('content.import', 'POST', '/api/content/:slug/import', 'content:write', 'publish', 'Import entries into a seed from an uploaded file', DOCS_CONTENT),
  agent('views.list', 'GET', '/api/content/:slug/views', 'content:read', 'read', 'List the saved views of a seed', DOCS_CONTENT),
  agent('views.create', 'POST', '/api/content/:slug/views', 'content:write', 'write', 'Create a saved view', DOCS_CONTENT),
  agent('views.reorder', 'PUT', '/api/content/:slug/views/order', 'content:write', 'write', 'Reorder the saved views of a seed', DOCS_CONTENT),
  agent('views.update', 'PATCH', '/api/content/:slug/views/:viewId', 'content:write', 'write', 'Update a saved view', DOCS_CONTENT),
  agent('views.delete', 'DELETE', '/api/content/:slug/views/:viewId', 'content:write', 'write', 'Delete a saved view', DOCS_CONTENT),
  agent('trash.list', 'GET', '/api/content/:slug/trash', 'content:read', 'read', 'List the trashed entries of a seed', DOCS_CONTENT),
  agent('trash.bulkRestore', 'POST', '/api/content/:slug/trash/bulk-restore', 'content:write', 'write', 'Restore several trashed entries', DOCS_CONTENT),
  agent('trash.bulkPurge', 'POST', '/api/content/:slug/trash/bulk-purge', 'content:delete', 'destructive', 'Permanently delete several trashed entries', DOCS_CONTENT),
  agent('trash.reconcile', 'POST', '/api/content/:slug/trash/reconcile', 'content:delete', 'destructive', 'Purge trashed entries past their retention window', DOCS_CONTENT),
  agent('trash.restore', 'POST', '/api/content/:slug/:id/restore', 'content:write', 'write', 'Restore a trashed entry', DOCS_CONTENT),
  agent('content.kanbanMove', 'PATCH', '/api/content/:slug/:id/kanban-move', 'content:write', 'write', 'Move an entry to another kanban column', DOCS_CONTENT),
  agent('content.list', 'GET', '/api/content/:slug', 'content:read', 'read', 'List the entries of a seed', DOCS_CONTENT),
  agent('content.facets', 'GET', '/api/content/:slug/facets', 'content:read', 'read', 'Count entries per facet value', DOCS_CONTENT),
  agent('content.get', 'GET', '/api/content/:slug/:id', 'content:read', 'read', 'Read one entry', DOCS_CONTENT),
  agent('content.getBySlug', 'GET', '/api/content/:schema_slug/by-slug/:entry_slug', 'content:read', 'read', 'Read one entry by its slug', DOCS_CONTENT),
  agent('content.create', 'POST', '/api/content/:slug', 'content:write', publishWhenStatusPublished, 'Create an entry', DOCS_CONTENT),
  agent('content.update', 'PUT', '/api/content/:slug/:id', 'content:write', publishWhenStatusPublished, 'Update an entry', DOCS_CONTENT),
  agent('content.bulkUpdate', 'PATCH', '/api/content/:slug/bulk', 'content:write', 'write', 'Update branch values on several entries', DOCS_CONTENT),
  agent('content.delete', 'DELETE', '/api/content/:slug/:id', 'content:delete', destructiveWhenPurge, 'Trash an entry, or purge it with purge=true', DOCS_CONTENT),

  // --- Widgets, search, automations, media -------------------------------------
  agent('widgets.aggregate', 'GET', '/api/widget/aggregate/:seed', 'content:read', 'read', 'Aggregate a branch of a seed', DOCS_WIDGETS),
  agent('widgets.growth', 'GET', '/api/widget/growth/:seed', 'content:read', 'read', 'Report entry growth of a seed over time', DOCS_WIDGETS),
  agent('widgets.leaderboard', 'GET', '/api/widget/leaderboard/:seed', 'content:read', 'read', 'Rank the entries of a seed by a branch', DOCS_WIDGETS),
  agent('widgets.list', 'GET', '/api/widget/list/:seed', 'content:read', 'read', 'List entries of a seed for a widget', DOCS_WIDGETS),
  agent('widgets.timeseries', 'GET', '/api/widget/timeseries/:seed', 'content:read', 'read', 'Build a time series over the entries of a seed', DOCS_WIDGETS),
  agent('widgets.distribution', 'GET', '/api/widget/distribution/:seed', 'content:read', 'read', 'Report the value distribution of a branch of a seed', DOCS_WIDGETS),
  agent('search.query', 'GET', '/api/search', 'content:read', 'read', 'Search entries across seeds'),
  agent('automations.list', 'GET', '/api/automations', 'automations:read', 'read', 'List automations', DOCS_AUTOMATIONS),
  agent('automations.get', 'GET', '/api/automations/:id', 'automations:read', 'read', 'Read one automation', DOCS_AUTOMATIONS),
  agent('automations.create', 'POST', '/api/automations', 'automations:write', 'publish', 'Create an automation', DOCS_AUTOMATIONS),
  agent('automations.update', 'PUT', '/api/automations/:id', 'automations:write', 'publish', 'Update an automation', DOCS_AUTOMATIONS),
  agent('automations.toggle', 'PATCH', '/api/automations/:id/toggle', 'automations:write', 'publish', 'Enable or disable an automation', DOCS_AUTOMATIONS),
  agent('automations.delete', 'DELETE', '/api/automations/:id', 'automations:write', 'destructive', 'Delete an automation', DOCS_AUTOMATIONS),
  agent('media.upload', 'POST', '/api/upload', 'media:write', 'write', 'Upload a media file', DOCS_MEDIA),
  agent('media.presign', 'POST', '/api/upload/presign', 'media:write', 'write', 'Request a presigned upload URL', DOCS_MEDIA),
  agent('media.confirm', 'POST', '/api/upload/confirm', 'media:write', 'write', 'Confirm a presigned upload', DOCS_MEDIA),
  agent('media.downloadUrl', 'GET', '/api/upload/download-url/:key', 'media:read', 'read', 'Get a download URL for a media object', DOCS_MEDIA),
  agent('media.delete', 'DELETE', '/api/upload/:key', 'media:write', 'destructive', 'Delete a media object', DOCS_MEDIA),

  // --- Agent intents -----------------------------------------------------------
  agent('intents.list', 'GET', '/api/agent/intents', 'agent:read', 'read', 'List your pending agent intents', DOCS_MCP),
  agent('intents.get', 'GET', '/api/agent/intents/:id', 'agent:read', 'read', 'Read one agent intent', DOCS_MCP),
  agent('intents.approve', 'POST', '/api/agent/intents/:id/approve', 'agent:approve', 'write', 'Approve an agent intent and run it once', DOCS_MCP),
  agent('intents.reject', 'POST', '/api/agent/intents/:id/reject', 'agent:read', 'write', 'Reject an agent intent', DOCS_MCP),
  agent('intents.session', 'GET', '/api/agent/session', 'agent:read', 'read', 'Read the calling agent session: scopes, environment and confirmation policy', DOCS_MCP),
]
