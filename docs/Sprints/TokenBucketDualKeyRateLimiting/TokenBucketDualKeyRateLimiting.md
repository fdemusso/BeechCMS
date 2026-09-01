### Pre-Computation Analysis
a) **God Nodes:**
   - `createBeechApp` (`apps/api/src/factory.ts`)
   - `rateLimiterMiddleware` (`apps/api/src/middleware/rate-limit.middleware.ts`)
   - `TokenBucketRateLimiter` (`packages/core/src/rate-limit/token-bucket-rate-limiter.ts`)
   - `Variables` / `AppEnv` (`apps/api/src/types.ts`)

b) **Architectural Boundaries:**
   - `packages/core/src/rate-limit/`: Enhance `RateLimitResult` (`limit`, `remaining`) in `rate-limiter.ts` and `TokenBucketRateLimiter` in `token-bucket-rate-limiter.ts` with natural bucket memory decay, fractional wait time ceiling (`Math.ceil`), and quota reporting.
   - `apps/api/src/shared/utils/`: Create `dual-key-rate-limiter.ts` coordinating atomic IP + normalized account evaluation with strict rejection priority.
   - `apps/api/src/middleware/`: Refactor `rate-limit.middleware.ts` to provide a unified, deterministic `TokenBucketRateLimiter` registry across development, test, and production environments, eliminating simulator and runtime divergence.
   - `apps/api/src/public/`: Update `rate-limit-middleware.ts` to inject RFC-compliant traffic control headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) and format RFC 7807 problem responses on 429.
   - `apps/api/src/factory.ts`: Integrate Dual-Key protection on `/auth/login` and ensure pre-database, pre-crypto rate limiting on `/auth/refresh`.
   - `apps/api/src/features/password-reset/`: Apply Dual-Key protection on `/admin/forgot-password` (`requestPasswordReset`) and IP rate limiting on `/admin/reset-password` (`resetPassword`).
   - `apps/dashboard/`: No changes required (UI tier receives standard HTTP 429 and Retry-After responses transparently).

c) **Impact Analysis (`graphify affected`):**
   - `RateLimitResult` / `TokenBucketRateLimiter`: Additive property additions (`limit`, `remaining`) are fully backward-compatible.
   - `rateLimiterMiddleware`: Used in `createBeechApp` and tested across 25+ integration flow tests. Unifying the registry with in-memory `TokenBucketRateLimiter` eliminates local development bypasses and production missing-binding exceptions while maintaining deterministic behavior in Vitest.

### VETO Audit
- **Botanical Dialect:** The plan strictly preserves the Botanical Engine invariants. No D1 queries bypass `@beechcms/core`. The `users` table schema and database state remain completely isolated with zero persistent lockout columns or flags.
- **Vertical Slice Architecture:** The Dual-Key coordination logic is placed in `apps/api/src/shared/utils/dual-key-rate-limiter.ts`, ensuring zero cross-slice imports between `auth`, `password-reset`, and `content`.
- **Cloudflare Purity:** Edge-native in-memory execution inside Worker isolates. Avoids over-engineered distributed synchronization (KV/Durable Objects) and external ORMs.
- **Status:** Approved. HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The existing rate limiting implementation in BeechCMS suffers from two structural problems:
1. Public API endpoints use a naive fixed-window limiter (`InMemoryRateLimiter`) or unconfigured Cloudflare bindings, causing starvation and false rejections during legitimate traffic bursts.
2. Sensitive authentication endpoints (`/auth/login`, `/admin/forgot-password`) only check client IP, leaving user accounts exposed to distributed brute-force and credential stuffing attacks executed across rotating proxy pools.
Furthermore, the previous architecture bypassed rate limiting entirely in local development due to workerd simulator crashes, causing behavioral divergence between development, integration tests, and production.

