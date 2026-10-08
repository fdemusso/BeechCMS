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
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, VECTOR_COMPILE_PAGE_SIZE } from '../constants'
import { normaliseEmbeddingResponse } from '../utils/embedding-response'
import type { IndexManifest } from '@beechcms/search-client'

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

// ─── R2 manifest compilation ──────────────────────────────────────────────────

/**
 * Returns the R2 object key holding the `IndexManifest` JSON for a seed slug.
 * Consumed by the public `/search/index/:seedSlug/manifest.json` route.
 */
export function manifestKey(seedSlug: string): string {
  return `${seedSlug}/manifest.json`
}

/**
 * Returns the R2 object key holding the concatenated vector buffer for a seed slug.
 * Consumed by the public `/search/index/:seedSlug/vectors.bin` route.
 */
export function vectorsKey(seedSlug: string): string {
  return `${seedSlug}/vectors.bin`
}

/**
 * Derives a stable fingerprint for an `IndexManifest` from its ordered records
 * AND the vector bytes, so `SearchClient` can cache-bust the paired vectors file
 * whenever the index content changes (see `fetchWithCache` in `@beechcms/search-client`)
 * — including a re-embedding that leaves every record's `id`/`title` unchanged but
 * changes the vector itself.
 *
 * The two parts are hashed separately and the digests combined, so the (large) vector
 * buffer is never copied just to be hashed.
 */
async function computeFingerprint(
  records:     { id: string; title: string }[],
  vectorBytes: Uint8Array,
): Promise<string> {
  const textDigest   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(records.map((r) => `${r.id}:${r.title}`).join('|')))
  const vectorDigest = await crypto.subtle.digest('SHA-256', vectorBytes)
  const combined     = new Uint8Array(textDigest.byteLength + vectorDigest.byteLength)
  combined.set(new Uint8Array(textDigest), 0)
  combined.set(new Uint8Array(vectorDigest), textDigest.byteLength)
  const digest = await crypto.subtle.digest('SHA-256', combined)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Reads every stored vector of a seed in `entry_id` pages into ONE preallocated buffer, so peak
 * memory is the final buffer plus a single page instead of all rows plus a copy of them.
 */
async function readVectorSnapshot(
  seed:     Seed,
  db:       D1Database,
  pageSize: number,
): Promise<{ records: { id: string; title: string }[]; vectorBytes: Uint8Array }> {
  const vectorRepository = new D1VectorRepository(db)
  const records: { id: string; title: string }[] = []

  let floats = new Float32Array((await vectorRepository.countVectors(seed)) * EMBEDDING_DIMENSIONS)
  let usedFloats = 0
  let cursor: string | null = null

  for (;;) {
    const page = await vectorRepository.getVectorPage(seed, cursor, pageSize)
    for (const storedVector of page) {
      // Rows written after the COUNT can outgrow the buffer.
      if (usedFloats + storedVector.vector.length > floats.length) {
        const grown = new Float32Array(Math.max(floats.length * 2, usedFloats + storedVector.vector.length))
        grown.set(floats.subarray(0, usedFloats))
        floats = grown
      }
      floats.set(storedVector.vector, usedFloats)
      usedFloats += storedVector.vector.length
      records.push({ id: storedVector.entryId, title: storedVector.title })
    }
    if (page.length < pageSize) break
    cursor = page[page.length - 1]!.entryId
  }

  const used = floats.subarray(0, usedFloats)
  return { records, vectorBytes: new Uint8Array(used.buffer, used.byteOffset, used.byteLength) }
}

/** Compile attempts before giving up so the queue retries the whole job. */
const MAX_COMPILE_ATTEMPTS = 5

/** Precondition "the object is still the one I saw" (or "still absent"), for a conditional R2 write. */
function unchangedSince(head: R2Object | null): R2Conditional {
  return head ? { etagMatches: head.etag } : { etagDoesNotMatch: '*' }
}

/** Tuning knobs for {@link compileR2Manifest}. */
export interface CompileR2ManifestOptions {
  /** Max vector rows read from D1 per query. Defaults to {@link VECTOR_COMPILE_PAGE_SIZE}. */
  pageSize?: number
}

/**
 * Compiles all stored vectors for a seed into a binary vector file and a
 * companion `IndexManifest` JSON file, and writes both to the `SEARCH_R2`
 * bucket at {@link manifestKey} / {@link vectorsKey}.
 *
 * The manifest conforms to `IndexManifest` from `@beechcms/search-client`
 * (`model`, `dimensions`, `fingerprint`, `records`), so `SearchClient.loadIndex()`
 * can consume it directly.
 *
 * These files are consumed by the client-side semantic search runtime to perform
 * in-memory cosine-similarity ranking without a Vectorize index.
 *
 * Concurrent compiles of one seed are safe: each snapshot is written only if the R2 objects
 * are unchanged since just before it was read. A job that lost the race re-reads D1 and
 * retries, so a slower job can never replace a newer index with an older snapshot.
 *
 * When `searchR2` is `undefined` (e.g. in local development without an R2
 * binding), the function returns immediately without writing anything.
 *
 * @param seed     - Seed whose vectors should be compiled.
 * @param db       - D1 database instance used to load stored vectors.
 * @param searchR2 - R2 bucket to write the manifest files to, or `undefined` to skip.
 * @param options  - See {@link CompileR2ManifestOptions}.
 * @throws When every attempt lost the race against another compile.
 */
export async function compileR2Manifest(
  seed:      Seed,
  db:        D1Database,
  searchR2?: R2Bucket,
  options:   CompileR2ManifestOptions = {},
): Promise<void> {
  if (!searchR2) return

  const pageSize     = options.pageSize ?? VECTOR_COMPILE_PAGE_SIZE
  const vectorsPath  = vectorsKey(seed.slug)
  const manifestPath = manifestKey(seed.slug)

  for (let attempt = 0; attempt < MAX_COMPILE_ATTEMPTS; attempt++) {
    // Head BEFORE the D1 read: any write that lands after this point invalidates the preconditions.
    const [vectorsHead, manifestHead] = await Promise.all([searchR2.head(vectorsPath), searchR2.head(manifestPath)])

    const { records, vectorBytes } = await readVectorSnapshot(seed, db, pageSize)
    const fingerprint = await computeFingerprint(records, vectorBytes)

    const manifest: IndexManifest = {
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      fingerprint,
      records,
    }

    const vectorsWritten = await searchR2.put(vectorsPath, vectorBytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
      // Lets serveIndexHandler answer If-None-Match against the manifest's own
      // fingerprint — the R2 httpEtag is a hash of these bytes, not comparable
      // to the fingerprint SearchClient.fetchWithCache sends.
      customMetadata: { fingerprint },
      onlyIf: unchangedSince(vectorsHead),
    })
    if (!vectorsWritten) continue

    const manifestWritten = await searchR2.put(manifestPath, JSON.stringify(manifest), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: unchangedSince(manifestHead),
    })
    if (manifestWritten) return
  }

  throw new Error(`[semantic-search] R2 index for "${seed.slug}" kept changing under concurrent compiles — retrying job`)
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
