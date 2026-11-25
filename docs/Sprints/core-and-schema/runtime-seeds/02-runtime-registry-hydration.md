# Runtime Seeds — Sprint 02: Runtime Registry Hydration

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 01** (`seeds`/`seed_meta` tables, `ISeedRepository`,
> `D1SeedRepository` wired into the context). Read [`00-overview.md`](./00-overview.md).

## 0. Role & ground rules

Senior TypeScript engineer on the Beech CMS monorepo. Workers runtime, repository
pattern, additive-only, docs English, tests required. Critically:

> **`ISeedRegistry` must stay synchronous.** 31 call sites read `c.get('seedRegistry')`
> and `c.get('getSeed')(slug)` synchronously. This sprint changes *where the instance
> comes from*, not its interface. No handler becomes async.

## 1. What this sprint builds

Flip the registry from a compile-time, factory-closure singleton to a **per-request,
D1-hydrated instance**, cached across requests within an isolate and invalidated across
isolates via the `registry_version` token.

Concretely:

1. A new middleware `apps/api/src/middleware/seed-registry.middleware.ts` that, on each
   request: reads `registry_version`; if its isolate-local cache matches and is within
   TTL, reuses the cached `SeedRegistry` + `backrefMap`; otherwise loads
   `seedRepository.listActive()`, builds a fresh `SeedRegistry` and `backrefMap`, caches
   them keyed by version, and injects all three context vars (`seedRegistry`, `getSeed`,
   `backrefMap`).
2. `factory.ts`: remove the factory-closure seed injection; register the new middleware
   instead. `createBeechApp` no longer needs `seeds` to function (keep the param for
   test injection / back-compat, but it is no longer the runtime source).
3. `index.ts`: **stop** `await import('../seed.ts')` at module load. Pass no seeds (or an
   empty array) to `createBeechApp`. The cron `scheduled` handler hydrates from D1 too.
4. A small isolate-level cache module so the middleware and the cron path share one
   implementation.

After this sprint, a seed inserted directly into the `seeds` table (e.g. by the sprint-04
CLI) is visible to the running worker **without redeploy** — on the next request whose
isolate sees a bumped (or uncached) version token.

## 2. The current wiring (what you are replacing)

`apps/api/src/factory.ts` (lines ~98–115):

```ts
export function createBeechApp(config: BeechConfig): Hono<…> {
  const seedsArray = Array.isArray(config.seeds) ? config.seeds : Object.values(config.seeds)
  const validSeeds = seedsArray.filter(s => s && typeof s === 'object' && 'slug' in s)
  const seedRegistry = new SeedRegistry(validSeeds)
  const backrefMap = buildBackrefMap(validSeeds)

  const app = new Hono<…>()

  app.use('*', async (context, next) => {
    context.set('getSeed', (slug: string) => seedRegistry.get(slug))
    context.set('seedRegistry', seedRegistry)
    context.set('backrefMap', backrefMap)
    await next()
  })

  app.use('*', repositoryMiddleware({ … }))   // sets seedRepository (sprint 01)
  …
}
```

`apps/api/src/index.ts` (lines ~12–25):

```ts
let seeds: any[] = []
try {
  const mod = await import('../seed.ts')
  const registry = mod.default || mod.SEED_REGISTRY || mod
  seeds = (typeof registry === 'object' && !Array.isArray(registry)) ? Object.values(registry) : registry
} catch (e) { /* fallback if seed.ts missing */ }
const app = createBeechApp({ seeds })
```

And the cron handler (lines ~51–76) builds `new SeedRegistry(validSeeds)` from those
same compile-time seeds.

## 3. The isolate cache + token

