// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { EntryNotFoundError } from '@beechcms/core'
import { deleteR2Objects } from '../../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../../shared/utils/media-utils'
import { parsePositiveInt } from '../../../shared/utils/query-utils'
import { publicProblem } from '../../../public/problem-details'
import { logContentActivity, dispatchContentAutomation, handleContentDatabaseError } from './helpers'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

const MAX_BULK_SIZE = 500

function resolveSeedOrProblem(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return { problem: publicProblem(context, { type: 'content-invalid-slug', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID }) }
  }
  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return { problem: publicProblem(context, { type: 'content-seed-not-found', title: 'Not Found', status: 404, detail: CONTENT_ERRORS.SEED_NOT_FOUND }) }
  }
  if (seed.softDelete !== true) {
    return {
      problem: publicProblem(context, {
        type: 'content-soft-delete-disabled',
        title: 'Conflict',
        status: 409,
        detail: CONTENT_ERRORS.SOFT_DELETE_DISABLED,
      }),
    }
  }
  return { slug, seed }
}

function actorFrom(context: Context<AppEnv>) {
  const jwtPayload = context.get('jwtPayload')
  return { id: jwtPayload.sub, role: jwtPayload.role, email: jwtPayload.email }
}

async function readBulkIds(context: Context<AppEnv>): Promise<{ ids: string[] } | { problem: Response }> {
  let body: Record<string, unknown>
  try {
    body = await context.req.json<Record<string, unknown>>()
  } catch {
    return { problem: publicProblem(context, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY }) }
  }

  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
    return { problem: publicProblem(context, { type: 'bulk-invalid-ids', title: 'Bad Request', status: 400, detail: 'ids must be a non-empty array of strings' }) }
  }
  if (ids.length > MAX_BULK_SIZE) {
    return { problem: publicProblem(context, { type: 'bulk-size-exceeded', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.BULK_SIZE_EXCEEDED }) }
  }
  return { ids: ids as string[] }
}

export async function trashListHandler(context: Context<AppEnv>) {
  const resolved = resolveSeedOrProblem(context)
  if ('problem' in resolved) return resolved.problem
  const { seed } = resolved

  try {
    const query = context.req.query()
    const page = parsePositiveInt(query.page, 1)
    const limit = Math.min(parsePositiveInt(query.limit, 25), 100)
    const offset = (page - 1) * limit

    const repository = context.get('repository')
    const { items, total } = await repository.findMany(seed, {
      trashed: 'trashed',
      pagination: { limit, offset },
      orderBy: { column: 'deleted_at', dir: 'DESC' },
    })

    return context.json({ items, total, page, limit })
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }
}

export async function restoreHandler(context: Context<AppEnv>) {
  const resolved = resolveSeedOrProblem(context)
  if ('problem' in resolved) return resolved.problem
  const { seed, slug: schemaSlug } = resolved
  const entryId = context.req.param('id')
  if (!entryId) {
    return publicProblem(context, { type: 'content-invalid-slug-or-id', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID })
  }

  try {
    const repository = context.get('repository')
    const { row } = await repository.restore(seed, entryId, { actor: actorFrom(context) })

    logContentActivity(context, 'update', entryId, schemaSlug, String(row.title || row.name || entryId))
    dispatchContentAutomation(context, schemaSlug, 'update', { ...row, id: entryId })

    return context.json({ success: true, slug: row.slug })
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }
}

export async function bulkRestoreHandler(context: Context<AppEnv>) {
  const resolved = resolveSeedOrProblem(context)
  if ('problem' in resolved) return resolved.problem
  const { seed } = resolved

  const parsed = await readBulkIds(context)
  if ('problem' in parsed) return parsed.problem

  const repository = context.get('repository')
  const { succeeded, failed } = await repository.bulkRestore(seed, parsed.ids, { actor: actorFrom(context) })

  const failedProblems = failed.map(({ id, reason }) => ({
    id,
    problem: { status: reason === 'not-found' ? 404 : 500, type: reason === 'not-found' ? 'content-not-found' : 'bulk-restore-error', detail: reason },
  }))

  return context.json({ succeeded, failed: failedProblems })
}

export async function bulkPurgeHandler(context: Context<AppEnv>) {
  const resolved = resolveSeedOrProblem(context)
  if ('problem' in resolved) return resolved.problem
  const { seed } = resolved

  const parsed = await readBulkIds(context)
  if ('problem' in parsed) return parsed.problem

  const repository = context.get('repository')
  const { succeeded, failed, rows } = await repository.bulkPurge(seed, parsed.ids, { actor: actorFrom(context) })

  const cdnUrl = context.env.MEDIA_CDN_URL
  const allKeys = rows.flatMap((row) => extractMediaKeysFromData(seed, row, cdnUrl))
  if (allKeys.length > 0) {
    await deleteR2Objects(context, allKeys).catch((error) => {
      if (context.env.ENV !== 'production') {
        console.warn('R2 cleanup on bulk purge failed (orphaned files):', error)
      }
    })
  }

  const failedProblems = failed.map(({ id, reason }) => ({
    id,
    problem: { status: reason === 'not-found' ? 404 : 500, type: reason === 'not-found' ? 'content-not-found' : 'bulk-purge-error', detail: reason },
  }))

  return context.json({ succeeded, failed: failedProblems })
}

export async function reconcilePurgesHandler(context: Context<AppEnv>) {
  const resolved = resolveSeedOrProblem(context)
  if ('problem' in resolved) return resolved.problem
  const { seed, slug: schemaSlug } = resolved

  const query = context.req.query()
  const limit = Math.min(parsePositiveInt(query.limit, 100), 500)
  const cursor = query.cursor

  const repository = context.get('repository')
  const actor = actorFrom(context)
  const ledger = context.get('deletionLedger')
  const { events, nextCursor } = await ledger.list(schemaSlug, { limit, cursor })

  const repurged: string[] = []
  for (const event of events) {
    try {
      // The external log is the ONLY source of truth: a row present here was erased, so its
      // presence in D1 means a restore resurrected it. Re-erase, do not reconcile the other way.
      await repository.purge(seed, event.entryId, { actor })
      repurged.push(event.entryId)
    } catch (error) {
      // Already absent — the expected case on a database that was never restored.
      if (!(error instanceof EntryNotFoundError)) throw error
    }
  }

  return context.json({ scanned: events.length, repurged, nextCursor })
}
