import { createMiddleware } from 'hono/factory'
import { D1ContentRepository } from '../shared/content.repository.d1'
import { D1IdempotencyRepository } from '../shared/idempotency.repository.d1'
import type { Env, Variables } from '../types'

/**
 * Middleware to inject repositories into the Hono context.
 * This decouples the handlers from the specific D1 implementations.
 */
export const repositoryMiddleware = () => {
  return createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    // Instantiate repositories with the D1 instance from environment
    context.set('repository', new D1ContentRepository(context.env.DB))
    context.set('idempotencyRepository', new D1IdempotencyRepository(context.env.DB))
    await next()
  })
}
