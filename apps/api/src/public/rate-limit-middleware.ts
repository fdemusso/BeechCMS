import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { publicProblem } from './problem-details'
import { getClientIp } from '../shared/request-utils'

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export function publicRateLimitMiddleware() {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const readMethod = isReadMethod(c.req.method)
    const limiterName = readMethod ? ('publicApiRead' as const) : ('publicApiWrite' as const)

    const seed = c.req.param('seed') ?? 'no-seed'
    const key = `${getClientIp(c.req)}:${seed}:${limiterName}`
    const result = await c.get('rateLimiters').getLimiter(limiterName).checkLimit(key)

    if (!result.isAllowed) {
      return publicProblem(c, {
        type: 'rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Too many requests',
      })
    }

    await next()
  }
}
