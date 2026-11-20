// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/types
 * Every exported type of the `beech` script SDK and the hand-written {@link BeechSdk} interface.
 */

import type { AgentIntentPending, OperationMethod, OperationRisk, TransferFormat, FilterType } from '@beechcms/core'

/** Any JSON answer the SDK does not model; narrow it in the script. */
export type SdkJson = unknown
export type SdkBody = Record<string, unknown>
export type SdkQueryValue = string | number | boolean | null | readonly unknown[] | Record<string, unknown>
export type SdkQuery = Record<string, SdkQueryValue | undefined>

/** Structural stand-in for `beech types generate` output (`SeedRegistryTypes`). */
export type SeedRegistryShape = Record<string, Record<string, unknown>>
export type SeedSlug<TRegistry> = keyof TRegistry & string

/** Outcome of every non-read method. Discriminated by `kind`. */
export type WriteOutcome<T> =
  | { kind: 'executed'; status: number; data: T }
  | { kind: 'pending'; intent: AgentIntentPending }
  | { kind: 'dry-run'; call: SdkCallRecord }

export interface SdkCallRecord {
  operationId: string
  method: OperationMethod
  /** Path with query string, as sent (or as it would have been sent). */
  path: string
  /** Effective risk for this request (`resolveOperationRisk`). */
  risk: OperationRisk
  outcome: 'executed' | 'pending' | 'dry-run' | 'error'
  /** HTTP status; `null` for dry-run. */
  status: number | null
  /** Request body; present only on `dry-run` records. */
  body?: unknown
}

/** Everything a script did, in call order. `beech run` (sprint 07) prints it. */
export interface SdkJournal {
  readonly calls: readonly SdkCallRecord[]
  readonly pendingIntents: readonly AgentIntentPending[]
}

export interface SdkRequest { method: OperationMethod; path: string; body?: unknown }
export interface SdkTransport { send(request: SdkRequest): Promise<Response> }

/** Time source for polling; injected so tests never sleep. */
export interface SdkClock { now(): number; sleep(ms: number): Promise<void> }

export interface BeechSdkOptions {
  transport: SdkTransport
  /** Record non-read calls instead of sending them. Default false. */
  dryRun?: boolean
  /** Used only for the storage PUT of presigned uploads. Default `globalThis.fetch`. */
  fetch?: typeof fetch
  /** Default: `Date.now` + `setTimeout`. */
  clock?: SdkClock
}

type SystemKey = 'id' | 'slug' | 'status' | 'created_at' | 'updated_at'

export interface SdkEntry<TRow> {
  id: string
  slug: string | null
  status: string
  created_at: number | null
  updated_at: number | null
  deleted_at?: number | null
  has_pending_draft?: boolean
  data: Omit<TRow, SystemKey>
}

/** Create/update body: branch aliases plus the optional system fields the handlers read. */
export type EntryInput<TRow> = Partial<Omit<TRow, SystemKey>> & { slug?: string; status?: string }

export interface ContentFilterCondition { op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'is_empty' | 'is_not_empty'; value: string | number | boolean | null }
export interface ContentFilterGroup { columnId: string; type: FilterType; conditions: ContentFilterCondition[] }

export interface ContentListQuery {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  filters?: ContentFilterGroup[]
}
export interface ContentPage<TRow> { items: SdkEntry<TRow>[]; total: number; page: number; limit: number }
export interface TrashPage<TRow> extends ContentPage<TRow> { retentionDays: number }
export interface SdkProblem { status: number; type: string; detail: string }
/** `updated` is a count: `bulkUpdate` in the content repository returns a number, not ids. */
export interface BulkUpdateResult { updated: number; failed: { id: string; problem: SdkProblem }[] }
export interface BulkTrashResult { succeeded: string[]; failed: { id: string; problem: SdkProblem }[] }

