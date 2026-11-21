// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/operations
 * Hand-written map from SDK method to catalog operation id. `satisfies` makes the compiler enforce key
 * parity with {@link BeechSdk}; id and route correctness is enforced by `sdk-parity.test.ts`.
 */

import type { BeechSdk } from './types.js'

export const SDK_HELPER_METHODS = ['content.listAll', 'content.importFile', 'content.waitForImport', 'media.uploadFile'] as const
type HelperKey = 'listAll' | 'importFile' | 'waitForImport' | 'uploadFile'

export type SdkOperationMap = {
  readonly [N in keyof BeechSdk]: { readonly [M in Exclude<keyof BeechSdk[N], HelperKey>]: string }
}

/** SDK method → catalog operation id. Rule: the value is always `${namespace}.${method}`. */
export const SDK_OPERATIONS = {
  content: {
    list: 'content.list',
    get: 'content.get',
    getBySlug: 'content.getBySlug',
    facets: 'content.facets',
    backrefs: 'content.backrefs',
    create: 'content.create',
    update: 'content.update',
    bulkUpdate: 'content.bulkUpdate',
    delete: 'content.delete',
    kanbanMove: 'content.kanbanMove',
    export: 'content.export',
    import: 'content.import',
    importStatus: 'content.importStatus',
  },
  trash: {
    list: 'trash.list',
    restore: 'trash.restore',
    bulkRestore: 'trash.bulkRestore',
    bulkPurge: 'trash.bulkPurge',
    reconcile: 'trash.reconcile',
  },
  drafts: {
    list: 'drafts.list',
    save: 'drafts.save',
    get: 'drafts.get',
    publish: 'drafts.publish',
    discard: 'drafts.discard',
  },
  views: {
    list: 'views.list',
    create: 'views.create',
    reorder: 'views.reorder',
    update: 'views.update',
    delete: 'views.delete',
  },
  seeds: {
    list: 'seeds.list',
    get: 'seeds.get',
    plan: 'seeds.plan',
    apply: 'seeds.apply',
    ftsRebuild: 'seeds.ftsRebuild',
    orphansList: 'seeds.orphansList',
    purgeStatus: 'seeds.purgeStatus',
    delete: 'seeds.delete',
    hardDelete: 'seeds.hardDelete',
    branchDrop: 'seeds.branchDrop',
    branchRename: 'seeds.branchRename',
    branchRetype: 'seeds.branchRetype',
    orphanDrop: 'seeds.orphanDrop',
  },
  schema: {
    snapshot: 'schema.snapshot',
    layoutUpdate: 'schema.layoutUpdate',
    layoutReset: 'schema.layoutReset',
  },
  layout: {
    get: 'layout.get',
    roles: 'layout.roles',
    update: 'layout.update',
    reset: 'layout.reset',
  },
  users: {
    list: 'users.list',
    get: 'users.get',
    assignments: 'users.assignments',
    setActive: 'users.setActive',
  },
  roles: {
    list: 'roles.list',
    create: 'roles.create',
    update: 'roles.update',
    delete: 'roles.delete',
  },
  assignments: {
    create: 'assignments.create',
    delete: 'assignments.delete',
  },
  invitations: {
    list: 'invitations.list',
    create: 'invitations.create',
    regenerate: 'invitations.regenerate',
    delete: 'invitations.delete',
  },
  settings: {
    get: 'settings.get',
    update: 'settings.update',
    me: 'settings.me',
    avatarUpdate: 'settings.avatarUpdate',
    sessionsList: 'settings.sessionsList',
    activity: 'settings.activity',
    storage: 'settings.storage',
    storageOrphansDelete: 'settings.storageOrphansDelete',
    notificationPrefsGet: 'settings.notificationPrefsGet',
    notificationPrefsUpdate: 'settings.notificationPrefsUpdate',
    uiPreferencesGet: 'settings.uiPreferencesGet',
    uiPreferencesUpdate: 'settings.uiPreferencesUpdate',
  },
  automations: {
    list: 'automations.list',
    get: 'automations.get',
    create: 'automations.create',
    update: 'automations.update',
    toggle: 'automations.toggle',
    delete: 'automations.delete',
  },
  stats: {
    mediaLibrary: 'stats.mediaLibrary',
    unusedMedia: 'stats.unusedMedia',
    setupChecklist: 'stats.setupChecklist',
    total: 'stats.total',
    recentActivity: 'stats.recentActivity',
    health: 'stats.health',
    cloudflare: 'stats.cloudflare',
    breakdown: 'stats.breakdown',
    storageSync: 'stats.storageSync',
  },
  widgets: {
    aggregate: 'widgets.aggregate',
    growth: 'widgets.growth',
    leaderboard: 'widgets.leaderboard',
    list: 'widgets.list',
    timeseries: 'widgets.timeseries',
    distribution: 'widgets.distribution',
  },
  search: {
    query: 'search.query',
  },
  notifications: {
    list: 'notifications.list',
    markRead: 'notifications.markRead',
    markUnread: 'notifications.markUnread',
    delete: 'notifications.delete',
    markAllRead: 'notifications.markAllRead',
  },
  media: {
    presign: 'media.presign',
    confirm: 'media.confirm',
    downloadUrl: 'media.downloadUrl',
    delete: 'media.delete',
  },
  intents: {
    list: 'intents.list',
    get: 'intents.get',
    reject: 'intents.reject',
    session: 'intents.session',
  },
} as const satisfies SdkOperationMap

/**
 * Operations the API refuses without an optimistic-concurrency precondition (428). Their SDK method takes
 * `{ ifMatch }` as its last argument and turns it into `If-Match` / `If-None-Match`. For a DELETE there is no
 * query argument: the options come first.
 */
export const PRECONDITION_OPERATIONS: ReadonlySet<string> = new Set(['layout.update', 'layout.reset'])

/** Agent operations deliberately without an SDK method, with the reason. Exactly these two. */
export const SDK_OMITTED_OPERATIONS: Readonly<Record<string, string>> = {
  'intents.approve': 'Scripts never approve their own intents; approval is a human dialog in the MCP server (ROADMAP §4.5).',
  'media.upload': 'Multipart upload streams bytes through the Worker; media.uploadFile uses presign + PUT + confirm.',
}
