# Sprint Plan: `@beechcms/client/webhooks` Submodule & Verification API

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint delivers an isolated, isomorphic, zero-runtime-dependency subpath export (`@beechcms/client/webhooks`) and a modernized, ergonomic options-based webhook verification API (`verifyBeechWebhookSignature`, `constructWebhookEvent`, `WebhookVerificationError`, `BEECH_SIGNATURE_HEADER`) for `@beechcms/client`.

Architectural Rationale & Invariants:
1. **Zero-Overhead Leaf Package:** Downstream consumers (serverless functions, edge workers, Node.js backends, Next.js route handlers) need to verify incoming BeechCMS webhook events (`X-BeechCMS-Signature`) without importing unused client modules or heavy transitive dependencies. Introducing the `./webhooks` subpath export in `package.json` enables clean tree-shaking and zero-dependency imports (`import { constructWebhookEvent } from '@beechcms/client/webhooks'`).
2. **Standard Web Crypto Compliance:** The cryptographic verification relies purely on the standard Web Crypto API (`crypto.subtle`), which is natively available across Node.js ≥ 18, Cloudflare Workers, Bun, Deno, and modern browser runtimes. No external crypto libraries (`crypto-js`, `noble-hashes`) are introduced.
3. **Botanical & VSA Boundaries Preserved:** `@beechcms/client` is an external consumer leaf SDK at the network tier. It performs zero direct D1 operations, bypasses no Botanical Engine transformations, and introduces zero cross-tier dependencies with `apps/api` or `apps/dashboard`.
4. **Clean Greenfield API (No Legacy Baggage):** Replaces legacy positional parameter signatures with an options object pattern (`{ payload, signature, secret }`), providing dedicated boolean verification (`verifyBeechWebhookSignature`) and exception-throwing event hydration (`constructWebhookEvent<T>`).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

1. **Current Package Exports:**
   `packages/client/package.json` exposes only the root `.` entrypoint:
   ```json
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
     }
   }
   ```
2. **Current Webhook Implementation:**
   `packages/client/src/webhook.ts` provides a legacy function `verifyBeechSignature(body: string, signature: string | null, secret: string)` delegating to `@beechcms/core/webhook-crypto`.
3. **Backend Producer Contract (`apps/api/src/features/automations/executors/webhook.executor.ts`):**
   - Automation engine signs outgoing requests with HMAC-SHA256 using `signWebhookBody(body, secret)`.
   - The header emitted is `X-BeechCMS-Signature` with value `sha256=<hex_digest>`.
4. **Impact Analysis (`graphify affected`):**
   `graphify affected "packages_client_src_webhook_verifybeechsignature"` confirms that `verifyBeechSignature` is only consumed internally by `packages/client/src/index.ts` and `packages/client/src/webhook.test.ts`. No internal slices in `apps/api` or `apps/dashboard` depend on this client export.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

1. `packages/client/package.json` — MODIFIED:
   - Add `./webhooks` subpath export mapping to `./dist/webhooks/index.js` and `./dist/webhooks/index.d.ts`.
2. `packages/client/src/webhooks/index.ts` — NEW:
   - Export constant `BEECH_SIGNATURE_HEADER = 'x-beechcms-signature'`.
   - Export custom error class `WebhookVerificationError`.
   - Export types `VerifyWebhookSignatureOptions` and `ConstructWebhookEventOptions`.
   - Export `verifyBeechWebhookSignature(options: VerifyWebhookSignatureOptions): Promise<boolean>`.
   - Export `constructWebhookEvent<T = Record<string, unknown>>(options: ConstructWebhookEventOptions): Promise<T>`.
3. `packages/client/src/webhooks/webhooks.test.ts` — NEW:
   - Unit tests covering signature verification (raw hex vs `sha256=` prefix), constant-time comparison, invalid/empty secret/payload/signature edge cases, malformed hex strings, JSON parsing, and `WebhookVerificationError` vs `SyntaxError` discrimination.
4. `packages/client/src/index.ts` — MODIFIED:
   - Re-export all webhook symbols (`verifyBeechWebhookSignature`, `constructWebhookEvent`, `WebhookVerificationError`, `BEECH_SIGNATURE_HEADER`, `VerifyWebhookSignatureOptions`, `ConstructWebhookEventOptions`) from `./webhooks/index.js`.
   - Remove legacy `verifyBeechSignature`.
5. `packages/client/src/webhook.ts` & `packages/client/src/webhook.test.ts` — REMOVED:
   - Clean deletion in favor of the new `packages/client/src/webhooks/` module.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 — `packages/client/package.json`

Update `exports` in `packages/client/package.json`:

