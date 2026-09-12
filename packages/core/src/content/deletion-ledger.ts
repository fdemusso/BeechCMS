// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * The GDPR erasure record. It lives OUTSIDE D1 on purpose: a D1 Time Travel restore rewinds
 * every table it wrote, including any local ledger, which would defeat the one guarantee this
 * record exists to give — that an erasure stays erased.
 */
export interface DeletionLedgerEvent {
  /** Seed slug the purged entry belonged to. */
  seedSlug: string
  /** Entry id, the reconciliation key against a restored `content_{slug}` row. */
  entryId: string
  /** Entry slug at purge time. Diagnostic only; `entryId` is the identity. */
  entrySlug: string | null
  /** Unix seconds (`IClock`), never `Date.now()`. */
  purgedAt: number
  /** Who ordered the purge. `null` for a system/reconciliation purge. */
  actorId: string | null
  /** 'purge' = operator action; 'reconcile' = re-applied after a restore. */
  reason: 'purge' | 'reconcile'
}

/**
 * Append-only erasure log. `append` must be durable before the caller reports success:
 * a purge whose event was lost is a purge that a restore can silently undo.
 */
export interface IDeletionLedger {
  /** Records one erasure. Throws if the write did not land. */
  append(event: DeletionLedgerEvent): Promise<void>
  /**
   * Streams recorded erasures for one seed, newest-first is NOT guaranteed.
   * `cursor` is opaque and comes from the previous page's `nextCursor`.
   */
  list(seedSlug: string, options?: { limit?: number; cursor?: string }): Promise<{
    events: DeletionLedgerEvent[]
    nextCursor?: string
  }>
}