This sprint establishes a unified, deterministic Token Bucket engine with smooth continuous refill in `@beechcms/core`, coordinates Dual-Key (IP + normalized account) protection on sensitive endpoints, and standardizes RFC 7807 traffic control headers across all public routes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **Core Layer:** `packages/core/src/rate-limit/rate-limiter.ts` defines `IRateLimiter` and `RateLimitResult` (containing only `isAllowed` and `retryAfterSeconds?`). `packages/core/src/rate-limit/token-bucket-rate-limiter.ts` provides basic token bucket logic without remaining token reporting or memory pruning.
- **API Environment:** `apps/api/src/types.ts` defines `Env` bindings (`LOGIN_RATE_LIMITER`, `REFRESH_RATE_LIMITER`, etc.) and `Variables.rateLimiters: IRateLimiterRegistry`.
- **Middleware Registry:** `apps/api/src/middleware/rate-limit.middleware.ts` creates `buildDefaultRegistry(env)` which instantiates `CloudflareRateLimiter` or `NoOpRateLimiter`, bypassing execution in development.
- **Route Handlers:**
  - `apps/api/src/factory.ts` handles `/auth/login` (checks IP only, single limiter) and `/auth/refresh` (checks IP).
  - `apps/api/src/features/password-reset/request.ts` handles `/admin/forgot-password` (checks IP only).
  - `apps/api/src/features/password-reset/reset.ts` handles `/admin/reset-password` (checks IP).
  - `apps/api/src/public/rate-limit-middleware.ts` handles `/api/v1/public/*` routes.
- **Middleware Registration Order in `apps/api/src/factory.ts`:**
  1. `repositoryMiddleware`
  2. `seedRegistryMiddleware`
  3. `storageMiddleware`
  4. `queueMiddleware`
  5. `authProvidersMiddleware`
  6. `rateLimiterMiddleware`
  7. `observabilityMiddleware`
  8. `cors`
  9. Security headers & Analytics

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `packages/core/src/rate-limit/rate-limiter.ts`: Updated `RateLimitResult` interface with `limit?: number` and `remaining?: number`.
- `packages/core/src/rate-limit/token-bucket-rate-limiter.ts`: Enhanced `TokenBucketRateLimiter` supporting continuous refill, natural idle bucket decay/cleanup, accurate `remaining` token calculation (floored), and `retryAfterSeconds` ceiling calculation.
- `packages/core/src/rate-limit/token-bucket-rate-limiter.test.ts`: Extended unit test suite verifying burst capacity, continuous refill, memory decay, and header calculations.
- `apps/api/src/shared/utils/dual-key-rate-limiter.ts`: Dual-Key coordinator utility evaluating IP and normalized account buckets atomically with rejection priority and wait time aggregation.
- `apps/api/src/shared/utils/dual-key-rate-limiter.test.ts`: Comprehensive unit tests for Dual-Key coordination, malformed body handling, and account key normalization.
- `apps/api/src/middleware/rate-limit.middleware.ts`: Unified in-memory rate limiter registry providing deterministic `TokenBucketRateLimiter` instances across all environments (`login`, `loginAccount`, `tokenRefresh`, `forgotPassword`, `forgotPasswordAccount`, `resetPassword`, `publicApiRead`, `publicApiWrite`).
- `apps/api/src/middleware/rate-limit.middleware.test.ts`: Updated tests validating registry configuration and middleware injection.
- `apps/api/src/public/rate-limit-middleware.ts`: Updated to inject `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers on 2xx/429 responses and standard `Retry-After` on 429.
- `apps/api/src/public/rate-limit-middleware.test.ts`: Tests validating traffic control headers and 429 response structure.
- `apps/api/src/factory.ts`: Refactored `/auth/login` and `/auth/refresh` endpoints applying Dual-Key protection and pre-database/pre-crypto ordering.
- `apps/api/src/features/password-reset/request.ts`: Refactored `requestPasswordReset` applying Dual-Key protection.
- `apps/api/src/rate-limit/in-memory-rate-limiter.ts`: Removed or refactored to alias `TokenBucketRateLimiter`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 1. Core Rate Limiter Interfaces (`packages/core/src/rate-limit/rate-limiter.ts`)
Update `RateLimitResult` to expose token capacity and remaining quota:
```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface RateLimitResult {
  isAllowed: boolean
  /**
   * The number of whole seconds after which the client may retry the request.
   */
  retryAfterSeconds?: number
  /**
   * The maximum token capacity configured for this limiter.
   */
  limit?: number
  /**
   * The number of whole tokens remaining in the bucket.
   */
  remaining?: number
}

