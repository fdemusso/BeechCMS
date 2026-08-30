// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/semantic-search.worker
 * Background job handlers for semantic (vector) search indexing.
 *
 * Jobs are dispatched by {@link semanticSearchHooks} via the queue service
 * and consumed by the Cloudflare Queue worker export.
 *
 * Exported jobs:
 * - {@link computeVectorJob}    – Generate an embedding and persist it to D1, then compile R2.
 * - {@link updateR2ManifestJob} – Recompile R2 binary manifest without touching embeddings.
 *
 * Exported registry:
 * - {@link semanticSearchJobs}  – `JobRegistry` map passed to `BeechConfig.jobs`.
 */

/// <reference types="@cloudflare/workers-types" />
import type { JobHandler, JobRegistry, Seed, JobContext } from '@beechcms/core'
import { extractIndexableText, indexableSearchBranches } from '@beechcms/core'
import { D1SeedRepository } from '../../../shared/db/repositories/seed.repository.d1'
import { D1VectorRepository } from '../../../shared/db/repositories/d1-vector.repository'
import { EMBEDDING_MODEL } from '../constants'

// ─── Job payload types ────────────────────────────────────────────────────────

/**
 * Payload for the `compute_vector` job.
 * Enqueued by {@link semanticSearchHooks.afterCreate} and {@link semanticSearchHooks.afterUpdate}.
 */
export interface ComputeVectorPayload {
  /** Slug of the seed (content type) the entry belongs to. */
  seedSlug: string
  /** Unique identifier of the entry whose embedding should be computed. */
  entryId: string
}

/**
 * Payload for the `update_r2_manifest` job.
 * Enqueued by {@link semanticSearchHooks.afterUpdate} and {@link semanticSearchHooks.afterDelete}.
 */
