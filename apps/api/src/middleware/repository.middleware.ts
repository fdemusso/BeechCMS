import { createMiddleware } from 'hono/factory'
import { D1ContentRepository } from '../shared/content.repository.d1'
import { D1IdempotencyRepository } from '../shared/idempotency.repository.d1'
import type { ContentRepository, IdempotencyRepository } from '@beechcms/core'
import type { Env, Variables } from '../types'

interface RepositoryOverrides {
  repository?: ContentRepository
  idempotencyRepository?: IdempotencyRepository
}

export const repositoryMiddleware = (overrides?: RepositoryOverrides) => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    context.set('repository', overrides?.repository ?? new D1ContentRepository(context.env.DB))
    context.set('idempotencyRepository', overrides?.idempotencyRepository ?? new D1IdempotencyRepository(context.env.DB))
    await next()
  })
}