```json
{
  "name": "@beechcms/client",
  "version": "0.6.0-preview.3",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/webhooks/index.js",
      "types": "./dist/webhooks/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w --preserveWatchOutput",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@beechcms/core": "workspace:^0.6.0-preview.3"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@vitest/coverage-v8": "^4.1.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "license": "MIT"
}
```

---

### 4.2 — `packages/client/src/webhooks/index.ts`

Full implementation using native Web Crypto (`crypto.subtle`):

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const BEECH_SIGNATURE_HEADER = 'x-beechcms-signature'

const SIG_PREFIX = 'sha256='
const HEX_REGEX = /^[0-9a-fA-F]{64}$/

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface VerifyWebhookSignatureOptions {
  payload: string
  signature: string | null | undefined
  secret: string
}

export interface ConstructWebhookEventOptions {
  payload: string
  signature: string | null | undefined
  secret: string
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeHmacSha256Hex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Validates an inbound BeechCMS webhook signature against a shared secret in constant time.
 * Returns `false` without throwing if the payload, signature, or secret is invalid or mismatching.
 * Accepts both `sha256=<hex>` and raw `<hex>` formats.
 */
export async function verifyBeechWebhookSignature(
  options: VerifyWebhookSignatureOptions,
): Promise<boolean> {
  try {
    if (!options || typeof options !== 'object') {
      return false
    }
    const { payload, signature, secret } = options
    if (typeof payload !== 'string' || typeof signature !== 'string' || typeof secret !== 'string') {
      return false
    }
    if (!secret.trim() || !signature.trim()) {
      return false
    }

    const cleanSig = signature.trim()
    const rawProvided = cleanSig.startsWith(SIG_PREFIX)
      ? cleanSig.slice(SIG_PREFIX.length)
      : cleanSig

    if (!HEX_REGEX.test(rawProvided)) {
      return false
    }

    const expectedHex = await computeHmacSha256Hex(payload, secret)
    return timingSafeEqual(expectedHex.toLowerCase(), rawProvided.toLowerCase())
  } catch {
    return false
  }
}

/**
 * Verifies the HMAC signature and deserializes the JSON payload into type `T`.
 * Throws `WebhookVerificationError` on missing parameters or cryptographic signature failure.
 * Lets `SyntaxError` surface naturally if JSON parsing fails on a valid payload.
 */
export async function constructWebhookEvent<T = Record<string, unknown>>(
  options: ConstructWebhookEventOptions,
): Promise<T> {
  if (!options || typeof options !== 'object') {
    throw new WebhookVerificationError('Options object must be provided')
  }

  const { payload, signature, secret } = options

  if (typeof payload !== 'string' || !payload) {
    throw new WebhookVerificationError('Webhook payload must be a non-empty string')
  }
  if (typeof signature !== 'string' || !signature.trim()) {
    throw new WebhookVerificationError('Webhook signature is missing or empty')
  }
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new WebhookVerificationError('Webhook secret is missing or empty')
  }

  const isValid = await verifyBeechWebhookSignature({ payload, signature, secret })
  if (!isValid) {
    throw new WebhookVerificationError('Webhook signature verification failed')
  }

  return JSON.parse(payload) as T
}
```

---

### 4.3 — `packages/client/src/index.ts`

Update the root barrel export:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createBeechClient } from './client.js'
export type { BeechClient, ContentResource, Listable, Single } from './client.js'
export { buildSearchParams } from './query-builder.js'
export type {
  BeechClientConfig, BeechResult, BeechProblem,
  BeechFilterOperator, ListQuery, ListMeta, FieldFilter,
} from './types.js'

export {
  BEECH_SIGNATURE_HEADER,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './webhooks/index.js'
export type {
  VerifyWebhookSignatureOptions,
  ConstructWebhookEventOptions,
} from './webhooks/index.js'
```

---

### 4.4 — `packages/client/src/webhooks/webhooks.test.ts`

Comprehensive test suite verifying all requirements:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  BEECH_SIGNATURE_HEADER,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './index.js'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'

const SECRET = 'test-secret-key-123'
const VALID_PAYLOAD = JSON.stringify({ event: 'entry.published', id: 'art_123', status: 'published' })

describe('BEECH_SIGNATURE_HEADER', () => {
  it('has the expected header name', () => {
    expect(BEECH_SIGNATURE_HEADER).toBe('x-beechcms-signature')
  })
})