Create `apps/api/src/shared/seed-registry-cache.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
import { SeedRegistry, buildBackrefMap, type ISeedRegistry, type BackrefMap, type Seed, type ISeedRepository } from '@beechcms/core'

interface CachedRegistry {
  version: number
  builtAt: number
  registry: ISeedRegistry
  backrefMap: BackrefMap
}

// Module-level = isolate-level. Survives across requests on the same isolate,
// re-initialised on cold start. Each isolate independently re-hydrates when the
// version token it reads no longer matches what it built.
let cache: CachedRegistry | null = null

// Soft TTL: even if the token read is skipped/failed, never serve a build older than
// this. Keeps a stale isolate from drifting indefinitely. 5s is well under the worker
// isolate lifetime and cheap relative to a D1 round-trip.
const TTL_MS = 5_000

/**
 * Returns a fresh-enough { registry, backrefMap }. Reads the version token (one cheap
 * indexed D1 read); rebuilds from listActive() only when the token changed or the TTL
 * lapsed. The token read is the steady-state cost; the full rebuild is rare.
 */
export async function getHydratedRegistry(repo: ISeedRepository): Promise<{ registry: ISeedRegistry; backrefMap: BackrefMap }> {
  const version = await repo.getRegistryVersion()
  const now = Date.now()
  if (cache && cache.version === version && now - cache.builtAt < TTL_MS) {
    return { registry: cache.registry, backrefMap: cache.backrefMap }
  }
  const seeds = await repo.listActive()
  return rebuild(seeds, version, now)
}

function rebuild(seeds: Seed[], version: number, now: number) {
  // SeedRegistry's constructor throws on invalid branch ids / reserved aliases.
  // Definitions are validated before they ever reach the DB (sprint 01/03), so this
  // should not throw in practice; if it does, fail loudly — a corrupt registry must
  // not be silently served.
  const registry = new SeedRegistry(seeds)
  const backrefMap = buildBackrefMap(seeds)
  cache = { version, builtAt: now, registry, backrefMap }
  return { registry, backrefMap }
}

/** Test seam: drop the isolate cache. */
export function __resetSeedRegistryCache(): void { cache = null }
```

> **Why a version token instead of just TTL?** TTL alone means up to `TTL_MS` of
> staleness after every write on every isolate. The token lets a just-written change
> propagate as soon as each isolate next reads the token (≤ one request) while keeping
> the steady-state cost at one tiny indexed read. Sprint 03/04 call
> `bumpRegistryVersion()` after every write.

> **Trade-off acknowledged:** there is still a ≤ `TTL_MS` window where an isolate that
> already cached version N serves N even if the token moved to N+1, because we gate the
> token re-read behind nothing — actually we read the token every request, so the only
> staleness is between the token read and a concurrent write. This is acceptable for a
> CMS admin surface. Do not add cross-isolate signalling (Durable Objects / KV) in this
> sprint; it is out of scope.

## 4. The middleware

Create `apps/api/src/middleware/seed-registry.middleware.ts`:

```ts
// SPDX-License-Identifier: BUSL-1.1
import { createMiddleware } from 'hono/factory'
import type { Env, Variables } from '../types'
import { getHydratedRegistry } from '../shared/seed-registry-cache'

/**
 * Hydrates the seed registry from D1 and injects seedRegistry, getSeed, and backrefMap
 * into the context. Must run AFTER repositoryMiddleware (needs seedRepository) and
 * BEFORE any handler that reads the registry.
 */
export const seedRegistryMiddleware = () =>
  createMiddleware<{ Bindings: Env; Variables: Variables }>(async (context, next) => {
    const { registry, backrefMap } = await getHydratedRegistry(context.get('seedRepository'))
    context.set('seedRegistry', registry)
    context.set('getSeed', (slug: string) => registry.get(slug))
    context.set('backrefMap', backrefMap)
    await next()
  })
```

## 5. Rewire `factory.ts`

- Delete the closure that builds `seedRegistry`/`backrefMap` from `config.seeds` and the
  `app.use('*', …)` block that sets `getSeed`/`seedRegistry`/`backrefMap`.
- Keep `repositoryMiddleware(...)` as the **first** middleware (it sets `seedRepository`).
- Register `seedRegistryMiddleware()` **immediately after** `repositoryMiddleware` and
  before `storageMiddleware`/auth/routes. Final order:

  1. `repositoryMiddleware`  *(sets `seedRepository`, etc.)*
  2. `seedRegistryMiddleware`  *(NEW — reads `seedRepository`, sets registry/getSeed/backrefMap)*
  3. `storageMiddleware`
  4. `authProvidersMiddleware`
  5. `rateLimiterMiddleware`
  6. `observabilityMiddleware`
  7. CORS, security headers, analytics, routes (unchanged)

- `createBeechApp(config)` keeps its signature for back-compat and tests, but
  `config.seeds` is **no longer wired into request handling**. Remove the
  `buildBackrefMap(validSeeds)` / `new SeedRegistry(validSeeds)` factory-time calls.
  (Leave the imports only if still used elsewhere; otherwise remove them.)

