# Sprint Plan: Zero-Secret Public Form Ingestion & Anti-Bot Defense Layer

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Public data ingestion (lead generation, contact requests, quotation requests) is a foundational capability for any CMS. Exposing write endpoints directly to the open web introduces two major attack vectors:
1. **Secret Leakage**: Requiring public frontend bundles to hold backend write API keys (`PUBLIC_WRITE_API_KEY`) exposes privileged credentials to scraping and extraction.
2. **Automated Abuse & Spam**: Unprotected endpoints get flooded by bots, crawlers, and denial-of-service attempts.

This sprint establishes an edge-native, zero-secret public ingestion pipeline with multi-tiered, friction-free anti-bot defenses (HMAC Time-Trap tokens with single-use replay prevention, camouflage honeypot decoy fields, origin whitelist validation, continuous Token Bucket rate limiting, and Magic Bytes signature validation), paired with a seamless React client SDK (`@beechcms/forms-react`).

### Architectural Invariants & VSA Adherence:
- **Botanical Engine Invariant**: Public form submissions strictly delegate persistence to `@beechcms/core` (`ContentRepository.create`), preserving all schema validation, policy checks, and database-agnostic translations. No raw SQL queries bypass the core engine.
- **Vertical Slice Architecture (VSA)**: All public ingestion logic resides in `apps/api/src/public/` without cross-importing from internal feature slices (`apps/api/src/features/*`). Shared contracts and primitives reside strictly in `@beechcms/core`.
- **Cloudflare Edge Purity**: Built entirely on edge-compatible primitives (Web Crypto API `crypto.subtle` for HMAC-SHA256, Cloudflare D1 for token deduplication and idempotency, and stateful/deterministic clock injection). Zero heavy ORMs or blocking external dependencies.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
Graphify structural analysis identified the following architecture:
1. **God Nodes & Orchestration**:
   - `createBeechApp` (`apps/api/src/factory.ts`): Registers `repositoryMiddleware`, `rateLimiterMiddleware`, `apiKeyMiddleware`, and mounts `publicRoutes` at `/api/v1/public`.
   - `apiKeyMiddleware` (`apps/api/src/public/api-key-middleware.ts`): Currently enforces `X-API-Key` uniformly across all `/api/v1/public/*` routes, blocking zero-secret submissions.
   - `publicAddHandler` (`apps/api/src/public/public-add.ts`): Implements initial honeypot and time-trap delta checks, but treats time-trap tokens as optional, lacks single-use token replay enforcement, and allows client-driven `status` overrides.
   - `publicRateLimitMiddleware` (`apps/api/src/public/rate-limit-middleware.ts`) & `InMemoryRateLimiter` (`apps/api/src/rate-limit/in-memory-rate-limiter.ts`): Uses fixed-window counters rather than the continuous Token Bucket algorithm specified in the domain rules.
2. **Context Variables (`AppEnv.Variables`)**:
   - `c.get('repository')`: `ContentRepository`
   - `c.get('idempotencyRepository')`: `IdempotencyRepository`
   - `c.get('clock')`: `IClock`
   - `c.get('idGenerator')`: `IIdGenerator`
   - `c.get('activityLogger')`: `IActivityLogger`
   - `c.get('notificationService')`: `INotificationService`
   - `c.get('antivirusProvider')`: `IAntivirusProvider`
3. **Middleware Registration Order in `apps/api/src/factory.ts`**:
   1. `repositoryMiddleware` (Injects D1 repositories, clock, idGenerator)
   2. `seedRegistryMiddleware` (Hydrates dynamic content types from D1)
   3. `storageMiddleware`, `queueMiddleware`, `authProvidersMiddleware`
   4. `rateLimiterMiddleware`
   5. `observabilityMiddleware`
   6. `cors` & Security Headers (`CSP`, `X-Frame-Options`, `nosniff`)
   7. `publicRateLimitMiddleware` -> `apiKeyMiddleware` -> `publicRoutes`
   8. Protected API slices (`/settings`, `/schema`, `/content`, `/automations`)

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
### `@beechcms/core` (Shared Contracts & Primitives)
- `packages/core/src/rate-limit/token-bucket-rate-limiter.ts`: Continuous refill Token Bucket rate limiter (capacity: 17, refill rate: 1 token / 3.53s) implementing `IRateLimiter`.
- `packages/core/src/rate-limit/token-bucket-rate-limiter.test.ts`: Deterministic unit tests with `IClock`.
- `packages/core/src/security/time-trap-token.repository.ts`: Interface contract `ITimeTrapTokenRepository` for replay prevention.
- `packages/core/src/index.ts`: Re-exports `TokenBucketRateLimiter` and `ITimeTrapTokenRepository`.