export interface IRateLimiter {
  /**
   * Checks whether the given key is within the rate limit.
   */
  checkLimit(key: string): Promise<RateLimitResult>
  /**
   * Clears cached bucket state (for testing and isolation).
   */
  reset?(): void
}
```

### 2. Enhanced Token Bucket Engine (`packages/core/src/rate-limit/token-bucket-rate-limiter.ts`)
Implement smooth continuous refill, natural memory decay, and quota calculation:
```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IRateLimiter, RateLimitResult } from './rate-limiter.js'
import type { IClock } from '../common/clock.js'
import { SystemClock } from '../common/clock.js'

interface BucketState {
  tokens: number
  lastRefillTimestamp: number
}

export interface TokenBucketOptions {
  capacity?: number
  refillRatePerSecond?: number
  clock?: IClock
  maxIdleTimeSeconds?: number
}

export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, BucketState>()
  private readonly capacity: number
  private readonly refillRatePerSecond: number
  private readonly clock: IClock
  private readonly maxIdleTimeSeconds: number

  constructor(options?: TokenBucketOptions) {
    this.capacity = options?.capacity ?? 17
    // Default: 1 token every 3.53 seconds (~0.283286 tokens/sec)
    this.refillRatePerSecond = options?.refillRatePerSecond ?? (1 / 3.53)
    this.clock = options?.clock ?? SystemClock
    this.maxIdleTimeSeconds = options?.maxIdleTimeSeconds ?? 3600 // 1 hour idle TTL
  }

  private pruneExpiredBuckets(now: number): void {
    if (this.buckets.size < 500) return
    for (const [key, state] of this.buckets.entries()) {
      if (now - state.lastRefillTimestamp > this.maxIdleTimeSeconds) {
        this.buckets.delete(key)
      }
    }
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for continuous refill
    this.pruneExpiredBuckets(now)

    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefillTimestamp: now,
      }
    } else {
      const elapsed = Math.max(0, now - bucket.lastRefillTimestamp)
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRatePerSecond)
      bucket.lastRefillTimestamp = now
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      this.buckets.set(key, bucket)
      return {
        isAllowed: true,
        limit: this.capacity,
        remaining: Math.floor(bucket.tokens),
      }
    }

    this.buckets.set(key, bucket)
    const tokensNeeded = 1 - bucket.tokens
    const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / this.refillRatePerSecond))

    return {
      isAllowed: false,
      retryAfterSeconds,
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
    }
  }

  reset(): void {
    this.buckets.clear()
  }
}
```

### 3. Dual-Key Coordinator Utility (`apps/api/src/shared/utils/dual-key-rate-limiter.ts`)
Implement atomic Dual-Key evaluation with strict normalization and rejection priority:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IRateLimiter, RateLimitResult } from '@beechcms/core'

export interface DualKeyRateLimitOptions {
  ipLimiter: IRateLimiter
  accountLimiter: IRateLimiter
  clientIp: string
  accountKey: string
}

export interface DualKeyRateLimitResult {
  isAllowed: boolean
  retryAfterSeconds?: number
  blockedBy?: 'ip' | 'account' | 'both'
}

/**
 * Normalizes account identifiers (e.g. emails) by trimming whitespace and converting to lowercase.
 */
export function normalizeAccountKey(rawKey: string): string {
  return rawKey.trim().toLowerCase()
}

/**
 * Coordinates atomic evaluation of IP and Account rate limiters.
 * If either bucket violates its limit, access is rejected (HTTP 429).
 */
export async function checkDualKeyRateLimit(
  options: DualKeyRateLimitOptions
): Promise<DualKeyRateLimitResult> {
  const normalizedAccount = normalizeAccountKey(options.accountKey)
  
  const [ipResult, accountResult] = await Promise.all([
    options.ipLimiter.checkLimit(options.clientIp),
    options.accountLimiter.checkLimit(normalizedAccount),
  ])

  if (!ipResult.isAllowed || !accountResult.isAllowed) {
    const ipRetry = ipResult.retryAfterSeconds ?? 0
    const accountRetry = accountResult.retryAfterSeconds ?? 0
    const retryAfterSeconds = Math.max(ipRetry, accountRetry, 1)

    let blockedBy: 'ip' | 'account' | 'both' = 'both'
    if (!ipResult.isAllowed && accountResult.isAllowed) {
      blockedBy = 'ip'
    } else if (ipResult.isAllowed && !accountResult.isAllowed) {
      blockedBy = 'account'
    }

    return {
      isAllowed: false,
      retryAfterSeconds,
      blockedBy,
    }
  }

  return { isAllowed: true }
}
```

