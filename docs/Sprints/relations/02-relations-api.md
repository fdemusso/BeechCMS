You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 2 of 4** for the introduction of the native `relation` field type.
Sprint 1 already shipped: `BranchType` includes `'relation'`, the Botanical Engine
emits FK / indexes, and `sortSeedsByDependencies` is exported from
`@beechcms/core`. This sprint wires the relation type into the **API**: validation,
content repository projections, error mapping, and a first canonical Seed that uses
the new type end-to-end (excluding the UI, which is Sprint 4).

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), RFC 7807 error envelope
  (`application/problem+json`)
- Shared: `@beechcms/core` (pure TS)
- Validation: Zod v4
- Tests: Vitest, `better-sqlite3` D1 test database

==========================================================================
SECTION 1 — RELEVANT FILES
==========================================================================

packages/core/src/
  types.ts            -- `Branch` already has `targetSeed`, `onDelete` (Sprint 1).
  validation.ts       -- Zod builder. Currently switches on `branch.type` and returns
                         a Zod schema per type. Extend the switch with a `'relation'`
                         case. EXISTING — do not rewrite, just extend.
  seeds.ts            -- canonical `SEED_REGISTRY`. Will gain one relation branch on
                         the existing `articles` seed (or equivalent) — see Step 4.
  content.repository.ts -- ContentRepository interface; do not touch the interface
                         in this sprint. Drafts and CRUD already work transparently
                         for any TEXT column.

apps/api/src/
  features/content/   -- Content CRUD handlers. The PUT/POST handlers funnel through
                         a single validation step backed by `@beechcms/core`. The
                         RFC 7807 mapper lives in `shared/problem.ts` (or equivalent
                         existing module — find it once and reuse).
  shared/             -- error mapping helpers, D1 wrappers.

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. `validation.ts` validates relation values:
   - Must be a non-empty string.
   - Must match the BeechCMS id shape: a UUID v4 OR the project's internal id format.
     Use the SAME regex/util the existing `id` field validation uses — DO NOT invent
     a second source of truth.
   - May be `null` if the branch is not `required`.
2. A new Seed branch of `type: 'relation'` is added to `SEED_REGISTRY` (Step 4),
   producing a real DDL output that Sprint 3 can pick up for migration.
3. The content list endpoint returns relation columns as plain id strings under
   their alias (no change needed if columns are read transparently — verify).
4. SQLite FK errors raised on INSERT / UPDATE / DELETE are translated into
   RFC 7807 `Problem+JSON` responses with a meaningful `type`, `title`,
   `detail`, and HTTP status:
   - `ON DELETE RESTRICT` violation → `409 Conflict`, type
     `https://beechcms.dev/problems/relation-in-use`.
   - Insert/update referencing a non-existent parent → `422 Unprocessable Entity`,
     type `https://beechcms.dev/problems/relation-target-not-found`.
   - Generic FK violation fallback → `409 Conflict`, type
     `https://beechcms.dev/problems/foreign-key-violation`.
5. End-to-end integration test: create a `team` member, create an `article`
   referencing it, attempt to delete the team member, expect 409, switch to
   `SET NULL`, repeat, expect 204 and the article's `author_id` to be `NULL`.

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Extend `IIdGenerator` with `isValid()` and consume in validation
File: packages/core/src/id-generator.ts (extend interface + Production impl)
      packages/core/src/validation.ts   (consume via injected generator)
--------------------------------------------------------------------------

Design principle (per project owner): id generation AND id validation must
both live behind the `IIdGenerator` abstraction so that swapping the
implementation in the future (e.g. ULIDs, KSUIDs, slug-style) requires
changing exactly one file and zero call sites.

Confirmed via direct read: `@beechcms/core/id-generator.ts` currently exposes
only `IIdGenerator.uuid()` + `SystemIdGenerator`. No validation primitive.

Action:

1. Extend the interface and the production singleton:

