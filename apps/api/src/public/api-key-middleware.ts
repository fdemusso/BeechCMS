import type { Context, Next } from 'hono'
import { PUBLIC_ERRORS } from './public-errors'

type PublicBindings = {
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
}

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function getConfiguredKey(env: PublicBindings, method: string): string | undefined {
  if (isReadMethod(method)) {
    return env.PUBLIC_READ_API_KEY
  }
  return env.PUBLIC_WRITE_API_KEY
}

/**
 * API key auth middleware for Public API routes.
 * Uses X-API-Key header only.
 */
export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const env = c.env as PublicBindings
    const configuredKey = getConfiguredKey(env, c.req.method)

    if (!configuredKey) {
      return c.json(PUBLIC_ERRORS.API_KEY_FORBIDDEN, 403)
    }

    const providedKey = c.req.header('X-API-Key')

    if (!providedKey || providedKey !== configuredKey) {
      return c.json(PUBLIC_ERRORS.API_KEY_UNAUTHORIZED, 401)
    }

    await next()
  }
}

