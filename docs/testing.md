# Testing

BeechCMS test files belong to exactly one tier. The full binding rules — placement, anatomy,
fixtures, forbidden patterns, the review checklist — live in
[`_config/testing_conventions.md`](../_config/testing_conventions.md); this page is only a map to
that document, not a second copy of its rules.

| Tier | What is real | What may be faked | Where it lives |
|------|--------------|--------------------|-----------------|
| **unit** | the module under test, its pure collaborators | anything crossing an I/O boundary (HTTP client, D1, R2, SMTP) | next to the source file, or `<slice>/test/unit/` |
| **integration** | the full request path — Hono, every middleware, repositories, real D1 (`@cloudflare/vitest-pool-workers`) | `IClock`, `ITokenService` — nothing else | `<slice>/test/integration/` |
| **e2e** | everything, including a browser and a live API | nothing | top-level `e2e/` |

## Where a new test file goes

1. Pick the tier from the table above — a file mixing tiers is rejected at review.
2. Place it inside the slice that owns the code under test (Vertical Slice Architecture):
   `apps/api/src/features/<slice>/test/integration/*.integration.test.ts` for integration,
   co-located `*.test.ts` or `<slice>/test/unit/` for unit.
3. Build integration-tier fixtures through `@beechcms/testing` (`createTestHarness()`, the
   canonical seeds and users) — never a hand-rolled fake repository.

For everything else — the four-zone test anatomy, comment policy, naming, and the full forbidden
list — read `_config/testing_conventions.md`.

## Where a test file lives

| Kind | apps/api | apps/dashboard |
|------|----------|----------------|
| unit, subject inside a feature slice | co-located in the slice, or `src/features/<slice>/test/unit/` | `src/features/<slice>/test/unit/` |
| unit, subject outside any slice (`lib/`, `components/`, `middleware/`, `shared/`) | next to the source file | next to the source file |
| integration (real D1, `@beechcms/testing`) | `src/features/<slice>/test/integration/<name>.integration.test.ts` | — |
| crosses two or more slices | `test/flow/` | `src/test/cross-slice/` |
| e2e (browser) | top-level `e2e/` — `<flow>.e2e.ts` | ← same |

`pnpm beech lint` runs `scripts/check-test-placement.mjs`, which fails the build on a misplaced test
file or a cross-slice import from inside a slice. The rules it enforces are the normative ones in
`_config/testing_conventions.md` §0-§1; the script is their executable form, not a second source of
truth.

A test that needs two feature slices is not a slice test. It goes to the cross-slice location above —
never into one of the slices it spans, which would manufacture the cross-slice import VSA forbids.

## Running one tier

| Tier | Command | CI job | Needs Docker |
|------|---------|--------|--------------|
| unit | `pnpm beech test --tier unit` | `unit` | no |
| flow | `pnpm beech test --tier flow` | `flow` | yes (`pnpm beech dev` stack) |
| integration | `pnpm beech test --tier integration` | `integration` | no (workerd + miniflare D1) |
| e2e | `pnpm beech test --tier e2e` | `e2e` (PR→master + nightly) | no (wrangler dev + miniflare D1) |

`pnpm beech test --diff` runs the **unit and integration** tiers for the workspaces whose files
changed on the branch. The flow tier is never implicit — it costs the whole Docker stack. `--diff`
still refuses `--tier e2e`: the e2e tier is pre-merge/nightly only, never selected by a diff. Add
`--tier flow` to include the flow tier.

Tiers are declared once in `scripts/lib/test-tiers.mjs`; the vitest projects in
`apps/api/vitest.config.ts` and the CI jobs in `.github/workflows/test.yml` are its two consumers.

## Running the e2e tier

`pnpm beech test --tier e2e` boots a throwaway database (`e2e/.wrangler-e2e/`, recreated on every run),
a `wrangler dev` API on port 8799 and a Vite dashboard on port 5273, then drives Chromium against them.
It needs no Docker stack — the flow tier owns MinIO, Mailpit and the webhook tester.

