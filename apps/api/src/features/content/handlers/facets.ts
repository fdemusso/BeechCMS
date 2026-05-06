import { Context } from 'hono'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export async function facetsHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, { 
      type: 'content-invalid-slug', 
      title: 'Bad Request', 
      status: 400, 
      detail: CONTENT_ERRORS.INVALID_SLUG 
    })
  }

  const seed = context.get('getSeed')(slug)
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
    const { statuses, tagsByColumn } = await repository.getFacets(seed)

    // Legacy format expected by the dashboard
    return context.json({
      statuses: Object.keys(statuses).sort((a, b) => a.localeCompare(b, 'it')),
      tagsByColumnId: tagsByColumn,
    })
  } catch (error) {
    console.error('Content facets error:', error)
    return publicProblem(context, { 
      type: 'content-database-error', 
      title: 'Internal Server Error', 
      status: 500, 
      detail: CONTENT_ERRORS.DATABASE_ERROR 
    })
  }
}
