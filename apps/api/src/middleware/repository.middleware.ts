import { createMiddleware } from 'hono/factory'
import { D1ContentRepository } from '../shared/content.repository.d1'
import { D1IdempotencyRepository } from '../shared/idempotency.repository.d1'
import { D1MediaRepository } from '../shared/media.repository.d1'
import { D1SystemStatsRepository } from '../shared/system-stats.repository.d1'
import type { ContentRepository, IdempotencyRepository, MediaRepository, SystemStatsRepository } from '@beechcms/core'
import type { Env, Variables } from '../types'

interface RepositoryOverrides {
  repository?: ContentRepository
  idempotencyRepository?: IdempotencyRepository
  mediaRepository?: MediaRepository
  systemStatsRepository?: SystemStatsRepository
}

export const repositoryMiddleware = (overrides?: RepositoryOverrides) => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    context.set('repository', overrides?.repository ?? new D1ContentRepository(context.env.DB))
    context.set('idempotencyRepository', overrides?.idempotencyRepository ?? new D1IdempotencyRepository(context.env.DB))
    context.set('mediaRepository', overrides?.mediaRepository ?? new D1MediaRepository(context.env.DB))
    context.set('systemStatsRepository', overrides?.systemStatsRepository ?? new D1SystemStatsRepository(context.env.DB))
    await next()
  })
}
