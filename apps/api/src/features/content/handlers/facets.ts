// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { publicProblem } from '../../../public/errors/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

export async function facetsHandler(context: Context<AppEnv, '/:slug/facets'>) {
  const slug = context.req.param('slug')

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
    }, 200)
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