### 4. API Rate Limiter Registry (`apps/api/src/middleware/rate-limit.middleware.ts`)
Provide deterministic in-memory Token Bucket limiters for all routes:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createMiddleware } from 'hono/factory'
import type { IRateLimiter } from '@beechcms/core'
import { TokenBucketRateLimiter } from '@beechcms/core'
import type { AppEnv, Env } from '../types'

export type RateLimiterName =
  | 'login'
  | 'loginAccount'
  | 'tokenRefresh'
  | 'forgotPassword'
  | 'forgotPasswordAccount'
  | 'resetPassword'
  | 'publicApiRead'
  | 'publicApiWrite'

export interface IRateLimiterRegistry {
  getLimiter(name: RateLimiterName): IRateLimiter
  resetAll?(): void
}

export function buildDefaultRegistry(_env?: Env): IRateLimiterRegistry {
  const limiters: Record<RateLimiterName, IRateLimiter> = {
    login: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // IP burst: 10, 1 token/5s
    loginAccount: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // Account burst: 5, 1 token/10s
    tokenRefresh: new TokenBucketRateLimiter({ capacity: 20, refillRatePerSecond: 0.5 }), // Refresh burst: 20, 1 token/2s
    forgotPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.05 }), // IP burst: 5, 1 token/20s
    forgotPasswordAccount: new TokenBucketRateLimiter({ capacity: 3, refillRatePerSecond: 0.02 }), // Account burst: 3, 1 token/50s
    resetPassword: new TokenBucketRateLimiter({ capacity: 5, refillRatePerSecond: 0.1 }), // IP burst: 5, 1 token/10s
    publicApiRead: new TokenBucketRateLimiter({ capacity: 60, refillRatePerSecond: 1 }), // Read burst: 60, 1 token/1s
    publicApiWrite: new TokenBucketRateLimiter({ capacity: 10, refillRatePerSecond: 0.2 }), // Write burst: 10, 1 token/5s
  }

  return {
    getLimiter: (name) => limiters[name],
    resetAll: () => {
      for (const limiter of Object.values(limiters)) {
        limiter.reset?.()
      }
    },
  }
}