> Test injection note: some existing API tests pass `seeds` to `createBeechApp` and
> expect them served. Those tests must instead seed the in-memory D1 `seeds` table (or
> override `seedRepository`). Update the shared test harness so a helper inserts the
> fixture seeds into D1 / a stub `ISeedRepository`. Provide a stub
> `InMemorySeedRepository` in the API test utils that returns a fixed `listActive()` and
> a static version — simplest path for the many content tests. Keep `__resetSeedRegistryCache()`
> called in test `beforeEach` so isolate cache never leaks between cases.

## 6. Rewire `index.ts`

Replace the top-of-module `seed.ts` import block with nothing — the worker no longer
reads `seed.ts`:

```ts
import { createBeechApp } from './factory'
// (drop: SeedRegistry import if only used for the old cron path; keep what cron still needs)
const app = createBeechApp({ seeds: [] })
app.get('/', (c) => c.text('Beech API is running'))
```

Remove `validSeeds` and the compile-time `seeds` variable. Keep the dev-only
MinIO/Mailpit health pings.

### Cron handler

The `scheduled(controller, env, ctx)` handler currently builds
`new SeedRegistry(validSeeds)` from compile-time seeds. Change it to hydrate from D1:

```ts
async scheduled(controller, env, ctx) {
  const scheduledTime = controller?.scheduledTime ?? Date.now()
  if (!env.DB) { console.warn('[cron] D1 binding missing. Skipping.'); return }

  const automationRepository = new D1AutomationRepository(env.DB)
  const contentRepository = new D1ContentRepository(env.DB)
  const seedRepository = new D1SeedRepository(env.DB)          // NEW
  const seeds = await seedRepository.listActive()              // NEW
  const registry = new SeedRegistry(seeds)                     // built from D1
  const getSeed = (slug: string) => registry.get(slug) ?? null

  ctx.waitUntil(runCronAutomations({ automationRepository, contentRepository, getSeed, env, idGenerator: SystemIdGenerator }, scheduledTime))
}
```

(Import `D1SeedRepository` from `./shared/seed.repository.d1`. `scheduled` may be async
and await the load before `waitUntil` — there is no per-request sync constraint here.)

## 7. Empty-registry behaviour

On a brand-new DB with no seeds loaded yet, `listActive()` returns `[]` and the registry
is empty. This is fine and must not crash: `GET /api/schema` returns `[]`, the dashboard
sidebar shows no content types, content routes for any slug return the existing
"seed not found" path. Verify the setup wizard and `/auth/*` still work with zero seeds
(they do not depend on the registry). Add a test for the empty-registry case.

## 8. Tests

- `apps/api/src/shared/seed-registry-cache.test.ts` — with a stub `ISeedRepository`:
  first call rebuilds (asserts `listActive` called once); second call with same version
  within TTL reuses (no second `listActive`); after `bumpRegistryVersion` (stub returns
  a higher version) the next call rebuilds. Reset cache between cases.
- `apps/api/src/middleware/seed-registry.middleware.test.ts` — middleware sets all three
  context vars; `getSeed(slug)` resolves a seed present in the stub.
- Update the API content/public/widget test harness to provision seeds via D1 / stub
  repo instead of `createBeechApp({ seeds })`. All previously-passing content tests must
  still pass.
- Empty-registry test: `GET /api/schema` → `200 []`; a content GET for an unknown slug →
  the existing not-found response.
- Cron test (if one exists) updated to hydrate from the stub repo.

## 9. Acceptance criteria

- [ ] `pnpm run build` + `pnpm run test` pass.
- [ ] `index.ts` no longer imports `seed.ts`; grep for `seed.ts` in `apps/api/src` is clean.
- [ ] No handler signature changed; `ISeedRegistry` is still synchronous.
- [ ] Inserting a row into `seeds` (active) makes it appear in `GET /api/schema` on the
      next request — no redeploy. (Manual check or integration test against local D1.)
- [ ] Middleware order is exactly: repository → **seedRegistry** → storage → auth →
      rateLimit → observability.
- [ ] Empty DB (no seeds) does not crash; setup + auth still work.

## 10. Do NOT

- Do not introduce KV / Durable Objects for cross-isolate signalling (out of scope).
- Do not make the registry interface async.
- Do not add CRUD endpoints (sprint 03).
- Do not delete `seed.ts` from the example project — sprint 04 redefines its role.
- Do not emit any DDL here.