### `apps/api` (Backend Ingestion & Defenses)
- `apps/api/migrations/0037_time_trap_tokens.sql`: D1 migration for `public_time_trap_tokens` table and TTL index.
- `apps/api/src/shared/db/repositories/time-trap-token.repository.d1.ts`: D1 implementation of `ITimeTrapTokenRepository`.
- `apps/api/src/shared/db/repositories/time-trap-token.repository.d1.test.ts`: Integration test suite for token replay deduplication.
- `apps/api/src/types.ts`: Adds `timeTrapTokenRepository: ITimeTrapTokenRepository` to `Variables`.
- `apps/api/src/middleware/repository.middleware.ts`: Injects `D1TimeTrapTokenRepository` into request context.
- `apps/api/src/public/api-key-middleware.ts`: Updated to support Zero-Secret routes (exempting `/timetrap/token`, `/:seed/schema`, and `POST /:seed/add` when public form submissions are enabled).
- `apps/api/src/public/public-add.ts`: Hardened ingestion handler:
  - Mandatory HMAC Time-Trap token (rejects missing token with `422 Unprocessable Entity`).
  - Single-use token validation via `ITimeTrapTokenRepository` (rejects replayed tokens with `422`).
  - Time delta gate ($\Delta t \ge 1.5\text{s}$ and $\Delta t \le 3600\text{s}$).
  - Zero tolerance for honeypot decoy fields (`422` + security audit log).
  - Strict Origin / Referer check (`403 Forbidden` if disallowed).
  - Backend-driven status management (ignores/strips client status; defaults to `published`).
  - Strict isolation of internal/restricted fields (`422`).
  - Magic Bytes binary signature check (`400 Bad Request`).
- `apps/api/src/public/rate-limit-middleware.ts`: Integrates `TokenBucketRateLimiter` (17 tokens max, continuous refill) for public write traffic.
- `apps/api/test/public-anti-bot.test.ts`: Comprehensive integration test suite verifying Zero-Secret flows, replay rejection, honeypots, rate limiting, and status defaults.

### `packages/forms-react` (Client SDK)
- `packages/forms-react/src/hooks/useBeechForm.ts`: Updated to support Zero-Secret submissions (no API key required), automatic Time-Trap lifecycle, local draft persistence in `localStorage`, and honeypot registration.
- `packages/forms-react/src/test/useBeechForm.test.ts`: Test coverage for Zero-Secret public submission, token integration, and draft recovery.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 4.1: Database Migration (D1 Single-Use Token Table)
Create `apps/api/migrations/0037_time_trap_tokens.sql`:
```sql
-- =============================================================================
-- PUBLIC TIME-TRAP TOKENS
-- Single-use tracking for HMAC time-trap tokens to prevent replay attacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_time_trap_tokens (
    token_hash  TEXT    NOT NULL PRIMARY KEY,
    used_at     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_trap_tokens_expires
ON public_time_trap_tokens (expires_at);
```

### Task 4.2: Core Contracts & Token Bucket Rate Limiter
1. Create `packages/core/src/security/time-trap-token.repository.ts`:
```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface ITimeTrapTokenRepository {
  /** Checks if a time-trap token hash has already been consumed. */
  isTokenUsed(tokenHash: string): Promise<boolean>
  /** Marks a time-trap token hash as consumed with an expiration timestamp. */
  markTokenUsed(tokenHash: string, usedAt: number, expiresAt: number): Promise<void>
  /** Cleans up expired token entries. */
  cleanup(nowSeconds: number): Promise<void>
}
```

2. Create `packages/core/src/rate-limit/token-bucket-rate-limiter.ts`:
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