Specs live in `e2e/tests/` as `<flow>.e2e.ts` and are provisioned by `e2e/tests/global.setup.ts`, which
creates the administrator, the canonical seeds and one canonical entry over HTTP using the fixtures
exported by `@beechcms/testing`. `scripts/check-test-placement.mjs` rules R6/R7 keep `*.e2e.ts` out of
the slice tree and `*.test.ts` out of `e2e/`.

The tier never runs from `--diff` and never on a push: CI runs it on pull requests targeting `master`
and nightly (`.github/workflows/e2e.yml`).

---

## Integration testing with `@beechcms/testing`

The `@beechcms/testing` package provides an in-process integration harness designed to run against real Cloudflare D1 databases inside `@cloudflare/vitest-pool-workers`. It eliminates repository mocks while keeping tests fast and deterministic.

### Core Principles

1. **Real D1 Engine**: Runs against real SQLite/D1 in Cloudflare `workerd`. Foreign keys, triggers, constraints, and JSON functions behave identically to production.
2. **Minimal Fakes**: Only `IClock` and `ITokenService` are faked. All Hono middlewares, repository layers, and validation pipelines are executed for real.
3. **Automatic D1 Provisioning**: When seeds are passed, the harness automatically runs migrations, provisions the `_beech_seeds` registry, creates content tables/indices, and resets content between runs.

---

### `createTestHarness` Options & Return Values

```ts
import { createTestHarness } from '@beechcms/testing'

const harness = await createTestHarness({
  db: env.DB,                          // Real D1 binding from cloudflare:test
  createApp: (authProviders) => ...,   // Factory returning the Hono app under test
  seeds?: readonly Seed[],             // Custom seeds/sections (defaults to CANONICAL_SEEDS)
  users?: readonly CanonicalUser[],    // Custom test users (defaults to CANONICAL_USERS)
  nowMs?: number,                      // Initial frozen epoch ms (defaults to 2026-01-01)
  env?: Record<string, unknown>,       // Additional Cloudflare environment variables
})
```

The returned `TestHarness` object exposes:

| Property / Method | Description |
|---|---|
| `harness.asUser('admin' \| 'editor' \| CanonicalUser, options?)` | Returns an authenticated `TestClient` injecting `Authorization: Bearer <token>` with specified roles and claims. Supports `{ ttlSeconds }`. |
| `harness.anonymous()` | Returns an unauthenticated `TestClient` for testing public endpoints and 401 unauthenticated access. |
| `harness.clock` | `FixedClock` instance with `.now()`, `.nowSeconds()`, `.advance(ms)`, and `.set(epochMs)` to test token expiry and time-based rules. |
| `harness.tokenService` | `FakeTokenService` for issuing or inspecting deterministic test tokens. |
| `harness.db` | Direct access to the `D1Database` instance for assertions or manual inserts. |

---

### Recipe 1: Testing a Custom Section (Seed)

To test a custom content type / section, pass your custom seed definition to `seeds`:

```ts
// apps/api/src/features/catalog/test/integration/products.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, field } from '@beechcms/core'
import { createTestHarness, UUID_V4_PATTERN, type TestHarness, type TestClient } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// Define the custom section
const productsSeed = defineSeed({
  slug: 'products',
  name: 'Products',
  fields: {
    title: field.text().required(),
    sku: field.text().required(),
    price: field.number().required(),
  },
})

describe('Custom Section: Products (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [productsSeed], // Auto-provisions D1 tables & indexes for 'products'
      createApp: (authProviders) =>
        createBeechApp({
          seeds: [productsSeed],
          authProviders,
        }),
    })
    admin = await harness.asUser('admin')
  })

  it('creates and retrieves a product entry', async () => {
    const createRes = await admin.post('/api/content/products', {
      title: 'Ergonomic Keyboard',
      sku: 'KB-001',
      price: 120,
    })

    expect(createRes.status).toBe(201)
    const { id } = await createRes.json<{ id: string }>()
    expect(id).toMatch(UUID_V4_PATTERN)

    const getRes = await admin.get(`/api/content/products/${id}`)
    expect(getRes.status).toBe(200)
    const product = await getRes.json<{ title: string; price: number }>()
    expect(product.title).toBe('Ergonomic Keyboard')
    expect(product.price).toBe(120)
  })
})
```

