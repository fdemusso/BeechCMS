// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import {
  DEFAULT_EXPORT_MAX_ROWS,
  checkFormatCompatibility,
  isTransferFormat,
  type ActorContext,
  type TransferFormat,
} from '@beechcms/core'
import { cleanStr, parseQueryFilters, toEngineFilters } from '../../../shared/utils/query-utils'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import { createContentExportStream } from '../export-stream'

/** NDJSON is the universal format (brief §2), so an omitted `format` can never 400. */
const DEFAULT_FORMAT: TransferFormat = 'ndjson'

const CONTENT_TYPES: Record<TransferFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  ndjson: 'application/x-ndjson; charset=utf-8',
}

const FILE_EXTENSIONS: Record<TransferFormat, string> = { csv: 'csv', ndjson: 'ndjson' }

/**
 * Resolves the synchronous export cap. Mirrors `resolveMaxUploadBytes`
 * (features/upload/index.ts:L18): an unset or unparseable binding means "use the default",
 * never "no limit". No absolute ceiling above the operator's value — unlike an upload size,
 * this bound is over the operator's own stored rows, not over attacker-supplied input.
 */
export function resolveExportMaxRows(env: { EXPORT_MAX_ROWS?: string }): number {
  const raw = env.EXPORT_MAX_ROWS
  if (!raw) return DEFAULT_EXPORT_MAX_ROWS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EXPORT_MAX_ROWS
  return parsed
}

export async function exportHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, {
      type: 'content-invalid-slug',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_SLUG,
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND,
    })
  }

  const requestedFormat = cleanStr(context.req.query('format'))
  if (requestedFormat !== null && !isTransferFormat(requestedFormat)) {
    return publicProblem(context, {
      type: 'content-invalid-export-format',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_EXPORT_FORMAT,
      errors: [{
        field: 'format',
        expected: 'csv | ndjson',
        received: requestedFormat,
        message: CONTENT_ERRORS.INVALID_EXPORT_FORMAT,
      }],
    })
  }
  const format: TransferFormat = requestedFormat ?? DEFAULT_FORMAT

  // Single authority, shared with the import endpoint in S3, so the two can never disagree
  // about which seeds are CSV-representable.
  const compatibility = checkFormatCompatibility(seed, format)
  if (!compatibility.compatible) {
    return publicProblem(context, {
      type: 'content-csv-requires-flat-seed',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      errors: compatibility.offendingBranches.map((branch) => ({
        field: branch.alias,
        expected: 'a scalar branch type',
        received: branch.type,
        message: CONTENT_ERRORS.CSV_REQUIRES_FLAT_SEED,
      })),
    })
  }

  const search = cleanStr(context.req.query('search')) ?? ''
  const filters = toEngineFilters(parseQueryFilters(context.req.query('filters')))
  const repository = context.get('repository')

  try {
    // Pre-flight count. `findMany` runs its COUNT(*) companion in the same D1 batch
    // (content.repository.d1.ts:L339), so a one-row probe is the cheapest way to learn `total`.
    // It MUST happen before the stream opens: past the first byte the status is already 200 and
    // the only way to refuse is to truncate the file, which is the failure mode the cap exists
    // to prevent.
    const { total } = await repository.findMany(seed, {
      filters,
      fields: ['id'],
      pagination: { limit: 1, offset: 0 },
      ...(search ? { search } : {}),
    })

    const maxRows = resolveExportMaxRows(context.env)
    if (total > maxRows) {
      return publicProblem(context, {
        type: 'content-export-too-large',
        title: 'Payload Too Large',
        status: 413,
        detail: CONTENT_ERRORS.EXPORT_TOO_LARGE,
        errors: [{
          field: 'rows',
          expected: `<= ${maxRows}`,
          received: String(total),
          message: CONTENT_ERRORS.EXPORT_TOO_LARGE,
        }],
      })
    }

    const jwtPayload = context.get('jwtPayload')
    const actor: ActorContext = context.get('actor') ?? {
      type: 'authenticated',
      userId: jwtPayload?.sub,
      role: jwtPayload?.role,
    }

    const stream = createContentExportStream({ repository, seed, format, actor, filters, search: search || undefined })

    return context.body(stream, 200, {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${seed.slug}.${FILE_EXTENSIONS[format]}"`,
      // An export is a point-in-time dump of mutable data; a cached copy is a wrong copy.
      'Cache-Control': 'no-store',
    })
  } catch (error) {
    console.error('Content export error:', error)
    return publicProblem(context, {
      type: 'content-database-error',
      title: 'Internal Server Error',
      status: 500,
      detail: CONTENT_ERRORS.DATABASE_ERROR,
    })
  }
}
