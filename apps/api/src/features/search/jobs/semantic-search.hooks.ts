// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/semantic-search.hooks
 * Lifecycle hooks that keep the semantic search index in sync with content changes.
 *
 * Each hook is registered on the `BeechHooks` object consumed by the content
 * repository. Hooks use the queue service to dispatch async jobs so they
 * never block the HTTP response.
 *
 * Job names match the keys registered in {@link semanticSearchJobs}:
 * - `compute_vector`    – generate/refresh the embedding for a published entry.
 * - `update_r2_manifest` – recompile the R2 binary manifest after a deletion.
 */

/// <reference types="@cloudflare/workers-types" />
import type { BeechHooks, HookContext } from '@beechcms/core'
import { indexableSearchBranches } from '@beechcms/core'
import { D1VectorRepository } from '../../../shared/db/repositories/d1-vector.repository'

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns `true` when the seed associated with `ctx` has at least one branch
 * configured for semantic indexing.
 *
 * @param ctx - Hook execution context carrying the current seed definition.
 */
function seedHasIndexableBranches(ctx: HookContext): boolean {
  return indexableSearchBranches(ctx.seed).length > 0
}

/**
 * Enqueues a `compute_vector` job to generate or refresh the embedding for
 * a specific entry.
 *
 * @param entryId - Unique identifier of the entry to vectorise.
 * @param ctx     - Hook execution context providing the queue service.
 */
async function enqueueComputeVector(entryId: string, ctx: HookContext): Promise<void> {
  await ctx.queue?.enqueue('compute_vector', {
    seedSlug: ctx.seed.slug,
    entryId,
  })
}

/**
 * Enqueues an `update_r2_manifest` job to recompile the R2 binary manifest
 * after a vector has been removed.
 *
 * @param ctx - Hook execution context providing the queue service.
 */
async function enqueueUpdateR2Manifest(ctx: HookContext): Promise<void> {
  await ctx.queue?.enqueue('update_r2_manifest', {
    seedSlug: ctx.seed.slug,
  })
}

/**
 * Removes the vector for `entryId` from D1 and enqueues an R2 manifest update.
 * Used when an entry is deleted or unpublished.
 *
 * @param entryId - Unique identifier of the entry whose vector should be deleted.
 * @param ctx     - Hook execution context providing the D1 database and queue service.
 */
async function deleteVectorAndRecompileManifest(entryId: string, ctx: HookContext): Promise<void> {
  if (ctx.db) {
    const vectorRepository = new D1VectorRepository(ctx.db as D1Database)
    await vectorRepository.deleteVector(ctx.seed, entryId)
  }
  await enqueueUpdateR2Manifest(ctx)
}

// ─── Hook definitions ─────────────────────────────────────────────────────────

/**
 * Lifecycle hooks that maintain the semantic search vector index.
 *
 * Registered via `BeechConfig.hooks` in the application factory. All async
 * side-effects are dispatched through the queue so they never block the
 * HTTP response path.
 */
export const semanticSearchHooks: BeechHooks = {
  /**
   * After a new entry is created, enqueue vector computation when:
   * 1. The seed has at least one indexable branch.
   * 2. The entry is immediately published.
   *
   * Draft entries are skipped — their vector will be computed when they
   * are published via {@link afterUpdate}.
   *
   * @param entry - Newly created content entry.
   * @param ctx   - Hook execution context.
   */
  afterCreate: async (entry: Record<string, any>, ctx: HookContext): Promise<void> => {
    if (!seedHasIndexableBranches(ctx)) return
    if (entry.status === 'published') {
      await enqueueComputeVector(entry.id as string, ctx)
    }
  },

  /**
   * After an entry is updated, synchronise the vector index based on the
   * new publication status:
   *
   * - **`published`**: Enqueue vector computation (create or refresh).
   * - **Any other status** (e.g. `draft`, `archived`): Delete the existing
   *   vector and recompile the R2 manifest.
   * - **`status` absent** (partial update): Enqueue vector computation only
   *   when an indexable branch field is present in the updated payload.
   *
   * @param entry - Partial or full updated content entry.
   * @param ctx   - Hook execution context.
   */
  afterUpdate: async (entry: Record<string, any>, ctx: HookContext): Promise<void> => {
    if (!seedHasIndexableBranches(ctx)) return

    if (entry.status === 'published') {
      await enqueueComputeVector(entry.id as string, ctx)
      return
    }

    if (entry.status !== undefined) {
      // Entry was explicitly unpublished (e.g. moved to draft or archived)
      await deleteVectorAndRecompileManifest(entry.id as string, ctx)
      return
    }

    // Partial update with no status change — re-index only if an indexable field changed
    const indexableBranches = indexableSearchBranches(ctx.seed)
    const hasIndexableFieldChanged = indexableBranches.some((branch) =>
      Object.hasOwn(entry, branch.alias),
    )
    if (hasIndexableFieldChanged) {
      await enqueueComputeVector(entry.id as string, ctx)
    }
  },

  /**
   * After an entry is deleted, remove its vector from D1 and recompile
   * the R2 manifest so the deleted entry is no longer returned by
   * semantic search queries.
   *
   * @param entryId - Unique identifier of the deleted entry.
   * @param ctx     - Hook execution context.
   */
  afterDelete: async (entryId: string, ctx: HookContext): Promise<void> => {
    if (!seedHasIndexableBranches(ctx)) return
    await deleteVectorAndRecompileManifest(entryId, ctx)
  },
}
