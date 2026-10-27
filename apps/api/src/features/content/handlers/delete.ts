// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import type { ZodQueryInput } from '../../../shared/utils/zod-query'
import type { contentDeleteQuerySchema } from '../crud.schema'
import { deleteR2Objects } from '../../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../../shared/utils/media-utils'
import { publicProblem } from '../../../public/errors/problem-details'
import {
  logContentActivity,
  dispatchContentAutomation,
  handleContentDatabaseError
} from './helpers'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export async function deleteHandler(context: Context<AppEnv, '/:slug/:id', ZodQueryInput<typeof contentDeleteQuerySchema>>) {
  const schemaSlug = context.req.param('slug')
  const entryId = context.req.param('id')

  const seed = context.get('getSeed')(schemaSlug)
  if (!seed) {
    return publicProblem(context, { 
      type: 'content-seed-not-found', 
      title: 'Not Found', 
      status: 404, 
      detail: CONTENT_ERRORS.SEED_NOT_FOUND 
    })
  }

  try {
    const repository = context.get('repository')
    const jwtPayload = context.get('jwtPayload')
    const actor = { id: jwtPayload.sub, role: jwtPayload.role, email: jwtPayload.email }

    const forcePurge = context.req.valid('query').purge === 'true'

    const { row } = forcePurge
      ? await repository.purge(seed, entryId, { actor })
      : await repository.softDelete(seed, entryId, { actor })

    const title = row.title || row.name || entryId

    logContentActivity(context, 'delete', entryId, schemaSlug, String(title))
    dispatchContentAutomation(context, schemaSlug, 'delete', { ...row, id: entryId })

    // R2 lives outside the row's lifecycle: a trashed entry must stay restorable WITH its media
    // (feature brief §4). Only a purge from the Trash touches the bucket.
    if (forcePurge) {
      const cdnUrl = context.env.MEDIA_CDN_URL
      const r2ObjectKeys = extractMediaKeysFromData(seed, row, cdnUrl)
      if (r2ObjectKeys.length > 0) {
        await deleteR2Objects(context, r2ObjectKeys).catch((error) => {
          if (context.env.ENV !== 'production') {
            console.warn('R2 cleanup on purge failed (orphaned files):', error)
          }
        })
      }
    }

    return context.json({ success: true, softDeleted: !forcePurge }, 200)
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }
}