export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, BucketState>()
  private readonly capacity: number
  private readonly refillRatePerSecond: number
  private readonly clock: IClock

  constructor(options?: {
    capacity?: number
    refillRatePerSecond?: number
    clock?: IClock
  }) {
    this.capacity = options?.capacity ?? 17
    // Default: 1 token every 3.53 seconds (~0.283286 tokens/sec)
    this.refillRatePerSecond = options?.refillRatePerSecond ?? (1 / 3.53)
    this.clock = options?.clock ?? SystemClock
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const now = this.clock.now() / 1000 // fractional seconds for smooth refill

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
      return { isAllowed: true }
    }

    this.buckets.set(key, bucket)
    const tokensNeeded = 1 - bucket.tokens
    const retryAfterSeconds = Math.max(1, Math.ceil(tokensNeeded / this.refillRatePerSecond))

    return {
      isAllowed: false,
      retryAfterSeconds,
    }
  }

  /** Clears cached state (primarily for test cleanup) */
  reset(): void {
    this.buckets.clear()
  }
}
```

### Task 4.3: D1 Time-Trap Token Repository Implementation
Create `apps/api/src/shared/db/repositories/time-trap-token.repository.d1.ts`:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { ITimeTrapTokenRepository } from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1.js'

export class D1TimeTrapTokenRepository extends BaseD1Repository implements ITimeTrapTokenRepository {
  async isTokenUsed(tokenHash: string): Promise<boolean> {
    const row = await this.database
      .prepare('SELECT token_hash FROM public_time_trap_tokens WHERE token_hash = ? LIMIT 1')
      .bind(tokenHash)
      .first<{ token_hash: string }>()
    return row !== null
  }

  async markTokenUsed(tokenHash: string, usedAt: number, expiresAt: number): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO public_time_trap_tokens (token_hash, used_at, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(token_hash) DO UPDATE SET used_at = excluded.used_at`
      )
      .bind(tokenHash, usedAt, expiresAt)
      .run()
  }

  async cleanup(nowSeconds: number): Promise<void> {
    await this.database
      .prepare('DELETE FROM public_time_trap_tokens WHERE expires_at < ?')
      .bind(nowSeconds)
      .run()
  }
}
```

### Task 4.4: Zero-Secret API Key Middleware Adjustment
Update `apps/api/src/public/api-key-middleware.ts`:
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { Context, Next } from 'hono'
import { PUBLIC_ERRORS } from './public-errors.js'
import { publicProblem } from './problem-details.js'

type PublicBindings = {
  PUBLIC_READ_API_KEY?: string
  PUBLIC_WRITE_API_KEY?: string
}

function isZeroSecretPath(path: string, method: string): boolean {
  // Public health & Time-Trap token endpoints are strictly zero-secret
  if (path === '/health' || path === '/timetrap/token' || path.endsWith('/timetrap/token')) {
    return true
  }
  // Scoped schema lookup is zero-secret for public form rendering
  if (method === 'GET' && path.endsWith('/schema')) {
    return true
  }
  // Public form creation is zero-secret (defenses handled by publicAddHandler)
  if (method === 'POST' && (path.endsWith('/add') || path.includes('/add'))) {
    return true
  }
  return false
}

export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    // If endpoint is eligible for zero-secret access, proceed without requiring X-API-Key
    if (isZeroSecretPath(c.req.path, c.req.method)) {
      return next()
    }

    const env = c.env as PublicBindings
    const isRead = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
    const configuredKey = isRead ? env.PUBLIC_READ_API_KEY : env.PUBLIC_WRITE_API_KEY

    if (!configuredKey) {
      return publicProblem(c, {
        type: 'public-api-not-configured',
        title: PUBLIC_ERRORS.API_KEY_FORBIDDEN.error,
        status: 403,
        detail: PUBLIC_ERRORS.API_KEY_FORBIDDEN.message,
      })
    }

    const providedKey = c.req.header('X-API-Key')
    if (!providedKey || providedKey !== configuredKey) {
      return publicProblem(c, {
        type: 'public-api-key-unauthorized',
        title: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.error,
        status: 401,
        detail: PUBLIC_ERRORS.API_KEY_UNAUTHORIZED.message,
      })
    }

    await next()
  }
}
```

### Task 4.5: Hardened Public Ingestion Handler (`publicAddHandler`)
Update `apps/api/src/public/public-add.ts`:
1. **Mandatory & Replay-Resistant Time-Trap Token**:
   - Extract `_timeTrapToken` from body or `x-time-trap` header.
   - If missing: return `422 Unprocessable Entity` (`type: 'time-trap-missing'`, `detail: 'Time-Trap token is required for public form submissions'`).
   - Hash the token via SHA-256 (`tokenHash = await sha256hex(timeTrapToken)`).
   - Query `c.get('timeTrapTokenRepository').isTokenUsed(tokenHash)`. If `true`: return `422 Unprocessable Entity` (`type: 'time-trap-replayed'`, `detail: 'Time-Trap token has already been used'`).
   - Validate token via `verifyTimeTrapToken(token, secret, 1.5, 3600)`. If invalid: return `422 Unprocessable Entity` (`type: 'time-trap-violation'`).