export interface UpdateR2ManifestPayload {
  /** Slug of the seed whose R2 manifest files should be recompiled. */
  seedSlug: string
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extracts the typed Cloudflare Worker bindings from a {@link JobContext}.
 *
 * The `JobContext.env` is typed as `unknown` to remain framework-agnostic in
 * `packages/core`; this helper applies a safe cast in one place so job
 * handlers do not scatter `as any` throughout their bodies.
 */
function resolveWorkerBindings(context: JobContext): {
  db:       D1Database | undefined
  ai:       Ai | undefined
  searchR2: R2Bucket  | undefined
} {
  const env = context.env as Record<string, unknown>
  return {
    db:       env['DB']        as D1Database | undefined,
    ai:       env['AI']        as Ai         | undefined,
    searchR2: env['SEARCH_R2'] as R2Bucket   | undefined,
  }
}

/**
 * Normalises the heterogeneous response shapes returned by the Workers AI
 * embedding model into a single `Float32Array`.
 *
 * The model may return any of:
 * - A raw `Float32Array`
 * - An object `{ data: number[] | number[][] | Float32Array }`
 * - A plain `number[]`
 *
 * @param aiResponse - Raw value returned by `ai.run(EMBEDDING_MODEL, ...)`.
 * @returns A `Float32Array` containing the embedding vector.
 * @throws `Error` when the response shape is unrecognised.
 */
function normaliseEmbeddingResponse(aiResponse: unknown): Float32Array {
  if (aiResponse instanceof Float32Array) {
    return aiResponse
  }

  if (Array.isArray((aiResponse as any)?.data)) {
    const dataField = (aiResponse as any).data as unknown[]
    const vectorData = Array.isArray(dataField[0])
      ? (dataField[0] as number[])
      : (dataField as number[])
    return new Float32Array(vectorData)
  }

  if (Array.isArray(aiResponse)) {
    return new Float32Array(aiResponse as number[])
  }

  if ((aiResponse as any)?.data instanceof Float32Array) {
    return (aiResponse as any).data as Float32Array
  }

  throw new Error('[semantic-search] Unexpected AI response shape from embedding model')
}

// ─── R2 manifest compilation ──────────────────────────────────────────────────

/**
 * Compiles all stored vectors for a seed into binary and JSON manifest files
 * and writes them to the `SEARCH_R2` bucket.
 *
 * The two files produced per seed are:
 * - `{slug}.bin`  – Concatenated `Float32Array` buffers in entry-index order.
 * - `{slug}.json` – JSON array of entry IDs in the same order as the binary file.
 *
 * These files are consumed by the client-side semantic search runtime to perform
 * in-memory cosine-similarity ranking without a Vectorize index.
 *
 * When `searchR2` is `undefined` (e.g. in local development without an R2
 * binding), the function returns immediately without writing anything.
 *
 * @param seed     - Seed whose vectors should be compiled.
 * @param db       - D1 database instance used to load stored vectors.
 * @param searchR2 - R2 bucket to write the manifest files to, or `undefined` to skip.
 */
export async function compileR2Manifest(
  seed:      Seed,
  db:        D1Database,
  searchR2?: R2Bucket,
): Promise<void> {
  if (!searchR2) return

  const vectorRepository = new D1VectorRepository(db)
  const storedVectors    = await vectorRepository.getAllVectors(seed)

  // Build the JSON manifest: ordered list of entry IDs
  const entryIdManifest = JSON.stringify(storedVectors.map((v) => v.entryId))

  // Build the binary manifest: concatenated Float32Array buffers
  const totalFloatCount   = storedVectors.reduce((sum, v) => sum + v.vector.length, 0)
  const concatenatedFloats = new Float32Array(totalFloatCount)
  let writeOffset = 0
  for (const storedVector of storedVectors) {
    concatenatedFloats.set(storedVector.vector, writeOffset)
    writeOffset += storedVector.vector.length
  }
  const binaryManifest = new Uint8Array(
    concatenatedFloats.buffer,
    concatenatedFloats.byteOffset,
    concatenatedFloats.byteLength,
  )

  await Promise.all([
    searchR2.put(`${seed.slug}.bin`, binaryManifest, {
      httpMetadata: { contentType: 'application/octet-stream' },
    }),
    searchR2.put(`${seed.slug}.json`, entryIdManifest, {
      httpMetadata: { contentType: 'application/json' },
    }),
  ])
}

// ─── Job handlers ─────────────────────────────────────────────────────────────

/**
 * Worker job that generates the embedding vector for a content entry,
 * persists it to D1, and recompiles the R2 manifest files.
 *
 * The job is a no-op (with a warning log) when:
 * - The `DB` binding is missing.
 * - The seed cannot be found.
 * - The seed has no indexable branches.
 * - The entry does not exist or is not published — in which case any
 *   existing vector is deleted and the manifest is recompiled.
 * - The entry has no indexable text content.
 * - The `AI` binding is missing.
 *
 * @param payload - `{ seedSlug, entryId }` identifying the entry to vectorise.
 * @param context - Job execution context providing repository and env bindings.
 */
export const computeVectorJob: JobHandler<ComputeVectorPayload> = async (
  payload,
  context,
): Promise<void> => {
  const { db, ai, searchR2 } = resolveWorkerBindings(context)

  if (!db) {
    console.warn('[semantic-search] DB binding not found — skipping compute_vector job')
    return
  }

  const seedRepository = new D1SeedRepository(db)
  const seedRecord     = await seedRepository.get(payload.seedSlug)
  const seed           = seedRecord?.definition

  if (!seed) {
    console.warn(`[semantic-search] Seed "${payload.seedSlug}" not found — skipping compute_vector job`)
    return
  }

  const indexableBranches = indexableSearchBranches(seed)
  if (indexableBranches.length === 0) return

  const vectorRepository = new D1VectorRepository(db)

  let contentEntry: Record<string, unknown> | null = null
  try {
    contentEntry = await context.repository.findById(seed, payload.entryId)
  } catch {
    contentEntry = null
  }

  if (!contentEntry || contentEntry['status'] !== 'published') {
    await vectorRepository.deleteVector(seed, payload.entryId)
    await compileR2Manifest(seed, db, searchR2)
    return
  }

  const indexableText = extractIndexableText(seed, contentEntry)
  if (!indexableText) {
    await vectorRepository.deleteVector(seed, payload.entryId)
    await compileR2Manifest(seed, db, searchR2)
    return
  }

  if (!ai) {
    console.warn('[semantic-search] AI binding not found — skipping embedding generation')
    return
  }

  const aiResponse      = await ai.run(EMBEDDING_MODEL, { text: indexableText })
  const embeddingVector = normaliseEmbeddingResponse(aiResponse)

  await vectorRepository.saveVector(seed, payload.entryId, embeddingVector)
  await compileR2Manifest(seed, db, searchR2)
}

/**
 * Worker job that removes an embedding vector from D1 for a specific entry
 * and recompiles the R2 binary and JSON manifest files.
 *
 * Enqueued when an entry is unpublished or deleted.
 *
 * @param payload - `{ seedSlug, entryId }` identifying the entry whose vector should be removed.
 * @param context - Job execution context providing env bindings.
 */
export const deleteVectorJob: JobHandler<ComputeVectorPayload> = async (
  payload,
  context,
): Promise<void> => {
  const { db, searchR2 } = resolveWorkerBindings(context)

  if (!db) {
    console.warn('[semantic-search] DB binding not found — skipping delete_vector job')
    return
  }

  const seedRepository = new D1SeedRepository(db)
  const seedRecord     = await seedRepository.get(payload.seedSlug)
  const seed           = seedRecord?.definition

  if (!seed) {
    console.warn(`[semantic-search] Seed "${payload.seedSlug}" not found — skipping delete_vector job`)
    return
  }

  const vectorRepository = new D1VectorRepository(db)
  await vectorRepository.deleteVector(seed, payload.entryId)
  await compileR2Manifest(seed, db, searchR2)
}

/**
 * Worker job that recompiles the R2 binary and JSON manifest files for a seed
 * without touching the stored embedding vectors.
 *
 * Enqueued after a vector is deleted (entry unpublished or deleted) to keep
 * the R2 manifests consistent with the D1 vector store.
 *
 * @param payload - `{ seedSlug }` identifying the seed to recompile.
 * @param context - Job execution context providing env bindings.
 */
export const updateR2ManifestJob: JobHandler<UpdateR2ManifestPayload> = async (
  payload,
  context,
): Promise<void> => {
  const { db, searchR2 } = resolveWorkerBindings(context)

  if (!db) return

  const seedRepository = new D1SeedRepository(db)
  const seedRecord     = await seedRepository.get(payload.seedSlug)
  const seed           = seedRecord?.definition

  if (!seed) return

  await compileR2Manifest(seed, db, searchR2)
}

// ─── Job registry ─────────────────────────────────────────────────────────────

/**
 * Job registry for semantic search background jobs.
 * Pass this to `BeechConfig.jobs` (or merge it with other job registries)
 * to enable semantic indexing in your deployment.
 *
 * @example
 * ```ts
 * createBeechApp({ jobs: semanticSearchJobs, ... })
 * ```
 */
export const semanticSearchJobs: JobRegistry = {
  compute_vector:     computeVectorJob,
  delete_vector:      deleteVectorJob,
  update_r2_manifest: updateR2ManifestJob,
}
