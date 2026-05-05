import { Context } from 'hono'
import { EntryNotFoundError } from '@beechcms/core'
import { deleteR2Objects } from '../../../upload'
import { extractMediaKeysFromData } from '../../../media-utils'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { logActivity } from '../../../shared/activity-logger'
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
    // Repository.delete returns the row data for cleanup
    const { row } = await repository.delete(seed, entryId)

    const userId = context.get('jwtPayload')?.sub
    const title = row.title || row.name || entryId
    
    logActivity(context, { 
      action: 'delete', 
      entityType: 'content', 
      entityId: entryId, 
      entitySlug: schemaSlug, 
      details: { title } 
    })

    
    const r2ObjectKeys = extractMediaKeysFromData(seed, row)
    if (r2ObjectKeys.length > 0) {
      await deleteR2Objects(context, r2ObjectKeys).catch((error) => {
        if (context.env.ENV !== 'production') {
          console.warn('R2 cleanup on delete failed (orphaned files):', error)
        }
      })
    }

    return context.json({ success: true })
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return publicProblem(context, { 
        type: 'content-not-found', 
        title: 'Not Found', 
        status: 404, 
        detail: CONTENT_ERRORS.NOT_FOUND 
      })
    }
    console.error('Content delete error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