2. **Camouflage Honeypot**:
   - Check decoy fields `['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot']`.
   - If non-empty: log security alert to `activityLogger` and return `422 Unprocessable Entity` (`type: 'honeypot-triggered'`).
3. **Origin Check**:
   - Check `Origin` / `Referer` against `ALLOWED_ORIGINS`. If mismatch: return `403 Forbidden` (`type: 'forbidden-origin'`).
4. **Backend-Driven Status Enforcement**:
   - Disregard any client `status` field.
   - Set `const statusValue: ContentStatus = (seed.defaultPublicStatus as ContentStatus) || 'published'`.
5. **Magic Bytes Validation**:
   - Synchronously inspect attachments with `verifyMagicBytes`. If mismatch: return `400 Bad Request` (`type: 'invalid-file-signature'`).
6. **Persistence & Nonce Consumption**:
   - Call `repository.create(seed, id, finalSlug, statusValue, privacyData)`.
   - On success, call `timeTrapTokenRepository.markTokenUsed(tokenHash, nowSeconds, t0 + 3600)`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Execute the following verification suite:

```bash
# 1. Typecheck and build core package
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/core test

# 2. Run core rate limiter and time-trap unit tests
pnpm --filter @beechcms/core test src/rate-limit/token-bucket-rate-limiter.test.ts
pnpm --filter @beechcms/core test src/security/time-trap.test.ts

# 3. Typecheck and test API
pnpm --filter @beechcms/api typecheck
pnpm --filter @beechcms/api test test/public-anti-bot.test.ts
pnpm --filter @beechcms/api test src/public/public-add.test.ts

# 4. Typecheck and test React SDK
pnpm --filter @beechcms/forms-react build
pnpm --filter @beechcms/forms-react test

# 5. Full workspace validation via beech CLI
pnpm beech test
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `TokenBucketRateLimiter` is implemented in `@beechcms/core` with capacity 17 and continuous refill (~1 token / 3.53s), fully tested with deterministic `IClock`.
- [ ] `ITimeTrapTokenRepository` contract is defined in `@beechcms/core` and implemented via `D1TimeTrapTokenRepository` in `apps/api`.
- [ ] D1 migration `0037_time_trap_tokens.sql` creates `public_time_trap_tokens` table with TTL index.
- [ ] `GET /api/v1/public/timetrap/token` issues HMAC tokens without requiring `X-API-Key`.
- [ ] `POST /api/v1/public/:seed/add` executes in Zero-Secret mode (no API key required when public submissions are enabled on the seed).
- [ ] Missing Time-Trap token is rejected with HTTP `422 Unprocessable Entity`.
- [ ] Replayed Time-Trap token is rejected with HTTP `422 Unprocessable Entity`.
- [ ] Submissions faster than 1.5s or older than 3600s are rejected with HTTP `422 Unprocessable Entity`.
- [ ] Non-empty honeypot decoy fields trigger HTTP `422 Unprocessable Entity` and emit a `security_alert` in `activity_logs`.
- [ ] Mismatched client origins trigger HTTP `403 Forbidden` when `ALLOWED_ORIGINS` is configured.
- [ ] Client-supplied record `status` is ignored; initial status is strictly backend-driven (defaulting to `published`).
- [ ] File attachments with spoofed extensions/MIME signatures are rejected with HTTP `400 Bad Request`.
- [ ] `@beechcms/forms-react` (`useBeechForm` & `<BeechForm />`) seamlessly supports zero-secret submissions, automatic token fetching, honeypot injection, and draft recovery in `localStorage`.
- [ ] All tests across `@beechcms/core`, `apps/api`, and `@beechcms/forms-react` pass with zero regressions.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Third-Party CAPTCHA Widgets**: Integration with Google reCAPTCHA, Cloudflare Turnstile, or hCaptcha is strictly excluded to preserve frictionless human user experience.
- **Client-Side Payload Encryption**: Browser-side payload cryptography is excluded; data in transit is protected via HTTPS/TLS, while server-side application encryption is handled via `PrivacyService`.
- **Public Record Updates/Deletions**: Unauthenticated `PUT`/`PATCH`/`DELETE` mutations remain restricted to authenticated users or API-key authorized clients.
- **Biometric / Canvas Fingerprinting**: Client telemetry and canvas fingerprinting are excluded to respect user privacy and GDPR compliance.
- **Admin UI Configuration Dashboard**: Runtime visual configuration of anti-bot thresholds is excluded; settings remain managed via environment bindings.
