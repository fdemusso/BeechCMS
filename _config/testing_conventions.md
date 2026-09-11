# Testing Conventions (Reference Layer 3)

Binding rules for every test written in this monorepo. A test that violates a MUST here is a blocking
review finding, the same as a failing assertion. These rules are derived from the idiom already present
in `apps/api/test/flow-*.test.ts`, `apps/api/src/**/*.test.ts` and `apps/dashboard/src/**/*.test.ts` —
they codify what the codebase already does well and forbid what it does inconsistently.

---

## 0. Tiers — pick one before writing a line

A test file belongs to exactly ONE tier. Mixing tiers in one file is forbidden: it makes the file
impossible to select in CI and impossible to reason about.

| Tier | What is real | What may be faked | Where it lives |
|------|--------------|-------------------|----------------|
| **unit** | the module under test, its pure collaborators | anything crossing an I/O boundary (HTTP client, D1, R2, SMTP) | next to the source file, or `<slice>/test/unit/` |
| **integration** | the full request path: Hono, every middleware, repositories, real D1 | `IClock`, `ITokenService` — nothing else | `<slice>/test/integration/` |
| **e2e** | everything, including a browser and a live API | nothing | top-level `e2e/` |

**Rule 0.1 (MUST)** — An integration test never constructs a fake repository. If a test needs
`StaticContentRepository` or any `vi.fn()` object standing in for storage, it is a unit test and must
say so by living in the unit tier.

**Rule 0.2 (MUST)** — A unit test never touches D1, the network, the filesystem, or the Docker stack.
If it needs any of those, it is an integration test.

**Rule 0.3 (MUST)** — The two faked services in the integration tier are `IClock` and `ITokenService`,
and they are faked because deterministic time and deterministic auth expiry are untestable otherwise.
`IIdGenerator` stays **real**: production mints entry ids with `context.get('idGenerator').uuid()`, and
faking it reintroduces the ID-shape defect class this whole testing effort exists to kill.

---

## 1. File placement, header, naming

**Rule 1.1 (MUST)** — Test file placement mirrors Vertical Slice Architecture. A test for code in slice
`X` lives inside slice `X`. It never reaches into a sibling slice — not for a helper, not for a fixture.
Shared test material goes to `@beechcms/testing`, exactly as shared production logic goes to
`@beechcms/core`.

**Rule 1.2 (MUST)** — Every test file opens with the SPDX header, byte-identical to the rest of the repo:

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
```

A `// @vitest-environment node` pragma, when needed, goes on line 1, above the header.

**Rule 1.3 (MUST)** — Filenames: `<subject>.test.ts` for unit, `<subject>.integration.test.ts` for
integration, `<flow>.e2e.ts` for e2e. `<subject>` is the module or symbol under test, not a ticket
number and not a sprint name.

**Rule 1.4 (MUST)** — `describe()` names the subject, not the scenario:
- unit: the exported symbol — `describe('resolveRouteRule', …)`, `describe('fetchGlobalDrafts', …)`
- integration: the slice and tier — `describe('content slice — integration (real D1)', …)`
- nested `describe()` names a route or a method — `describe('GET /api/content/:slug', …)`

**Rule 1.5 (MUST)** — `it()` states the observable behaviour AND its expected outcome, in one sentence,
without the word "should". Write the outcome, not the intention.

```ts
// NO  — intention, unfalsifiable, tells a reviewer nothing
it('should test permissions', …)
it('works correctly', …)

// YES — behaviour + outcome, readable as a spec line in a failure report
it('an unmapped path under apiProtected receives 403 route_not_registered', …)
it('deactivating the account turns every prior 200 into 403 account_disabled', …)
it('propagates errors', …)
```

**Rule 1.6 (MUST)** — One `it()` proves one behaviour. Asserting a matrix of related cases in a single
`it()` is allowed ONLY when the cases share one cause and one arrangement (an RBAC permission matrix,
a validation table); in that case drive it from an array so the intent stays visible, and keep the
`it()` name a statement about the whole matrix.

---

## 2. Anatomy — four zones, always in this order

Every `it()` body is written in four zones, in order, separated by ONE blank line. Zones are never
interleaved. If a test needs to arrange again after acting, it is two tests.

