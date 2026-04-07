import type { Context, Next } from 'hono'
import { PUBLIC_ERRORS } from './public-errors'

/**
 * API key auth middleware for Public API routes.
 * Header X-API-Key takes precedence over ?key= query parameter.
 */
export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const configuredKey = (c.env as { PUBLIC_API_KEY?: string }).PUBLIC_API_KEY

    if (!configuredKey) {
      return c.json(PUBLIC_ERRORS.API_KEY_FORBIDDEN, 403)
    }

    const providedKey = c.req.header('X-API-Key') ?? c.req.query('key')

    if (!providedKey || providedKey !== configuredKey) {
      return c.json(PUBLIC_ERRORS.API_KEY_UNAUTHORIZED, 401)
    }

    await next()
  }
}

