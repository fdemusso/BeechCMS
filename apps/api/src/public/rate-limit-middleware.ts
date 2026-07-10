// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'
import { publicProblem } from './problem-details'
import { getClientIp } from '../shared/utils/request-utils'

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

export function publicRateLimitMiddleware() {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const readMethod = isReadMethod(c.req.method)
    const limiterName = readMethod ? ('publicApiRead' as const) : ('publicApiWrite' as const)

    const path = c.req.path
    let seed = 'no-seed'
    if (path.startsWith('/api/v1/public/')) {
      const remaining = path.slice('/api/v1/public/'.length)
      const firstSegment = remaining.split('/')[0]
      if (firstSegment && firstSegment !== 'health' && firstSegment !== 'schema' && firstSegment !== 'schema.html') {
        seed = firstSegment
      }
    }
    const key = `${getClientIp(c.req)}:${seed}:${limiterName}`
    const result = await c.get('rateLimiters').getLimiter(limiterName).checkLimit(key)

    if (!result.isAllowed) {
      const headers: Record<string, string> = {}
      if (result.retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(result.retryAfterSeconds)
      }
      return publicProblem(c, {
        type: 'rate-limit-exceeded',
        title: 'Too Many Requests',
        status: 429,
        detail: 'Too many requests',
        headers,
      })
    }

    await next()
  }
}