---

### Recipe 2: Testing Lifecycle Hooks & Business Logic

Test `beforeCreate`, `beforeUpdate`, or other lifecycle hooks configured in `BeechConfig`:

```ts
// apps/api/src/features/orders/test/integration/orders-hook.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, field } from '@beechcms/core'
import { createTestHarness, type TestHarness, type TestClient } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'

const ordersSeed = defineSeed({
  slug: 'orders',
  name: 'Orders',
  fields: {
    amount: field.number().required(),
    status: field.text().default('pending'),
  },
})

describe('Orders Lifecycle Hooks', () => {
  let harness: TestHarness
  let client: TestClient

  beforeEach(async () => {
    harness = await createTestHarness({
      db: env.DB,
      seeds: [ordersSeed],
      createApp: (authProviders) =>
        createBeechApp({
          seeds: [ordersSeed],
          hooks: {
            beforeCreate: async ({ seedSlug, data }) => {
              if (seedSlug === 'orders' && (data.amount as number) <= 0) {
                throw new Error('Order amount must be greater than zero')
              }
            },
          },
          authProviders,
        }),
    })
    client = await harness.asUser('admin')
  })

  it('rejects order creation with negative amount via beforeCreate hook', async () => {
    const res = await client.post('/api/content/orders', { amount: -50 })
    expect(res.status).toBe(500)
    const body = await res.json<{ error?: string; message?: string }>()
    expect(JSON.stringify(body)).toContain('Order amount must be greater than zero')
  })
})
```

---

### Recipe 3: Testing Custom Routes & Authorization Roles

Verify developer-defined routes with RBAC roles (`admin`, `editor`, etc.) or public unauthenticated access:

```ts
// apps/api/src/features/custom-routes/test/integration/custom-routes.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'

describe('Custom developer routes', () => {
  let harness: TestHarness

  beforeEach(async () => {
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) =>
        createBeechApp({
          seeds: [],
          customRoutes: ({ publicRouter, protectedRouter }) => {
            publicRouter.get('/hello', (c) => c.json({ message: 'public' }))
            protectedRouter.get('/secret', (c) => {
              const user = c.get('user')
              return c.json({ message: `hello ${user?.name}` })
            })
          },
          authProviders,
        }),
    })
  })

  it('allows unauthenticated access to public routes', async () => {
    const anonymous = harness.anonymous()
    const res = await anonymous.get('/api/custom/hello')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'public' })
  })

  it('rejects unauthenticated access to protected routes', async () => {
    const anonymous = harness.anonymous()
    const res = await anonymous.get('/api/custom/secret')
    expect(res.status).toBe(401)
  })

  it('allows authenticated editor access to protected routes', async () => {
    const editor = await harness.asUser('editor')
    const res = await editor.get('/api/custom/secret')
    expect(res.status).toBe(200)
    const body = await res.json<{ message: string }>()
    expect(body.message).toContain('Editor')
  })
})
```

---

### Recipe 4: Testing Token Expiry & Time Manipulation with `FixedClock`

```ts
it('rejects requests when the JWT token has expired', async () => {
  // Issue a token valid for 60 seconds
  const client = await harness.asUser('admin', { ttlSeconds: 60 })

  const validRes = await client.get('/api/content/posts')
  expect(validRes.status).toBe(200)

  // Advance clock forward by 61 seconds
  harness.clock.advance(61 * 1000)

  const expiredRes = await client.get('/api/content/posts')
  expect(expiredRes.status).toBe(401)
})
```

