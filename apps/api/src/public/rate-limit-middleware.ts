import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { publicProblem } from './problem-details'

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? 'unknown'
}

export function publicRateLimitMiddleware() {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const readMethod = isReadMethod(c.req.method)
    const limiterName = readMethod ? ('publicApiRead' as const) : ('publicApiWrite' as const)

    const seed = c.req.param('seed') ?? 'no-seed'
    const key = `${getClientIp(c.req.raw.headers)}:${seed}:${limiterName}`
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