export interface ImportJob {
  id: string
  targetSeed: string
  format: TransferFormat
  state: 'pending' | 'processing' | 'completed' | 'failed'
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: unknown[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

export interface ListAllOptions extends Omit<ContentListQuery, 'page' | 'limit'> {
  /** Refuse (throw `list_cap_exceeded`) when the seed holds more matching entries. Default 5000. */
  maxItems?: number
}
export interface UploadFileInput { filename: string; mimeType: string; data: Uint8Array }
export interface ImportFileInput { filename: string; format: TransferFormat; data: Uint8Array }
export interface WaitOptions { intervalMs?: number; timeoutMs?: number }

export interface ContentNamespace<R> {
  list<K extends SeedSlug<R>>(slug: K, query?: ContentListQuery): Promise<ContentPage<R[K]>>
  get<K extends SeedSlug<R>>(slug: K, id: string): Promise<SdkEntry<R[K]>>
  getBySlug<K extends SeedSlug<R>>(slug: K, entrySlug: string): Promise<SdkEntry<R[K]>>
  facets(slug: SeedSlug<R>, query?: SdkQuery): Promise<SdkJson>
  backrefs(targetSlug: SeedSlug<R>, targetId: string, query?: SdkQuery): Promise<SdkJson>
  create<K extends SeedSlug<R>>(slug: K, body: EntryInput<R[K]>): Promise<WriteOutcome<{ id: string }>>
  update<K extends SeedSlug<R>>(slug: K, id: string, body: EntryInput<R[K]>): Promise<WriteOutcome<{ success: true }>>
  bulkUpdate<K extends SeedSlug<R>>(slug: K, body: { ids: string[]; fields: Partial<Omit<R[K], SystemKey>> }): Promise<WriteOutcome<BulkUpdateResult>>
  delete(slug: SeedSlug<R>, id: string, query?: { purge?: 'true' }): Promise<WriteOutcome<{ success: true; softDeleted: boolean }>>
  kanbanMove(slug: SeedSlug<R>, id: string, body: SdkBody): Promise<WriteOutcome<SdkJson>>
  export(slug: SeedSlug<R>, query?: { format?: TransferFormat; safe?: boolean; search?: string; filters?: ContentFilterGroup[] }): Promise<string>
  import(slug: SeedSlug<R>, body: { objectKey: string; format: TransferFormat }): Promise<WriteOutcome<{ jobId: string }>>
  importStatus(jobId: string): Promise<ImportJob>
  // helpers
  listAll<K extends SeedSlug<R>>(slug: K, options?: ListAllOptions): Promise<SdkEntry<R[K]>[]>
  importFile(slug: SeedSlug<R>, input: ImportFileInput, wait?: WaitOptions): Promise<WriteOutcome<ImportJob>>
  waitForImport(jobId: string, options?: WaitOptions): Promise<ImportJob>
}

export interface TrashNamespace<R> {
  list<K extends SeedSlug<R>>(slug: K, query?: { page?: number; limit?: number }): Promise<TrashPage<R[K]>>
  restore(slug: SeedSlug<R>, id: string): Promise<WriteOutcome<{ success: true; slug: string | null }>>
  bulkRestore(slug: SeedSlug<R>, body: { ids: string[] }): Promise<WriteOutcome<BulkTrashResult>>
  bulkPurge(slug: SeedSlug<R>, body: { ids: string[] }): Promise<WriteOutcome<BulkTrashResult>>
  reconcile(slug: SeedSlug<R>, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface MediaNamespace {
  presign(body: { filename: string; mimeType: string; sizeBytes: number; purpose?: 'import' }): Promise<WriteOutcome<{ uploadUrl: string; key: string; expiresIn: number }>>
  confirm(body: { key: string }): Promise<WriteOutcome<{ url: string }>>
  downloadUrl(key: string): Promise<SdkJson>
  delete(key: string): Promise<WriteOutcome<SdkJson>>
  // helper
  uploadFile(input: UploadFileInput): Promise<WriteOutcome<{ key: string; url: string }>>
}

export interface IntentsNamespace {
  list(): Promise<SdkJson>
  get(id: string): Promise<SdkJson>
  reject(id: string): Promise<WriteOutcome<SdkJson>>
}

export interface DraftsNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  save(slug: string, id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  get(slug: string, id: string, query?: SdkQuery): Promise<SdkJson>
  publish(slug: string, id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  discard(slug: string, id: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface ViewsNamespace {
  list(slug: string, query?: SdkQuery): Promise<SdkJson>
  create(slug: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  reorder(slug: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  update(slug: string, viewId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(slug: string, viewId: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface SeedsNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  get(slug: string, query?: SdkQuery): Promise<SdkJson>
  plan(slug: string, body?: SdkBody): Promise<SdkJson>
  apply(slug: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  ftsRebuild(slug: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  orphansList(slug: string, query?: SdkQuery): Promise<SdkJson>
  purgeStatus(id: string, query?: SdkQuery): Promise<SdkJson>
  delete(slug: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
  hardDelete(slug: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
  branchDrop(slug: string, branchId: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
  branchRename(slug: string, branchId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  branchRetype(slug: string, branchId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  orphanDrop(slug: string, column: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface SchemaNamespace {
  snapshot(query?: SdkQuery): Promise<SdkJson>
  layoutUpdate(slug: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  layoutReset(slug: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface LayoutNamespace {
  get(query?: SdkQuery): Promise<SdkJson>
  roles(query?: SdkQuery): Promise<SdkJson>
  update(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  reset(query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface UsersNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  get(userId: string, query?: SdkQuery): Promise<SdkJson>
  assignments(userId: string, query?: SdkQuery): Promise<SdkJson>
  setActive(userId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface RolesNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  create(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  update(roleId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(roleId: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface AssignmentsNamespace {
  create(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(assignmentId: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface InvitationsNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  create(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  regenerate(invitationId: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(invitationId: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface SettingsNamespace {
  get(query?: SdkQuery): Promise<SdkJson>
  update(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  me(query?: SdkQuery): Promise<SdkJson>
  avatarUpdate(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  sessionsList(query?: SdkQuery): Promise<SdkJson>
  activity(query?: SdkQuery): Promise<SdkJson>
  storage(query?: SdkQuery): Promise<SdkJson>
  storageOrphansDelete(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  notificationPrefsGet(query?: SdkQuery): Promise<SdkJson>
  notificationPrefsUpdate(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  uiPreferencesGet(query?: SdkQuery): Promise<SdkJson>
  uiPreferencesUpdate(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface AutomationsNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  get(id: string, query?: SdkQuery): Promise<SdkJson>
  create(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  update(id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  toggle(id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(id: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
}

export interface StatsNamespace {
  mediaLibrary(query?: SdkQuery): Promise<SdkJson>
  unusedMedia(query?: SdkQuery): Promise<SdkJson>
  setupChecklist(query?: SdkQuery): Promise<SdkJson>
  total(query?: SdkQuery): Promise<SdkJson>
  recentActivity(query?: SdkQuery): Promise<SdkJson>
  health(query?: SdkQuery): Promise<SdkJson>
  cloudflare(query?: SdkQuery): Promise<SdkJson>
  breakdown(query?: SdkQuery): Promise<SdkJson>
  storageSync(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface WidgetsNamespace {
  aggregate(seed: string, query?: SdkQuery): Promise<SdkJson>
  growth(seed: string, query?: SdkQuery): Promise<SdkJson>
  leaderboard(seed: string, query?: SdkQuery): Promise<SdkJson>
  list(seed: string, query?: SdkQuery): Promise<SdkJson>
  timeseries(seed: string, query?: SdkQuery): Promise<SdkJson>
  distribution(seed: string, query?: SdkQuery): Promise<SdkJson>
}

export interface SearchNamespace {
  query(query?: SdkQuery): Promise<SdkJson>
}

export interface NotificationsNamespace {
  list(query?: SdkQuery): Promise<SdkJson>
  markRead(id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  markUnread(id: string, body?: SdkBody): Promise<WriteOutcome<SdkJson>>
  delete(id: string, query?: SdkQuery): Promise<WriteOutcome<SdkJson>>
  markAllRead(body?: SdkBody): Promise<WriteOutcome<SdkJson>>
}

export interface BeechSdk<R = SeedRegistryShape> {
  content: ContentNamespace<R>; trash: TrashNamespace<R>; drafts: DraftsNamespace; views: ViewsNamespace
  seeds: SeedsNamespace; schema: SchemaNamespace; layout: LayoutNamespace
  users: UsersNamespace; roles: RolesNamespace; assignments: AssignmentsNamespace; invitations: InvitationsNamespace
  settings: SettingsNamespace; automations: AutomationsNamespace
  stats: StatsNamespace; widgets: WidgetsNamespace; search: SearchNamespace; notifications: NotificationsNamespace
  media: MediaNamespace; intents: IntentsNamespace
}
