// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  CsvRowReader,
  EntryNotFoundError,
  LineReader,
  SlugConflictError,
  fromCsvCells,
  parseNdjsonLine,
  resolveClassification,
  slugify,
  toImportPayload,
  validateAndSanitizeSeedPayload,
  type JobContext,
  type JobHandler,
  type JobRegistry,
  type Seed,
} from '@beechcms/core'
import { D1SeedRepository } from '../../../shared/db/repositories/seed.repository.d1'
import {
  CONTENT_IMPORT_CHUNK_JOB,
  IMPORT_JOBS_SLUG,
  IMPORT_JOB_FIELDS,
  appendErrorSamples,
  isTerminalState,
  readImportJobRecord,
  resolveImportChunkRows,
  type ImportChunkPayload,
  type ImportJobRecord,
  type ImportRowError,
} from '../import-job'

const f = IMPORT_JOB_FIELDS

/** Best-effort R2 cleanup. A failed delete must never resurrect a finished job. */
async function deleteObjectSafely(context: JobContext, objectKey: string): Promise<void> {
  try {
    await context.bucket.delete(objectKey)
  } catch (error) {
    console.error(`[content-import] failed to delete R2 object "${objectKey}":`, error)
  }
}

/** Terminates a job before the row loop ever ran (missing seed, object, or unsupported branch). */
async function failBeforeLoop(
  context: JobContext,
  jobSeed: Seed,
  job: ImportJobRecord,
  error: ImportRowError,
): Promise<void> {
  await context.repository.update(jobSeed, job.id, {
    [f.state]: 'failed',
    [f.finishedAt]: context.clock.nowSeconds(),
    [f.errorReport]: appendErrorSamples(job.errors, [error]),
  })
  await deleteObjectSafely(context, job.objectKey)
}

