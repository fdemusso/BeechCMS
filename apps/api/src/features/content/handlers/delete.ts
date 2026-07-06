// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { deleteR2Objects } from '../../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../../shared/utils/media-utils'
import { publicProblem } from '../../../public/problem-details'
import {
  logContentActivity,
  dispatchContentAutomation,
  handleContentDatabaseError
} from './helpers'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export async function deleteHandler(context: Context<AppEnv>) {
  const schemaSlug = context.req.param('slug')
  const entryId = context.req.param('id')
  if (!schemaSlug || !entryId) {
    return publicProblem(context, { 
      type: 'content-invalid-slug-or-id', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID 
    })
  }

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
    // Repository.delete returns the row data for cleanup
    const { row } = await repository.delete(seed, entryId, { actor })

    const title = row.title || row.name || entryId

    logContentActivity(context, 'delete', entryId, schemaSlug, String(title))
    dispatchContentAutomation(context, schemaSlug, 'delete', { ...row, id: entryId })

    const cdnUrl = context.env.MEDIA_CDN_URL
    const r2ObjectKeys = extractMediaKeysFromData(seed, row, cdnUrl)
    if (r2ObjectKeys.length > 0) {
      await deleteR2Objects(context, r2ObjectKeys).catch((error) => {
        if (context.env.ENV !== 'production') {
          console.warn('R2 cleanup on delete failed (orphaned files):', error)
        }
      })
    }

    return context.json({ success: true })
  } catch (error) {
    return handleContentDatabaseError(context, error)
  }
}