```ts
it('rejects an entry whose required branch is missing', async () => {
  // 1. ARRANGE — state this test needs on top of the suite baseline
  const admin = await harness.asUser('admin')

  // 2. ACT — exactly one action under test
  const response = await admin.post('/api/content/posts', { slug: 'no-title' })

  // 3. ASSERT RESPONSE — the contract the caller sees
  expect(response.status).toBe(422)
  const body = await response.json<{ error: string; field?: string }>()
  expect(body.field).toBe('title')

  // 4. ASSERT STATE — what the system actually persisted (integration tier only)
  const row = await harness.db.prepare('SELECT COUNT(*) AS n FROM content_posts').first<{ n: number }>()
  expect(row?.n).toBe(0)
})
```

**Rule 2.1 (MUST)** — Exactly one ACT per `it()`. Setup calls that happen to be HTTP requests (creating
the entry you are about to delete) belong in ARRANGE, not ACT. If you cannot name the single action the
test is about, the test has no subject.

**Rule 2.2 (MUST)** — The ACT result is assigned to a named variable (`response`, `result`, `created`),
never asserted inline. `expect((await client.get(path)).status).toBe(200)` is permitted ONLY inside a
matrix loop (Rule 1.6), where naming each result would obscure the table.

**Rule 2.3 (SHOULD)** — Do not write `// ARRANGE` / `// ACT` / `// ASSERT` comments. The blank-line
structure carries it. Comments are reserved for the reasons in §5.

---

## 3. Zone 1 — environment setup

### 3.1 Baseline in `beforeEach`, deltas in the test

**Rule 3.1 (MUST)** — `beforeEach` builds the baseline shared by every test in the `describe`: the
harness (or the subject under test), canonical seeds, canonical users. Anything only one test needs is
arranged inside that test. A `beforeEach` that arranges state used by two of nine tests is misplaced
setup and hides the real precondition from the reader.

**Rule 3.2 (MUST)** — Fresh state per test. `beforeEach`, never `beforeAll`, for anything mutable.
`beforeAll` is permitted only for immutable, expensive, read-only material (a compiled schema, a
precomputed bcrypt hash).

**Rule 3.3 (MUST)** — No cross-test ordering dependency. Every `it()` must pass when run alone
(`vitest run -t '<name>'`). Test A never consumes state test B created.

### 3.2 Integration tier setup

**Rule 3.4 (MUST)** — Integration suites build their world through the harness, never by hand:

```ts
beforeEach(async () => {
  __resetSeedRegistryCache()               // per-isolate seed cache — required before each app build
  harness = await createTestHarness({
    db: env.DB,                            // real D1 from cloudflare:test
    createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
  })
  admin = await harness.asUser('admin')
})
```

**Rule 3.5 (MUST)** — Fixture data comes from the canonical seeds and canonical entities exported by
`@beechcms/testing`. Hand-rolled fixture objects are permitted for exactly one purpose: feeding
deliberately malformed input to a validation or rejection test. Inventing an id, an entity shape, or a
field name that the canonical set already covers is a blocking finding — that is the precise mechanism
by which the shipped ID-format bug passed a green suite.

**Rule 3.6 (MUST)** — Entity ids in fixtures carry the production format (UUIDv4 for content entries),
and tests assert the format via the exported pattern rather than a literal:

```ts
expect(created.id).toMatch(UUID_V4_PATTERN)   // YES — the format is the contract
expect(created.id).toBe('p_001')              // NO  — a shape production never emits
```

**Rule 3.7 (MUST)** — Content storage is provisioned through the Botanical Engine
(`planCreateSeed()`) and the real migrations. A test never writes `CREATE TABLE content_*` and never
names a physical column that a Branch ID (`br_XX`) already addresses.

**Rule 3.8 (SHOULD)** — Seed rows through the real route when a route exists (`POST /api/content/:slug`),
and by direct SQL only for structural tables with no engine representation (`users`, `roles`,
`user_role_assignments`). Seeding through the route exercises `apiToDb` on the way in, so a fixture can
never be a shape the API itself would reject.

### 3.3 Unit tier setup

**Rule 3.9 (MUST)** — `vi.mock()` factories sit at the top of the file, above the imports that consume
them, as they already do in `apps/dashboard/src/features/**`. Mock reset is explicit:
`beforeEach(() => vi.clearAllMocks())`.

**Rule 3.10 (MUST)** — Mock only the boundary the module talks to (`@/lib/api`, the HTTP client, the
repository interface). Never mock the module under test, and never mock a pure function — call it.

**Rule 3.11 (MUST)** — No `vi.useFakeTimers()` and no patched global `Date` for time control. Inject
`FixedClock` from `@beechcms/testing`. Time is a dependency in this codebase, not an ambient global;
`IClock` exists precisely so tests never reach for timer mocks.

### 3.4 Shared helpers

