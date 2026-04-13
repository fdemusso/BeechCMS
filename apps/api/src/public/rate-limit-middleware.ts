import type { Context, Next } from 'hono'

type PublicBindings = {
  PUBLIC_READ_RATE_LIMITER?: RateLimit
  PUBLIC_WRITE_RATE_LIMITER?: RateLimit
}

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? 'unknown'
}

export function publicRateLimitMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const env = c.env as PublicBindings
    const readMethod = isReadMethod(c.req.method)
    const limiter = readMethod ? env.PUBLIC_READ_RATE_LIMITER : env.PUBLIC_WRITE_RATE_LIMITER
    if (!limiter) {
      await next()
      return
    }

    const seed = c.req.param('seed') ?? 'no-seed'
    const key = `${getClientIp(c.req.raw.headers)}:${seed}:${readMethod ? 'read' : 'write'}`
    const { success } = await limiter.limit({ key })

    if (!success) {
      return c.json({ error: 'Too many requests' }, 429)
    }

    await next()
  }
}
