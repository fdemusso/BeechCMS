// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { checkFormatCompatibility, isTransferFormat, type TransferFormat } from '@beechcms/core'
import { cleanStr } from '../../../shared/utils/query-utils'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { normalizeBody } from './helpers'
import {
  CONTENT_IMPORT_CHUNK_JOB,
  IMPORT_JOBS_SLUG,
  IMPORT_JOB_FIELDS,
  resolveImportMaxBytes,
  type ImportChunkPayload,
} from '../import-job'

export async function importHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) return problem(context, 'content-invalid-slug', 'Bad Request', 400, CONTENT_ERRORS.INVALID_SLUG)

  const seed = context.get('getSeed')(slug)
  if (!seed) return problem(context, 'content-seed-not-found', 'Not Found', 404, CONTENT_ERRORS.SEED_NOT_FOUND)

  let body: Record<string, unknown>
  try {
    body = normalizeBody(await context.req.json<unknown>())
  } catch {
    return problem(context, 'content-invalid-json', 'Bad Request', 400, CONTENT_ERRORS.INVALID_JSON_BODY)
  }

  const objectKey = cleanStr(body['objectKey'])
  if (!objectKey) {
    return problem(context, 'content-import-object-key-required', 'Bad Request', 400,
      CONTENT_ERRORS.IMPORT_OBJECT_KEY_REQUIRED)
  }

  const requestedFormat = cleanStr(body['format'])
  if (requestedFormat === null || !isTransferFormat(requestedFormat)) {
    return publicProblem(context, {
      type: 'content-invalid-import-format', title: 'Bad Request', status: 400,
      detail: CONTENT_ERRORS.INVALID_IMPORT_FORMAT,
      errors: [{ field: 'format', expected: 'csv | ndjson', received: String(requestedFormat),
        message: CONTENT_ERRORS.INVALID_IMPORT_FORMAT }],
    })
  }
  const format: TransferFormat = requestedFormat

  // The same authority the export endpoint calls (handlers/export.ts:L82), so the two
  // directions can never disagree about which seeds are CSV-representable.
  const compatibility = checkFormatCompatibility(seed, format)
  if (!compatibility.compatible) {
    return publicProblem(context, {
      type: 'content-csv-requires-flat-seed', title: 'Bad Request', status: 400,
      detail: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      errors: compatibility.offendingBranches.map((branch) => ({
        field: branch.alias, expected: 'a scalar branch type', received: branch.type,
        message: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      })),
    })
  }

  const jobSeed = context.get('getSeed')(IMPORT_JOBS_SLUG)
  if (!jobSeed) {
    return problem(context, 'content-import-jobs-seed-missing', 'Internal Server Error', 500,
      CONTENT_ERRORS.IMPORT_JOBS_SEED_MISSING)
  }

  const head = await context.get('bucket').head(objectKey)
  if (!head) {
    return problem(context, 'content-import-object-not-found', 'Not Found', 404,
      CONTENT_ERRORS.IMPORT_OBJECT_NOT_FOUND)
  }

  const maxBytes = resolveImportMaxBytes(context.env)
  if (head.size > maxBytes) {
    return publicProblem(context, {
      type: 'content-import-file-too-large', title: 'Payload Too Large', status: 413,
      detail: CONTENT_ERRORS.IMPORT_FILE_TOO_LARGE,
      errors: [{ field: 'objectKey', expected: `<= ${maxBytes} bytes`, received: String(head.size),
        message: CONTENT_ERRORS.IMPORT_FILE_TOO_LARGE }],
    })
  }

  const jobId = context.get('idGenerator').uuid()
  const f = IMPORT_JOB_FIELDS
  try {
    // status is the SYSTEM column and its CHECK only admits draft|review|published|archived
    // (ddl.ts:L174). The job's own lifecycle lives in the `job_state` branch.
    await context.get('repository').create(jobSeed, jobId, jobId, 'published', {
      [f.targetSeed]: slug,
      [f.format]: format,
      [f.objectKey]: objectKey,
      [f.state]: 'pending',
      [f.rowOffset]: 0,
      [f.insertedRows]: 0,
      [f.failedRows]: 0,
      [f.errorReport]: [],
      [f.createdBy]: context.get('jwtPayload').sub,
      [f.finishedAt]: null,
    })
  } catch (error) {
    console.error('Import job create error:', error)
    return problem(context, 'content-database-error', 'Internal Server Error', 500, CONTENT_ERRORS.DATABASE_ERROR)
  }

  const payload: ImportChunkPayload = { jobId }
  await context.get('queue').enqueue(CONTENT_IMPORT_CHUNK_JOB, payload)

  return context.json({ jobId }, 202, { Location: `/api/content/import-jobs/${jobId}` })
}

function problem(context: Context<AppEnv>, type: string, title: string,
  status: 400 | 404 | 413 | 500, detail: string) {
  return publicProblem(context, { type, title, status, detail })
}