**Rule 3.12 (SHOULD)** — Repeated multi-step arrangement inside one file becomes a named local function
(`login()`, `authed(path, method, token)`), declared inside the `describe` — the idiom already used by
`flow-rbac-enforcement.test.ts`. When a second file needs the same helper, it moves to
`@beechcms/testing`; it is never imported across slices or from another test file.

---

## 4. Zone 2 — the act

**Rule 4.1 (MUST)** — Integration tests call the system the way a client does: through the HTTP surface,
via the harness client (`admin.get(...)`, `admin.post(path, body)`). They never call a handler function
directly and never reach into a repository to perform the action under test — doing so skips the
middleware chain, which is most of what an integration test exists to cover.

**Rule 4.2 (MUST)** — Authentication happens through `harness.asUser({ role })`. No hand-signed JWTs, no
`POST /auth/login` round-trip for the sole purpose of obtaining a token, no `Authorization` header
assembled by hand. (A test *about* the login route is the obvious exception: there, login is the ACT.)

**Rule 4.3 (MUST)** — The act carries no assertions. Anything asserted before the act is a precondition
and belongs in ARRANGE; if a precondition is worth asserting, assert it there, in one line.

---

## 5. Zone 3 & 4 — response and state assertions

**Rule 5.1 (MUST)** — Assert the status code first and explicitly, before touching the body. A body
assertion on an unexpected status produces an unreadable failure; a status assertion names the problem.

**Rule 5.2 (MUST)** — Type the parsed body at the call site — `await response.json<{ id: string }>()` —
as the existing suites do. `any` in a test is a blocking finding, the same as in production code.

**Rule 5.3 (MUST)** — Assert the contract, not the implementation. Assert the fields the caller depends
on, their shape, and the error code. Do not assert incidental ordering, whitespace, generated
timestamps, or the full object by deep-equality when only three fields matter — `toMatchObject` for
partial contracts, `toEqual` when the whole shape genuinely is the contract.

**Rule 5.4 (MUST)** — An error-path test asserts the machine-readable error identity (status + error
code/field), never the human-readable message text. Messages are copy; codes are contract.

**Rule 5.5 (MUST)** — A test that writes MUST also assert what was persisted (zone 4). A 201 proves the
handler answered; it does not prove the row exists, the relation was written, or the draft table stayed
untouched. Read state back through the API or through D1, and assert it.

**Rule 5.6 (MUST)** — A negative test asserts that nothing changed. A rejected write is only proven by
a count that stayed at zero.

**Rule 5.7 (MUST)** — Every `expect` is falsifiable and specific. `expect(body).toBeTruthy()` on an
object, `expect(x).toBeDefined()` as the sole assertion, or an `it()` whose only assertion is the
absence of a thrown error are all findings — they pass against broken behaviour.

**Rule 5.8 (MUST)** — Assert on the thing itself, not on a mock's bookkeeping, whenever the thing is
reachable. `expect(api.get).toHaveBeenCalledWith('/content/drafts')` is correct in a unit test whose
subject IS the request construction; it is wrong in an integration test, where the real response is
available.

**Rule 5.9 (SHOULD)** — Prefer one strong assertion over five weak ones. Three `expect`s that each
constrain a different axis of the contract beat ten that re-check the same field.

---

## 6. Comments

**Rule 6.1 (MUST)** — Comments explain **why**, never **what**. The `what` is the code; if the code is
unclear, rename the variable instead of narrating it.

```ts
// NO — narration, decays the moment the line changes
// create a new database and seed the users
db = new D1TestDatabase()

// YES — a non-obvious coupling a future reader cannot deduce from this file
// The role assignment repository decay-filters scopes against the D1 `seeds` table
// (not the in-memory seed registry `createBeechApp` uses), so the scope this test
// assigns to must have a matching active row there.
await db.prepare(`INSERT INTO seeds (slug, definition, status) VALUES ('posts', '{}', 'active')`).run()
```

**Rule 6.2 (MUST)** — A comment is required, not optional, in four cases:
1. **Non-obvious coupling** — setup that exists only because of a mechanism living elsewhere.
2. **A magic value** — why `16 * 60 * 1000`, why this specific status, where the constant comes from.
3. **A deliberate omission** — an assertion or case intentionally not covered here, and where it IS
   covered. (`// Upload path needs R2; covered in the forks tier by flow-media-assets.test.ts`)
4. **A regression guard** — the defect the test exists to prevent, so nobody "simplifies" it away.
   Name the mechanism, not a ticket number alone.

**Rule 6.3 (MUST)** — Comments are English, sentence-cased, above the line they explain. No commented-out
code. No `// TODO` without an owner and a reason — an untracked TODO in a test is deleted at review.