describe('verifyBeechWebhookSignature', () => {
  it('returns true for signature with sha256= prefix', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature, secret: SECRET })
    expect(valid).toBe(true)
  })

  it('returns true for signature without prefix (raw hex)', async () => {
    const signatureWithPrefix = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const rawHex = signatureWithPrefix.replace('sha256=', '')
    const valid = await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: rawHex, secret: SECRET })
    expect(valid).toBe(true)
  })

  it('returns false for tampered payload', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD + 'tampered',
      signature,
      secret: SECRET,
    })
    expect(valid).toBe(false)
  })

  it('returns false for wrong secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    const valid = await verifyBeechWebhookSignature({
      payload: VALID_PAYLOAD,
      signature,
      secret: 'wrong-secret',
    })
    expect(valid).toBe(false)
  })

  it('returns false for null / undefined signature', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: null, secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: undefined, secret: SECRET })).toBe(false)
  })

  it('returns false for empty strings', async () => {
    expect(await verifyBeechWebhookSignature({ payload: '', signature: 'abc', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: '', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'abc', secret: '' })).toBe(false)
  })

  it('returns false for invalid non-hex signature string without throwing', async () => {
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'not-a-valid-hex-string', secret: SECRET })).toBe(false)
    expect(await verifyBeechWebhookSignature({ payload: VALID_PAYLOAD, signature: 'sha256=zzzz123', secret: SECRET })).toBe(false)
  })
})

describe('constructWebhookEvent', () => {
  it('successfully verifies and parses valid event', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    interface PostEvent { event: string; id: string; status: string }
    const event = await constructWebhookEvent<PostEvent>({
      payload: VALID_PAYLOAD,
      signature,
      secret: SECRET,
    })
    expect(event).toEqual({ event: 'entry.published', id: 'art_123', status: 'published' })
    expect(event.id).toBe('art_123')
  })

  it('throws WebhookVerificationError on missing secret', async () => {
    const signature = await signWebhookBody(VALID_PAYLOAD, SECRET)
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature, secret: '' }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on missing signature', async () => {
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature: null, secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('throws WebhookVerificationError on invalid signature', async () => {
    await expect(
      constructWebhookEvent({ payload: VALID_PAYLOAD, signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000', secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError)
  })

  it('surfaces SyntaxError on malformed JSON payload with valid signature', async () => {
    const invalidJsonPayload = '{"event": "broken'
    const signature = await signWebhookBody(invalidJsonPayload, SECRET)
    await expect(
      constructWebhookEvent({ payload: invalidJsonPayload, signature, secret: SECRET }),
    ).rejects.toThrow(SyntaxError)
  })
})
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Execute the following commands to validate the build, types, and test coverage:

```bash
# 1. Client package: build, typecheck, and unit tests
pnpm --filter @beechcms/client run build
pnpm --filter @beechcms/client run type-check
pnpm --filter @beechcms/client run test

# 2. Monorepo validation: ensure full build, test suite, and linting pass
pnpm run build
pnpm run test
pnpm run lint
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/client/package.json` includes `./webhooks` subpath export targeting `./dist/webhooks/index.js` and `./dist/webhooks/index.d.ts`.
- [ ] `packages/client/src/webhooks/index.ts` is implemented using exclusively standard Web Crypto (`crypto.subtle`) with zero external runtime dependencies.
- [ ] `verifyBeechWebhookSignature({ payload, signature, secret })` validates HMAC-SHA256 signatures in constant time, accepting both `sha256=<hex>` and raw `<hex>` formats, returning `false` on any validation failure without throwing.
- [ ] `constructWebhookEvent<T>({ payload, signature, secret })` validates the signature and returns parsed payload `T`, throwing `WebhookVerificationError` on signature/secret/parameter failure and letting `SyntaxError` surface naturally on malformed JSON.
- [ ] `WebhookVerificationError` extends `Error` with `name = 'WebhookVerificationError'`.
- [ ] `BEECH_SIGNATURE_HEADER` constant (`'x-beechcms-signature'`) and types (`VerifyWebhookSignatureOptions`, `ConstructWebhookEventOptions`) are exported from both `@beechcms/client/webhooks` and `@beechcms/client`.
- [ ] Legacy `verifyBeechSignature` function and file `packages/client/src/webhook.ts` are removed.
- [ ] Unit tests in `packages/client/src/webhooks/webhooks.test.ts` pass with 100% green coverage.
- [ ] `pnpm run build && pnpm run test && pnpm run lint` execute cleanly with zero errors across the monorepo.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:
- Implement timestamp tolerance windows (e.g. `tolerance: 300s`) or replay attack headers, as BeechCMS outbound webhook automation currently emits raw HMAC-SHA256 signatures over the payload without timestamp headers.
- Create framework-specific middleware adapters (Express, Fastify, Next.js route wrappers). Consumers use `verifyBeechWebhookSignature` or `constructWebhookEvent` directly in their respective route handlers.
- Add external cryptography dependencies (such as `crypto-js` or `noble-hashes`).
- Retain deprecated positional signature helper functions or backward-compatibility aliases.
- Modify server-side automation executors in `apps/api` or D1 database tables.