```ts
export interface IIdGenerator {
  /**
   * Generates a new id. Production: crypto.randomUUID().
   * Tests: deterministic sequence.
   */
  uuid(): string

  /**
   * Returns true when `value` has the exact shape produced by `uuid()`.
   * The ONLY place in the codebase that knows the id format. Never inline
   * a regex; always go through this method when validating a relation id,
   * a route param, or any user-supplied id.
   */
  isValid(value: unknown): value is string
}

const SYSTEM_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SystemIdGenerator: IIdGenerator = {
  uuid: () => crypto.randomUUID(),
  isValid: (value): value is string =>
    typeof value === 'string' && SYSTEM_ID_REGEX.test(value),
}
```

The regex is INTERNAL to this file — never exported. Callers depend on the
interface, not on the shape.

2. Test-mode generator: extend whatever deterministic generator is used in
   the test harness (search for `IIdGenerator` implementations) so that
   `isValid()` returns true exactly for the sequence its `uuid()` emits.
   This keeps tests honest without leaking the regex into test code.

3. In `packages/core/src/validation.ts`, the validator already receives
   dependencies through its compile function — locate the existing
   signature and add `idGenerator: IIdGenerator` as a new dependency
   (if not already injected). Then add the `'relation'` case:

```ts
case 'relation': {
  return z
    .string()
    .refine(value => idGenerator.isValid(value), {
      message: 'Invalid relation id format',
    })
}
```

If `validation.ts` does NOT currently take dependencies, accept the
generator as the second argument of the affected exported function and
update its single call site (the API factory or middleware that wires
the validator) to pass `SystemIdGenerator`. Do NOT import `SystemIdGenerator`
directly inside `validation.ts` — keep core pure.

Honour the same `branch.required`, `branch.nullable` flags the other branch types
already respect — match the existing pattern verbatim. If the branch is optional,
wrap the schema in `.nullable().optional()`.

Add unit tests in `packages/core/src/validation.test.ts`:

1. A valid id passes the relation schema.
2. An empty string fails.
3. A non-id-shaped string (`"hello"`) fails.
4. `null` passes when `required: false`.
5. `null` fails when `required: true`.

--------------------------------------------------------------------------
STEP 2 — RFC 7807 error mapping for FK violations
File: apps/api/src/shared/problem.ts  (or the existing problem-mapper module)
--------------------------------------------------------------------------

Locate the existing helper that turns thrown errors into Problem+JSON. Add a
branch that inspects D1 / SQLite errors:

```ts
// Cloudflare D1 surfaces SQLite errors via `error.message` strings such as:
//   "D1_ERROR: FOREIGN KEY constraint failed"
// and via `error.cause?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` on some runtimes.
// Inspect both to remain runtime-agnostic.
```

Map the result into one of the three problem types listed in Section 2.4.
The mapper must distinguish:

- A *delete* operation that failed FK → `relation-in-use` (409).
- An *insert/update* that failed FK → `relation-target-not-found` (422).
- Anything else FK-related → `foreign-key-violation` (409).

Pass the current HTTP method down to the mapper from the handler, since SQLite
itself does not tell us which operation triggered the constraint.

The Problem object MUST include:
- `type` (absolute URL above)
- `title` (short, human-readable)
- `status` (number)
- `detail` (one sentence explaining the constraint, in English)
- `instance` (request URL, when available)

Do NOT leak SQL text or table names into `detail`.