**Rule 6.4 (SHOULD)** — A file-level docblock under the SPDX header is appropriate when the suite's
scope is not obvious from its path: what flow it covers, what it deliberately does not, and which tier
it belongs to. Two to five lines. It is not a changelog and carries no sprint names.

**Rule 6.5 (MUST NOT)** — No `// ARRANGE` / `// ACT` / `// ASSERT` labels, no decorative banners, no
restating the `it()` name as the first line of its own body.

---

## 7. Forbidden, always

1. `any` in a test file, in a parsed body, or in a helper signature.
2. Sleeping (`await new Promise(r => setTimeout(r, …))`) to wait for something. Await the thing.
3. `vi.useFakeTimers()` / patched global `Date` — inject `FixedClock`.
4. Conditional assertions (`if (res.status === 200) expect(...)`). A branch in a test means two tests
   or a test that does not know what it expects.
5. `try/catch` around the act to "handle" a failure. Assert the rejection: `await expect(fn()).rejects.toThrow(...)`.
6. `it.skip` / `describe.skip` / `it.only` committed to the branch.
7. Randomness or `Date.now()` in fixture data — non-deterministic tests are worse than no tests.
8. Asserting on log output as a substitute for asserting on behaviour.
9. Snapshot tests of API responses. Snapshots record what the code does today, including its bugs; this
   codebase asserts contracts explicitly. (DOM snapshots of a presentational component are the one
   accepted use, and only when the rendered markup IS the contract.)
10. Editing a test to make failing code pass. If the test was right, fix the code; if the test was
    wrong, say so in the PR and explain what the correct expectation is.

---

## 8. Review checklist

A reviewer walks this list on every test file in a diff. Any `MUST` violation is blocking.

- [ ] Exactly one tier; placement matches the tier and the owning slice.
- [ ] SPDX header present; filename and `describe`/`it` names follow §1.
- [ ] Four zones, in order, one act per test, act result named.
- [ ] `beforeEach` holds the baseline only; per-test preconditions live in their test.
- [ ] Every test passes in isolation; no ordering dependency.
- [ ] Integration: real repositories, real middleware, real D1; only `IClock`/`ITokenService` faked.
- [ ] Fixtures are canonical; ids carry the production format; no hand-rolled shape that canonical data
      already covers (except deliberate malformed input).
- [ ] Status asserted first; body typed; contract asserted, not implementation.
- [ ] Every write asserts persisted state; every rejection asserts that nothing changed.
- [ ] No weak assertions; no conditional assertions; nothing from §7.
- [ ] Comments explain why; the four required cases in §6.2 are covered; no narration.

---

## 9. Templates

### 9.1 API integration (harness, real D1)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier.
 * Covers the protected CRUD surface against real D1 through the full middleware chain.
 * Upload paths need R2 and stay in the forks tier (apps/api/test/flow-media-assets.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, UUID_V4_PATTERN, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  describe('POST /api/content/:slug', () => {
    it('mints an entry id in the format the dashboard round-trips', async () => {
      const response = await admin.post('/api/content/posts', { title: 'New', slug: 'new-post' })

      expect(response.status).toBe(201)
      const { id } = await response.json<{ id: string }>()
      expect(id).toMatch(UUID_V4_PATTERN)

      // The regression guard: the minted id must address the entry it just created.
      // A test-only id format made this pass while production 404'd.
      expect((await admin.get(`/api/content/posts/${id}`)).status).toBe(200)
    })
  })
})
```

### 9.2 API unit

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { resolveRouteRule } from './permission.middleware'

describe('resolveRouteRule', () => {
  it('returns null for a path no rule covers, so the caller can fail closed', () => {
    const rule = resolveRouteRule('GET', '/api/not-a-route')

    expect(rule).toBeNull()
  })
})
```

### 9.3 Dashboard unit

```ts
// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }))

import { api } from "@/lib/api"
import { fetchGlobalDrafts } from "./drafts.api"

describe("fetchGlobalDrafts", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requests /content/drafts and returns the payload unchanged", async () => {
    const drafts = [{ id: "d1", seedSlug: "posts", displayName: "My Post", updated_at: 1000 }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: drafts })

    const result = await fetchGlobalDrafts()

    expect(api.get).toHaveBeenCalledWith("/content/drafts")
    expect(result).toEqual(drafts)
  })
})
```

Quote style follows the workspace: single quotes in `apps/api` and `packages/*`, double quotes in
`apps/dashboard`. Do not reformat a file you are only adding a test to.