export const rateLimiterMiddleware = (overrides?: { registry?: IRateLimiterRegistry }) => {
  return createMiddleware<AppEnv>(async (context, next) => {
    const registry = overrides?.registry ?? buildDefaultRegistry(context.env)
    context.set('rateLimiters', registry)
    await next()
  })
}
```

### 5. Public Routes Traffic Control Headers (`apps/api/src/public/rate-limit-middleware.ts`)
```typescript
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
      if (firstSegment && firstSegment !== 'health' && firstSegment !== 'timetrap' && firstSegment !== 'search') {
        seed = c.get('seedRegistry').get(firstSegment) ? firstSegment : 'invalid-seed'
      }
    }
    const key = `${getClientIp(c.req)}:${seed}:${limiterName}`
    const result = await c.get('rateLimiters').getLimiter(limiterName).checkLimit(key)

    if (result.limit !== undefined) {
      c.header('X-RateLimit-Limit', String(result.limit))
    }
    if (result.remaining !== undefined) {
      c.header('X-RateLimit-Remaining', String(result.remaining))
    }

    if (!result.isAllowed) {
      const headers: Record<string, string> = {}
      if (result.retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(result.retryAfterSeconds)
      }
      if (result.limit !== undefined) {
        headers['X-RateLimit-Limit'] = String(result.limit)
      }
      if (result.remaining !== undefined) {
        headers['X-RateLimit-Remaining'] = String(result.remaining)
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
```

### 6. Authentication Handlers Update (`apps/api/src/factory.ts`)
Update `/auth/login` and `/auth/refresh`:
```typescript
  // 3. Auth Routes
  app.post('/auth/login', async (context) => {
    try {
      const clientIp = getClientIp(context.req)

      let body: any
      try {
        body = await context.req.json()
      } catch {
        // Evaluate IP rate limit on malformed body before rejecting
        const ipLimit = await context.get('rateLimiters').getLimiter('login').checkLimit(clientIp)
        if (!ipLimit.isAllowed) {
          const headers: Record<string, string> = {}
          if (ipLimit.retryAfterSeconds !== undefined) {
            headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
          }
          return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
        }
        return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
      }

      const credentials = parseLoginBody(body)
      if (!credentials) {
        const ipLimit = await context.get('rateLimiters').getLimiter('login').checkLimit(clientIp)
        if (!ipLimit.isAllowed) {
          const headers: Record<string, string> = {}
          if (ipLimit.retryAfterSeconds !== undefined) {
            headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
          }
          return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
        }
        return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
      }

      const { email, password } = credentials
      if (!validateLoginInput(email, password)) {
        const ipLimit = await context.get('rateLimiters').getLimiter('login').checkLimit(clientIp)
        if (!ipLimit.isAllowed) {
          const headers: Record<string, string> = {}
          if (ipLimit.retryAfterSeconds !== undefined) {
            headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
          }
          return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
        }
        return context.json({ error: AUTH_ERRORS.INVALID_REQUEST }, 400)
      }

      // Dual-Key Rate Limit Check
      const dualKeyResult = await checkDualKeyRateLimit({
        ipLimiter: context.get('rateLimiters').getLimiter('login'),
        accountLimiter: context.get('rateLimiters').getLimiter('loginAccount'),
        clientIp,
        accountKey: email,
      })

      if (!dualKeyResult.isAllowed) {
        const headers: Record<string, string> = {}
        if (dualKeyResult.retryAfterSeconds !== undefined) {
          headers['Retry-After'] = String(dualKeyResult.retryAfterSeconds)
        }
        return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
      }

      const normalizedEmail = normalizeAccountKey(email)
      const user = await context.get('userRepository').findByEmail(normalizedEmail)
      const hashToCompare = user?.passwordHash ?? DUMMY_PASSWORD_HASH
      const isValid = await verifyPassword(password, hashToCompare, context.get('hashProvider'))

      if (!user || !isValid) return context.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)

      const accessToken = await context.get('tokenService').issue({
        sub: user.id,
        email: user.email,
        name: user.name ?? undefined,
        surname: user.surname ?? undefined,
        role: user.role,
      })
      const refreshToken = generateRefreshToken()
      const refreshTokenHash = await sha256hex(refreshToken)
      const nowSeconds = SystemClock.nowSeconds()

      await context.get('sessionRepository').saveRefreshToken({
        id: SystemIdGenerator.uuid(),
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: nowSeconds + REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
      })
      setCookie(context, 'refresh_token', refreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))
      return context.json({ token: accessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      return handleAuthError(context, error, 'Login')
    }
  })

  app.post('/auth/refresh', async (context) => {
    try {
      const refreshClientIp = getClientIp(context.req)
      // Upstream pre-database rate limiting
      const refreshRateLimit = await context.get('rateLimiters').getLimiter('tokenRefresh').checkLimit(refreshClientIp)
      if (!refreshRateLimit.isAllowed) {
        const headers: Record<string, string> = {}
        if (refreshRateLimit.retryAfterSeconds !== undefined) {
          headers['Retry-After'] = String(refreshRateLimit.retryAfterSeconds)
        }
        return context.json({ error: AUTH_ERRORS.RATE_LIMIT_EXCEEDED }, 429, headers)
      }

      const refreshToken = getCookie(context, 'refresh_token')
      if (!refreshToken) return context.json({ error: 'Refresh token missing' }, 401)

      const nowSeconds = SystemClock.nowSeconds()
      const tokenHash = await sha256hex(refreshToken)
      const activeSession = await context.get('sessionRepository').findActiveByHash(tokenHash, nowSeconds)
      if (!activeSession) return context.json({ error: 'Invalid refresh token' }, 401)

      const user = await context.get('userRepository').findById(activeSession.userId)
      if (!user) {
        await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
        return context.json({ error: 'User not found' }, 401)
      }

      const newAccessToken = await context.get('tokenService').issue({
        sub: user.id,
        email: user.email,
        name: user.name ?? undefined,
        surname: user.surname ?? undefined,
        role: user.role,
      })
      const newRefreshToken = generateRefreshToken()
      const newRefreshTokenHash = await sha256hex(newRefreshToken)

      await context.get('sessionRepository').saveRefreshToken({
        id: SystemIdGenerator.uuid(),
        userId: user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt: nowSeconds + REFRESH_TOKEN_EXPIRY_DAYS * SECONDS_PER_DAY,
      })
      await context.get('sessionRepository').revokeByHash(tokenHash, nowSeconds)
      setCookie(context, 'refresh_token', newRefreshToken, getRefreshTokenCookieOptions(isRequestSecure(context.req.url)))

      return context.json({ token: newAccessToken, expiresIn: '15m' }, 200)
    } catch (error) {
      return handleAuthError(context, error, 'Refresh')
    }
  })
```

### 7. Password Reset Handlers Update (`apps/api/src/features/password-reset/request.ts`)
```typescript
  const clientIpAddress = getClientIp(req)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    const ipLimit = await context.get('rateLimiters').getLimiter('forgotPassword').checkLimit(clientIpAddress)
    if (!ipLimit.isAllowed) {
      const headers: Record<string, string> = {}
      if (ipLimit.retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
      }
      return context.json({ error: 'Too many requests' }, 429, headers)
    }
    return context.json({ error: 'Invalid request body' }, 400)
  }

  const emailInput = payload.email
  if (typeof emailInput !== 'string' || !emailInput.trim()) {
    const ipLimit = await context.get('rateLimiters').getLimiter('forgotPassword').checkLimit(clientIpAddress)
    if (!ipLimit.isAllowed) {
      const headers: Record<string, string> = {}
      if (ipLimit.retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
      }
      return context.json({ error: 'Too many requests' }, 429, headers)
    }
    return context.json({ error: 'Invalid request' }, 400)
  }

  const dualKeyResult = await checkDualKeyRateLimit({
    ipLimiter: context.get('rateLimiters').getLimiter('forgotPassword'),
    accountLimiter: context.get('rateLimiters').getLimiter('forgotPasswordAccount'),
    clientIp: clientIpAddress,
    accountKey: emailInput,
  })

  if (!dualKeyResult.isAllowed) {
    const headers: Record<string, string> = {}
    if (dualKeyResult.retryAfterSeconds !== undefined) {
      headers['Retry-After'] = String(dualKeyResult.retryAfterSeconds)
    }
    return context.json({ error: 'Too many requests' }, 429, headers)
  }

  const normalizedEmail = normalizeAccountKey(emailInput)
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Execute the following verification suite:

1. **Build and Typecheck Core:**
   ```bash
   pnpm --filter @beechcms/core build
   pnpm --filter @beechcms/core test
   ```

2. **Build and Typecheck API:**
   ```bash
   pnpm --filter @beechcms/api build
   pnpm --filter @beechcms/api test
   ```

3. **Full Repository Validation:**
   ```bash
   pnpm beech test
   ```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `TokenBucketRateLimiter` in `@beechcms/core` calculates fractional refill continuously and rounds wait times up with `Math.ceil`.
- [ ] `RateLimitResult` exposes optional integer `limit` and `remaining` tokens.
- [ ] `TokenBucketRateLimiter` implements natural idle bucket pruning without memory leaks.
- [ ] `checkDualKeyRateLimit` normalizes account keys (lowercase + trim) and blocks requests if either IP or account bucket is depleted.
- [ ] Malformed or missing JSON bodies consume the IP bucket only and return HTTP 400 (or HTTP 429 if the IP bucket is exhausted).
- [ ] `/auth/login` and `/admin/forgot-password` are protected by Dual-Key rate limiting.
- [ ] `/auth/refresh` enforces rate limiting strictly upstream before hashing or database session lookups.
- [ ] Sensitive authentication endpoints never expose `X-RateLimit-*` headers on 2xx/401 responses, and expose only `Retry-After` on 429.
- [ ] Public API routes inject `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers on 2xx and 429 responses, plus `Retry-After` on 429.
- [ ] Rate limiting operates deterministically across dev, test, and prod without environment bypasses.
- [ ] Zero database migrations or changes to the `users` table schema.
- [ ] All unit and integration test suites pass with zero regressions.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Distributed / Cross-Edge Synchronization:** No Durable Objects, KV stores, or external coordination for token buckets.
- **Persistent Database Lockout:** No account locking columns, flags, or persistent blocklists in SQLite/D1.
- **Device Fingerprinting:** No client device tracking, canvas fingerprinting, or manual IP whitelist/blacklist tables.
- **Post-Auth Result Differentiation:** No separate quota deductions based on whether credentials were valid or invalid after authentication.
- **Dashboard UI Alterations:** No changes to frontend components or React state management.