--------------------------------------------------------------------------
STEP 3 — Handler integration
Files: apps/api/src/features/content/*.handler.ts (DELETE, PUT, POST)
--------------------------------------------------------------------------

Wrap the existing D1 calls so that thrown errors funnel through the new mapper.
If the handlers already use a centralised error boundary (likely — verify by
locating a `try/catch` near the repository call or a global Hono error handler),
add the new mapping branch there ONCE rather than per handler.

Pass the HTTP method to the mapper. Do not add per-feature `try/catch` blocks
that duplicate the boundary's behaviour.

--------------------------------------------------------------------------
STEP 4 — Add the canonical relation to the project's seed file
File: seed.ts at the repo root (loaded at runtime by apps/api/src/index.ts:12)
--------------------------------------------------------------------------

VERIFIED: `packages/core/src/seeds.ts` exports an EMPTY `SEED_REGISTRY` and a
`registerSeeds()` helper. Real seeds live in the project-root `seed.ts` file,
which `apps/api/src/index.ts` dynamically imports at boot. There is NO
hardcoded `articles` or `team` seed in core — they are project-level
fixtures.

Action:

1. Inspect `seed.ts`. If `team` does not exist, declare it minimally:

```ts
{
  slug: 'team',
  label: 'Team Member',
  labelPlural: 'Team Members',
  displayNameAlias: 'name',
  branches: [
    { alias: 'name',  label: 'Name',  type: 'text', requiredOnCreate: true },
    { alias: 'email', label: 'Email', type: 'text' },
  ],
}
```

2. On the existing `articles` seed (or whichever seed is canonical in your
   `seed.ts` — `posts`, `blog`, etc., adapt the slug accordingly), add:

```ts
{
  alias: 'author_id',
  label: 'Author',
  type: 'relation',
  targetSeed: 'team',
  onDelete: 'SET NULL',
  // requiredOnCreate / requiredOnUpdate intentionally omitted: optional.
  policies: { search: false, filter: true, sort: false, public: true },
}
```

NAMING NOTE: `Branch` does NOT have a `required` field — it has
`requiredOnCreate` and `requiredOnUpdate` (verified at types.ts:78–80). The
feasibility study's example using `required` is incorrect; do not propagate it.

3. Since BeechCMS is in BETA, schema evolution is handled by editing migration
   `0000_v040_base.sql` directly and resetting the local DB. See Sprint 3 for
   the full migration workflow. No new numbered migration file is needed
   during Sprint 2.

--------------------------------------------------------------------------
STEP 5 — Public API projection
Files: apps/api/src/public/* (or the public read endpoint already in place)
--------------------------------------------------------------------------

Verify (do not refactor) that the public read endpoint returns the relation
column transparently as a string under its alias. If the existing column
projection is `SELECT *` on `content_<slug>` then no change is needed: the new
column flows through automatically.

If projection is explicit (column allow-list), extend it to include relation
aliases. This is the only place where Sprint 2 may touch projection logic.

--------------------------------------------------------------------------
STEP 6 — Tests (integration)
File: apps/api/src/test/relations.test.ts (new)
--------------------------------------------------------------------------

Using the existing D1TestDatabase harness:

1. Migrate the schema (the new `content_articles.author_id` column with FK
   exists thanks to Sprint 1's DDL output).
2. Insert a row into `content_team` with id `team-1`.
3. POST `/content/articles` with `{ title: '...', author_id: 'team-1' }`.
   Expect 201 and the row to be persisted with `author_id === 'team-1'`.
4. POST `/content/articles` with `{ title: '...', author_id: 'team-missing' }`.
   Expect 422 and `type === 'https://beechcms.dev/problems/relation-target-not-found'`.
5. With `onDelete: 'SET NULL'` (default in the seed): DELETE `/content/team/team-1`.
   Expect 204. GET the article; expect `author_id === null`.
6. Temporarily (test-local seed override) set the branch's `onDelete` to
   `'RESTRICT'`, re-insert the relationship, attempt DELETE on the parent.
   Expect 409 and `type === 'https://beechcms.dev/problems/relation-in-use'`.

==========================================================================
SECTION 4 — OUT OF SCOPE
==========================================================================

- CLI / migration ordering and the `beech seed:load` topological pass — Sprint 3.
- Draft promotion safety when the FK target was deleted mid-edit — Sprint 3.
- Dashboard FieldRenderers (display + edit) and label resolution — Sprint 4.
- JOIN-based list projections that embed the target's `displayNameAlias` — Sprint 4.

==========================================================================
SECTION 5 — COMPLETION CHECKLIST
==========================================================================

[ ] `validation.ts` validates relation ids using the existing id regex.
[ ] Validation tests cover required / optional / null / malformed cases.
[ ] Problem mapper recognises D1 FK errors on both runtimes (`message` and
    `cause.code`).
[ ] DELETE FK violations → 409 with `relation-in-use` type.
[ ] INSERT/UPDATE FK violations → 422 with `relation-target-not-found` type.
[ ] Generic FK violations → 409 with `foreign-key-violation` type.
[ ] No SQL or table names leak into `detail`.
[ ] One real seed (`articles.author_id → team`) exists in `SEED_REGISTRY`.
[ ] Public read endpoint returns the relation column as a string id.
[ ] Integration test suite (`relations.test.ts`) passes end-to-end.
[ ] No file outside `packages/core/` and `apps/api/` was touched.
