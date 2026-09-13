// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { EntryNotFoundError, hasPermission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../../../shared/rbac/effective-permissions'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { IMPORT_JOBS_SLUG, readImportJobRecord, toImportJobResponse, type ImportJobRecord } from '../import-job'

/**
 * The brief's rule (§2): the creator, OR anyone who could have started the import on the same
 * seed. Isolating a job to its creator breaks team flows — the person who launched a 10 000-row
 * import may be unavailable when it finishes. `content:create` is the permission the import
 * route itself demands, so the two can never drift apart.
 */
export async function canReadImportJob(context: Context<AppEnv>, job: ImportJobRecord): Promise<boolean> {
  if (job.createdBy === context.get('jwtPayload').sub) return true
  const effective = await resolveEffectivePermissions(context)
  return hasPermission(effective, 'content:create', job.targetSeed)
}

export async function importJobStatusHandler(context: Context<AppEnv>) {
  const jobId = context.req.param('id')
  if (!jobId) {
    return publicProblem(context, { type: 'content-invalid-slug-or-id', title: 'Bad Request',
      status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  const jobSeed = context.get('getSeed')(IMPORT_JOBS_SLUG)
  if (!jobSeed) {
    return publicProblem(context, { type: 'content-import-jobs-seed-missing',
      title: 'Internal Server Error', status: 500, detail: CONTENT_ERRORS.IMPORT_JOBS_SEED_MISSING })
  }

  let job: ImportJobRecord
  try {
    job = await readImportJobRecord(context.get('repository'), jobSeed, jobId)
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { type: 'content-import-job-not-found', title: 'Not Found',
        status: 404, detail: CONTENT_ERRORS.IMPORT_JOB_NOT_FOUND })
    }
    throw error
  }

  if (!(await canReadImportJob(context, job))) {
    return publicProblem(context, { type: 'content-import-job-forbidden', title: 'Forbidden',
      status: 403, detail: CONTENT_ERRORS.IMPORT_JOB_FORBIDDEN })
  }

  return context.json(toImportJobResponse(job), 200)
}