export const contentImportChunkJob: JobHandler<ImportChunkPayload> = async (payload, context) => {
  const db = (context.env as Record<string, unknown>)['DB'] as D1Database | undefined
  if (!db) {
    console.warn('[content-import] DB binding not found — skipping content_import_chunk job')
    return
  }

  const seedRepository = new D1SeedRepository(db)
  const jobSeed = (await seedRepository.get(IMPORT_JOBS_SLUG))?.definition
  if (!jobSeed) {
    console.warn('[content-import] import_jobs seed not found — skipping content_import_chunk job')
    return
  }

  let job: ImportJobRecord
  try {
    job = await readImportJobRecord(context.repository, jobSeed, payload.jobId)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      console.warn(`[content-import] job "${payload.jobId}" not found — skipping (deleted mid-import)`)
      return
    }
    throw error
  }

  // At-least-once delivery: a re-delivered message for a finished job is a no-op,
  // never a second R2 delete.
  if (isTerminalState(job.state)) return

  const targetSeedRecord = (await seedRepository.get(job.targetSeed))?.definition
  if (!targetSeedRecord) {
    await failBeforeLoop(context, jobSeed, job, {
      row: 0,
      code: 'seed_not_found',
      message: `Target seed "${job.targetSeed}" no longer exists`,
    })
    return
  }
  // Re-bound with an explicit `Seed` type: the nested `processRecord` closure below
  // captures this by reference, and TS does not carry a narrowed `Seed | undefined`
  // across a closure boundary — only a variable's declared type.
  const targetSeed: Seed = targetSeedRecord

  // A JobContext carries no privacyService (queue.interface.ts), so a branch requiring
  // encryption or hashing cannot be written correctly from here — refuse up front rather
  // than silently writing plaintext into a column the schema says must be protected.
  const unsupportedBranch = targetSeed.branches.find((branch) => {
    const storage = resolveClassification(branch).storage
    return storage === 'encrypt' || storage === 'hash'
  })
  if (unsupportedBranch) {
    await failBeforeLoop(context, jobSeed, job, {
      row: 0,
      code: 'privacy_policy_unsupported',
      field: unsupportedBranch.alias,
      message: `Branch "${unsupportedBranch.alias}" requires a privacy service bulk import cannot provide`,
    })
    return
  }

  const object = await context.bucket.get(job.objectKey)
  if (!object) {
    await failBeforeLoop(context, jobSeed, job, {
      row: 0,
      code: 'object_missing',
      message: `R2 object "${job.objectKey}" not found`,
    })
    return
  }

  const bodyStream = object.body instanceof ReadableStream ? object.body : new Blob([object.body]).stream()
  const chunkRowLimit = resolveImportChunkRows(context.env)

  let seen = 0
  let processed = 0
  let inserted = 0
  let failed = 0
  const newErrors: ImportRowError[] = []

  /**
   * Decodes and (best-effort) inserts one data record. Never throws: a bad row is a value
   * recorded in `newErrors`, not an aborted chunk (brief §2 — best-effort, not atomic).
   */
  async function processRecord(rowNumber: number, parseResult: { ok: true; record: Record<string, unknown> } | { ok: false; code: string; message: string }) {
    if (!parseResult.ok) {
      newErrors.push({ row: rowNumber, code: parseResult.code, message: parseResult.message })
      failed++
      return
    }

    try {
      const { slug: rawSlug, status, data } = toImportPayload(parseResult.record)
      const validation = validateAndSanitizeSeedPayload(targetSeed, data, {
        operation: 'create',
        allowNull: false,
        requireAtLeastOneValidField: true,
        enforceRequiredFields: true,
        idGenerator: context.idGenerator,
      })

      if (validation.dangerousFields.length > 0) {
        const field = validation.dangerousFields[0]
        newErrors.push({ row: rowNumber, code: 'dangerous_content', field, message: `Dangerous content detected in field "${field}"` })
        failed++
        return
      }
      if (validation.details.length > 0) {
        const detail = validation.details[0]
        newErrors.push({ row: rowNumber, code: 'validation_failed', field: detail.field, message: detail.message })
        failed++
        return
      }

      const id = context.idGenerator.uuid()
      const entrySlug = rawSlug
        ? slugify(rawSlug)
        : slugify(String(validation.data[targetSeed.displayNameAlias] ?? id))

      // toImportPayload already drops id/created_at/updated_at/deleted_at (brief §2), so this
      // is always an insert — never an overwrite of an existing entry.
      await context.repository.create(targetSeed, id, entrySlug, status ?? 'draft', validation.data)
      inserted++
    } catch (error) {
      if (error instanceof SlugConflictError) {
        newErrors.push({ row: rowNumber, code: 'duplicate_slug', message: error.message })
      } else {
        newErrors.push({ row: rowNumber, code: 'insert_failed', message: error instanceof Error ? error.message : String(error) })
      }
      failed++
    }
  }

  /**
   * Reads `bodyStream` to EOF or until `handle` reports the chunk row limit was reached,
   * whichever comes first. Generic over the record shape (`string` for NDJSON lines,
   * `string[]` for CSV cells) so neither caller needs a type assertion to disambiguate
   * the other's reader.
   */
  async function drainStream<Item>(
    push: (text: string) => Item[],
    flush: () => Item[],
    handle: (item: Item) => Promise<boolean>,
    beforeFlush?: () => void,
  ): Promise<{ reachedEof: boolean }> {
    const reader = bodyStream.getReader()
    const decoder = new TextDecoder('utf-8')
    let hitChunkLimit = false
    let reachedEof = false

    readLoop: while (true) {
      const { done, value } = await reader.read()

      if (done) {
        beforeFlush?.()
        for (const item of flush()) await handle(item)
        reachedEof = true
        break
      }

      const text = decoder.decode(value, { stream: true })
      for (const item of push(text)) {
        const stop = await handle(item)
        if (stop) {
          hitChunkLimit = true
          break readLoop
        }
      }
    }

    if (hitChunkLimit) await reader.cancel()
    return { reachedEof }
  }

  let reachedEof: boolean
  if (job.format === 'ndjson') {
    const lineReader = new LineReader()
    const handleLine = async (line: string): Promise<boolean> => {
      seen++
      if (seen > job.rowOffset) {
        processed++
        await processRecord(seen, parseNdjsonLine(line))
      }
      return processed === chunkRowLimit
    }
    ;({ reachedEof } = await drainStream(
      (text) => lineReader.push(text),
      () => lineReader.end(),
      handleLine,
    ))
  } else {
    const csvReader = new CsvRowReader()
    let columns: string[] | null = null
    const handleRow = async (cells: string[]): Promise<boolean> => {
      if (columns === null) {
        columns = cells
        return false
      }
      seen++
      if (seen > job.rowOffset) {
        processed++
        await processRecord(seen, fromCsvCells(columns, cells))
      }
      return processed === chunkRowLimit
    }
    ;({ reachedEof } = await drainStream(
      (text) => csvReader.push(text),
      () => csvReader.end(),
      handleRow,
      // hasUnterminatedQuote() must be read before end(), which resets the in-quotes state.
      () => {
        if (!csvReader.hasUnterminatedQuote()) return
        failed++
        newErrors.push({ row: seen + 1, code: 'unterminated_quote', message: 'File is truncated inside a quoted field' })
      },
    ))
  }

  const nextState = reachedEof ? 'completed' : 'processing'
  await context.repository.update(jobSeed, job.id, {
    [f.rowOffset]: job.rowOffset + processed,
    [f.insertedRows]: job.insertedRows + inserted,
    [f.failedRows]: job.failedRows + failed,
    [f.errorReport]: appendErrorSamples(job.errors, newErrors),
    [f.state]: nextState,
  })

  if (!reachedEof) {
    const accepted = await context.queue.enqueue<ImportChunkPayload>(CONTENT_IMPORT_CHUNK_JOB, { jobId: job.id })
    if (!accepted) {
      await context.repository.update(jobSeed, job.id, {
        [f.state]: 'failed',
        [f.finishedAt]: context.clock.nowSeconds(),
        [f.errorReport]: appendErrorSamples(appendErrorSamples(job.errors, newErrors), [{
          row: 0,
          code: 'queue_unavailable',
          message: 'No queue transport accepted the continuation message',
        }]),
      })
      await deleteObjectSafely(context, job.objectKey)
    }
    return
  }

  // Delete AFTER the terminal state is written: a crash between the two leaves an orphan
  // object (reaped by the R2 lifecycle rule), never a completed job pointing at a live file.
  await context.repository.update(jobSeed, job.id, {
    [f.state]: 'completed',
    [f.finishedAt]: context.clock.nowSeconds(),
  })
  await deleteObjectSafely(context, job.objectKey)
}

export const contentImportJobs: JobRegistry = {
  [CONTENT_IMPORT_CHUNK_JOB]: contentImportChunkJob,
}
