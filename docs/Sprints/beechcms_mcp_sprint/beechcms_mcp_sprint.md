### Pre-Computation Analysis

a) **God Nodes identified via CLI**

- `D1SeedRepository` — `graphify affected "D1SeedRepository" --depth 2` returns 11 nodes:
  `semantic-search.worker.ts [imports] L23`, `api/src/index.ts [imports] L11`,
  `repository.middleware.ts [imports] L25`, `seed.repository.d1.test.ts [imports] L6`,
  `scheduled() [calls] index.ts:L88`, `computeVectorJob()`, `deleteVectorJob()`,
  `updateR2ManifestJob()` (semantic-search.worker.ts), `search/index.ts [re_exports] L24`,
  `semantic-search.worker.test.ts [imports_from] L6`, `src/factory.ts [imports_from] L38`.
  All of these **construct or inject** the class; none call the mutation methods directly, so
  adding a method to the interface breaks *implementors*, not *consumers*.
- `D1SchemaMutator` — `graphify explain "D1SchemaMutator"` (degree 12): imported only by
  `repository.middleware.ts:L26` and its own test; the other 10 edges are its own methods
  (`getColumns`, `execDdl`, `execDestructive`, `dropTable`, `dropColumn`, `renameColumn`,
  `fetchRows`, `assertIdentifier`, constructor).
- `seeds.handler.ts` (apps/api, 561 LOC) — 14 routes, all behind `requireAdmin`.
- `SeedRegistry` / `seed-registry-cache.ts` — isolate-level cache keyed on `registry_version`.

Note: `graphify affected "ISeedRepository"` and `"ISchemaMutator"` return
`No affected nodes found` — the AST extractor does not index `import type` edges for
interfaces. Implementors were therefore enumerated with `grep`:
`D1SeedRepository`, `InMemorySeedRepository` (`apps/api/src/shared/db/repositories/in-memory-seed.repository.ts:11`),
plus the `makeRepo()` / `makeMutator()` factories in `seeds.handler.test.ts:33,47`.
**Every one of these must be updated when the interface grows a method.**

b) **Architectural boundaries affected**

- `@beechcms/core`: **modified**. `ISeedRepository` gains one method (`applyAtomic`). The DDL
  planners (`planCreateSeed`, `planExtendSeed`, `planFtsRebuild`) and `validateSeedDefinitions`
  are reused unchanged. No new DDL generator.
- `apps/api`: `features/seeds/seeds.handler.ts` gains two routes (`mcp-plan`, `mcp-apply`) and
  `GET /api/seeds` gains an `X-Schema-Version` response header.
  `shared/db/repositories/seed.repository.d1.ts` and `in-memory-seed.repository.ts` implement
  the new interface method.
- `packages/mcp` (NEW): Node.js Stdio MCP server. Pure HTTP client + in-memory plan cache.
  Zero D1 access, zero `wrangler` dependency.
- `apps/dashboard`: unaffected.

c) **`graphify affected` impact analysis — breaking-change verdict**

Adding `applyAtomic` to `ISeedRepository` is source-breaking for exactly 4 sites, all listed
in (a) and all in this sprint's deliverables. The 11 `D1SeedRepository` consumers keep
compiling because the class gains a method rather than changing an existing signature.
`ISchemaMutator` is **not** modified: `mcp-apply` reuses `getColumns` and `execDestructive`
as-is.

### VETO Audit

- **Botanical Dialect — the previous draft VIOLATED it and is corrected here.**
  `packages/core/src/engine/schema-mutator.ts:5-7` states verbatim: *"This is the ONLY sanctioned
  channel for runtime DDL — handlers never touch env.DB."* Building `context.env.DB.prepare(ddl)`
  inside `seeds.handler.ts` is therefore prohibited, and duplicating the `seeds` upsert SQL in the
  handler would create a second copy of the repository's canonical SQL. **Resolution**: the atomic
  batch lives in `D1SeedRepository.applyAtomic()`, behind the `ISeedRepository` interface. The
  handler passes DDL strings produced by `@beechcms/core` planners and never sees a
  `D1PreparedStatement`. The `seeds` / `seed_meta` SQL exists in exactly one file, as today.
- **Branch IDs**: the `seeds` and `seed_meta` tables use literal columns (`slug`, `definition`,
  `status`, `source`, `created_at`, `updated_at`, `id`, `value`) — verified in
  `apps/api/migrations/0032_seeds.sql`. Branch IDs (`br_XX`) live only inside `content_*` tables,
  whose DDL is generated exclusively by `planCreateSeed` / `planExtendSeed`. Untouched.
- **FTS5 / draft invariants**: `mcp-apply` never emits hand-written DDL. Draft mirrors, junction
  tables and FTS triggers come from the same core generators the dashboard path already uses.
  `ftsRebuildNeeded` is now honored (see Task 5) instead of being silently dropped.
- **Vertical Slice Architecture**: both new routes live inside `apps/api/src/features/seeds/`.
  `packages/mcp` imports `@beechcms/core` only (already a dependency pattern used by
  `packages/cli`). Zero cross-feature imports.
- **YAGNI**: no new migration, no new middleware, no service-token subsystem, no arbitrary SQL
  tool, no content CRUD.
- **Result**: APPROVED. Single sprint. No ROADMAP needed.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint establishes the AI Control Plane (`@beechcms/mcp`), closing Issue #328 and the
v0.8.0 milestone. PR #370 removed static `seeds.ts` files and made D1 the sole runtime authority
for schema, which left IDE agents architecturally blind: there is no local file to read and no
safe way to mutate the model. The only safe surface is the Admin API, which already delegates
every DDL decision to the Botanical Engine.

Three foundations must land together, in this order, inside one sprint — splitting them would
ship a non-functional package:

1. **A readable version token.** OCC is impossible while `seed_meta.registry_version` is
   reachable only from inside `D1SeedRepository`. No endpoint exposes it today (verified:
   `grep registry_version apps/api/src` hits only `seed.repository.d1.ts:91,98`). Without it an
   agent cannot fill `expectedVersion` and `apply` can never be called.
2. **A truly atomic apply.** `validateAndApplySeedDef()` (`seeds.handler.ts:64-104`) runs
   `execDdl` → `upsert` → `bumpRegistryVersion` as three sequential awaits. A crash between them
   leaves orphaned `content_*` tables or a stale registry token, and the read-then-write version
   check is a TOCTOU race under two concurrent agents. Both are fixed by a single guarded
   `db.batch()`.
3. **A server-computed plan.** DDL can only be planned against the *physical* columns of
   `content_{slug}` (`PRAGMA table_info`), which the MCP process cannot see. Planning locally
   from seed definitions would show the developer a diff that differs from what is applied.

VSA is respected: both routes stay in `apps/api/src/features/seeds/`. The Botanical invariant is
respected: `packages/mcp` never touches D1, and `apps/api` never emits DDL of its own.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify + direct reads)
==========================================================================

**Core planners — exact signatures (`packages/core/src/engine/seed-ddl.ts`)**

```typescript
export function planCreateSeed(seed: Seed): string[]                    // L25

export interface ExtendPlan {                                           // L40
  statements: string[]
  ftsRebuildNeeded: boolean          // NOTE: there is NO `hasDestructiveChanges` field
}
export function planExtendSeed(seed: Seed, existingColumns: Set<string>): ExtendPlan  // L55

export function planFtsRebuild(seed: Seed): string[]                    // destructive channel only
```

`planExtendSeed` is documented as *"Never drops or renames"* (`seed-ddl.ts:62`) and only ever
emits `ALTER TABLE … ADD COLUMN`, `CREATE TABLE IF NOT EXISTS` (junctions) and
`CREATE INDEX IF NOT EXISTS`. **It can never produce a destructive statement.** Destructive
intent must therefore be detected by diffing the candidate against the *stored definition*, not
by inspecting the plan.

**`ISeedRepository` (`packages/core/src/content/seed.repository.ts:23`)** — current methods:
`listActive`, `listAll`, `get`, `upsert`, `softDelete`, `hardDelete`, `getRegistryVersion`,
`bumpRegistryVersion`. Implementors: `D1SeedRepository`, `InMemorySeedRepository`, and the
`makeRepo()` mock in `seeds.handler.test.ts:33`.

**`ISchemaMutator` (`packages/core/src/engine/schema-mutator.ts`)** — `getColumns`, `execDdl`,
`dropTable`, `dropColumn`, `renameColumn`, `execDestructive`, `fetchRows`. Both `execDdl` and
`execDestructive` already wrap statements in a single `db.batch()`
(`apps/api/src/shared/db/migrations/schema-mutator.d1.ts:21,54`). **No change in this sprint.**

**Canonical registry SQL (`apps/api/src/shared/db/repositories/seed.repository.d1.ts:62-101`)**

```sql
-- upsert()  (source is BOUND, not literal)
INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
VALUES (?, ?, 'active', ?, ?, ?)
ON CONFLICT(slug) DO UPDATE SET
  definition = excluded.definition,
  status     = 'active',
  updated_at = excluded.updated_at

-- getRegistryVersion()
SELECT value FROM seed_meta WHERE id = 'registry_version' LIMIT 1

-- bumpRegistryVersion()
UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
WHERE id = 'registry_version' RETURNING value
```

**Table shapes (`apps/api/migrations/0032_seeds.sql`) — no new migration needed**

```sql
CREATE TABLE IF NOT EXISTS seeds (
    slug        TEXT    NOT NULL PRIMARY KEY,
    definition  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
    source      TEXT    NOT NULL DEFAULT 'runtime' CHECK (source IN ('code','runtime')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS seed_meta (
    id      TEXT NOT NULL PRIMARY KEY,   -- ← PK is what makes the CAS guard below work
    value   TEXT NOT NULL
);
```

**Middleware registration order (`apps/api/src/factory.ts:111-262`)**

```
app.use('*', repositoryMiddleware(...))        // L111 — injects seedRepository, schemaMutator, activityLogger
app.use('*', seedRegistryMiddleware())         // L124 — D1-backed, version-token-cached per isolate
app.use('*', storageMiddleware(...))           // L127
app.use('*', queueMiddleware(...))             // L131
app.use('*', authProvidersMiddleware())        // L133
app.use('*', rateLimiterMiddleware(...))       // L134
app.use('*', observabilityMiddleware())        // L135
app.use('*', <security headers>)               // L137
app.use('*', <CSP>)                            // L178
app.use('/api/*', <analytics>)                 // L189

const apiProtected = new Hono(...)             // L216
apiProtected.use('*', authMiddleware())        // L217 — JWT Bearer, delegates to tokenService.verify
apiProtected.route('/schema', schemaApp)       // L220 → GET /api/schema
apiProtected.route('/seeds',  seedsApp)        // L222
app.route('/api', apiProtected)                // L262

// inside seeds.handler.ts:
seedsApp.use('*', requireAdmin)                // L204 — role === 'admin'
```

Both new routes inherit JWT + admin with **zero** new middleware registration.
`context.get('seedRepository')`, `context.get('schemaMutator')` and
`context.get('activityLogger')` are already typed in `apps/api/src/types.ts:192-194`.

**Authentication — no admin secret exists**

`authMiddleware()` (`apps/api/src/middleware/auth.middleware.ts:25-44`) accepts only
`Authorization: Bearer <JWT>`. There is no API-key path, no `BEECH_ADMIN_SECRET`, and no
`.dev.vars.example` in the repo. The only token issuer is
`POST /auth/login` (`apps/api/src/auth/auth.app.ts:121`), which returns
`{ token: string, expiresIn: '15m' }` and sets an HTTP-only `refresh_token` cookie.
The MCP server must therefore log in with credentials (Task 6). Inventing a service-token
subsystem is explicitly out of scope.

**Other verified facts**

- `GET /api/schema` (`apps/api/src/features/schema/schema.handler.ts:51`) returns the
  `seedRegistry` definitions enriched with layouts — definitions, **not** physical columns.
- `GET /api/seeds` returns `listAll()` verbatim (`seeds.handler.ts:211-214`): no version, no
  metadata envelope.
- `POST /api/seeds/:slug/fts/rebuild` (`seeds.handler.ts:378`) already exists and runs
  `planFtsRebuild` through `execDestructive`.
- `requireConfirm(context, expected, body)` (`seeds.handler.ts:126`) is the house pattern:
  `confirm === slug` for table-level ops, `confirm === "${slug}.${alias}"` for column-level ops.
- `@modelcontextprotocol/sdk@1.29.0` is already in `pnpm-lock.yaml:1772` (transitive). It will be
  declared explicitly.
- `pnpm-workspace.yaml` declares `packages/*` → `packages/mcp` is picked up automatically.
  `esbuild` is pinned to `0.28.1` by the root `overrides` block.
- `packages/cli` is the reference layout for a Node ESM workspace package (`tsconfig.json`
  mirrors it exactly; `license: MIT`; scripts `build`/`dev`/`lint`/`test`).
- Local API dev URL: `http://localhost:8787`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Modified — `@beechcms/core`**
1. `packages/core/src/content/seed.repository.ts` — add `applyAtomic()` to `ISeedRepository`
   plus the `SeedApplyInput` / `SeedApplyResult` types. Export them from
   `packages/core/src/index.ts` if the file uses explicit re-exports.

**Modified — `apps/api`**
2. `apps/api/src/shared/db/repositories/seed.repository.d1.ts` — implement `applyAtomic()`
   (the single guarded `db.batch()`).
3. `apps/api/src/shared/db/repositories/in-memory-seed.repository.ts` — implement `applyAtomic()`
   (no-op + version bump), so the interface stays satisfied.
4. `apps/api/src/features/seeds/seeds.handler.ts` — add `POST /:slug/mcp-plan` (read-only dry
   run) and `POST /:slug/mcp-apply` (atomic OCC apply); add the `X-Schema-Version` header to
   `GET /`.
5. `apps/api/src/features/seeds/seeds.handler.test.ts` — extend `makeRepo()` with `applyAtomic`
   and add the mcp-plan / mcp-apply cases listed in Section 6.
6. `apps/api/src/shared/db/repositories/seed.repository.d1.test.ts` — `applyAtomic` batch-shape
   and CAS-guard tests.

**New — `packages/mcp`**
7. `packages/mcp/package.json` — Node ESM package, `license: MIT` (matching `core` and `cli`),
   with `build` / `dev` / `lint` / `type-check` / `test` scripts so the Turborepo tasks in
   `turbo.json` actually run for it.
8. `packages/mcp/tsconfig.json` — mirrors `packages/cli/tsconfig.json`.
9. `packages/mcp/src/client.ts` — authenticated HTTP client (login, 401 re-login, offline
   diagnostics).
10. `packages/mcp/src/plans.ts` — in-memory plan store with 10-minute TTL and single-use
    invalidation.
11. `packages/mcp/src/index.ts` — Stdio MCP server exposing 6 tools.
12. `packages/mcp/src/plans.test.ts` — TTL + single-use unit tests (vitest).
13. `packages/mcp/SKILL.md` — the BeechCMS Agent Skill.
14. `packages/mcp/README.md` — tool contracts, env vars, permission model, failure semantics,
    example agent session (satisfies the documentation acceptance criterion of Issue #328).

**Not required**: no D1 migration, no `pnpm-workspace.yaml` change, no new middleware, no
`ISchemaMutator` change, no dashboard change.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

--------------------------------------------------------------------------
**Task 1 — Core: extend `ISeedRepository`**
`packages/core/src/content/seed.repository.ts`
--------------------------------------------------------------------------

Append to the file (types first, then the method inside the existing interface):

```typescript
/** Input for an atomic, OCC-guarded schema apply. */
export interface SeedApplyInput {
  slug: string
  /** Full canonical definition to store in `seeds.definition`. */
  definition: Seed
  /** Additive DDL produced by planCreateSeed / planExtendSeed. Never destructive. */
  ddl: string[]
  /** The registry_version the caller planned against (compare-and-swap guard). */
  expectedVersion: number
  source?: 'code' | 'runtime'
}

export interface SeedApplyResult {
  /** false when the CAS guard did not match — nothing was written. */
  applied: boolean
  /** The version now in D1: expectedVersion + 1 on success, the live value on conflict. */
  version: number
}
```

Inside `interface ISeedRepository`, after `bumpRegistryVersion()`:

```typescript
  /** Applies additive DDL, the definition upsert and the registry-version bump as ONE
   *  transactional batch, guarded by compare-and-swap on seed_meta.registry_version.
   *  All-or-nothing: a guard mismatch or a failing statement writes nothing.
   *  The DDL strings MUST come from the core planners — this method never generates SQL. */
  applyAtomic(input: SeedApplyInput): Promise<SeedApplyResult>
```

--------------------------------------------------------------------------
**Task 2 — API: implement `applyAtomic` on `D1SeedRepository`**
`apps/api/src/shared/db/repositories/seed.repository.d1.ts`
--------------------------------------------------------------------------

Add the import of `SeedApplyInput` / `SeedApplyResult` to the existing `import type` line, then
append the method to the class:

```typescript
  async applyAtomic(input: SeedApplyInput): Promise<SeedApplyResult> {
    const { slug, definition, ddl, expectedVersion, source = 'runtime' } = input
    const now = Math.floor(Date.now() / 1000)

    // CAS guard. `seed_meta.id` is a PRIMARY KEY, so when the version does NOT match, this
    // statement attempts to insert a duplicate 'registry_version' row and raises a UNIQUE
    // constraint error, which aborts and rolls back the whole batch. When the version DOES
    // match, the SELECT yields zero rows and the statement is a no-op.
    // This is what makes the check atomic: reading the version in a separate round-trip and
    // comparing it in JS is a TOCTOU race between two concurrent agents.
    const guard = this.db
      .prepare(
        `INSERT INTO seed_meta (id, value)
         SELECT 'registry_version', 'occ-conflict'
         WHERE (SELECT value FROM seed_meta WHERE id = 'registry_version') <> CAST(? AS TEXT)`
      )
      .bind(expectedVersion)

    const upsert = this.db
      .prepare(`
        INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          definition = excluded.definition,
          status     = 'active',
          updated_at = excluded.updated_at
      `)
      .bind(slug, JSON.stringify(definition), source, now, now)

    const bump = this.db.prepare(
      `UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
       WHERE id = 'registry_version'`
    )

    try {
      // Order matters: the guard must be the FIRST statement so nothing is written when it trips.
      await this.db.batch([guard, ...ddl.map(s => this.db.prepare(s)), upsert, bump])
      return { applied: true, version: expectedVersion + 1 }
    } catch (error) {
      // Distinguish "someone else moved the version" from a genuine DDL failure.
      const message = error instanceof Error ? error.message : String(error)
      if (/UNIQUE constraint failed: seed_meta\.id/i.test(message)) {
        return { applied: false, version: await this.getRegistryVersion() }
      }
      throw error
    }
  }
```

> **Implementation note for the executing agent**: `upsert()` and `bumpRegistryVersion()` are
> left untouched — the dashboard path still uses them. The SQL above is the same statement text
> those methods already run (`source` bound, not literal), which is why it lives in this file and
> nowhere else.

--------------------------------------------------------------------------
**Task 3 — API: implement `applyAtomic` on `InMemorySeedRepository`**
`apps/api/src/shared/db/repositories/in-memory-seed.repository.ts`
--------------------------------------------------------------------------

```typescript
  async applyAtomic(input: SeedApplyInput): Promise<SeedApplyResult> {
    if (input.expectedVersion !== this.version) {
      return { applied: false, version: this.version }
    }
    return { applied: true, version: ++this.version }
  }
```

(This repository is read-only by design — `upsert` is already a no-op — so no DDL is simulated.)

--------------------------------------------------------------------------
**Task 4 — API: `POST /api/seeds/:slug/mcp-plan` (read-only dry run)**
`apps/api/src/features/seeds/seeds.handler.ts`
--------------------------------------------------------------------------

Add after the last existing `seedsApp.*` declaration. This route performs **no writes**.

```typescript
type McpClassification = 'create' | 'additive' | 'destructive'

/** Diffs a candidate against the stored definition to classify destructive INTENT.
 *  planExtendSeed can never emit destructive DDL, so intent must be detected here. */
function classifyCandidate(stored: Seed | null, candidate: Seed): {
  classification: McpClassification
  blockedReasons: string[]
} {
  if (!stored) return { classification: 'create', blockedReasons: [] }

  const reasons: string[] = []
  const incomingById = new Map((candidate.branches ?? []).map(b => [b.id, b]))

  for (const prev of stored.branches) {
    const next = incomingById.get(prev.id)
    if (!next) {
      reasons.push(`branch '${prev.id}' (${prev.alias}) would be dropped — use DELETE /api/seeds/${candidate.slug}/branches/${prev.id}`)
      continue
    }
    if (next.alias !== prev.alias) {
      reasons.push(`branch '${prev.id}' alias rename '${prev.alias}' → '${next.alias}' — use PATCH /api/seeds/${candidate.slug}/branches/${prev.id}/rename`)
    }
    if (next.type !== prev.type) {
      reasons.push(`branch '${prev.id}' type change '${prev.type}' → '${next.type}' — use PATCH /api/seeds/${candidate.slug}/branches/${prev.id}/retype`)
    }
  }

  return { classification: reasons.length > 0 ? 'destructive' : 'additive', blockedReasons: reasons }
}

/** POST /api/seeds/:slug/mcp-plan — non-mutating migration plan for MCP agents. */
seedsApp.post('/:slug/mcp-plan', async (context) => {
  const slug = context.req.param('slug')
  if (!SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const candidateInput = (body as { candidate?: unknown }).candidate
  if (!candidateInput || typeof candidateInput !== 'object') {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`candidate` must be a Seed object.' })
  }
  const candidate: Seed = { ...(candidateInput as Seed), slug }

  const repo = context.get('seedRepository')
  const schemaMutator = context.get('schemaMutator')

  // Full-set validation: relation targets can only be checked against every active seed.
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: Seed) => s.slug !== slug), candidate]
  const issues = validateSeedDefinitions(candidateSet)
    .filter(i => i.slug === slug)
    .map(i => ({ fatal: i.fatal, messages: i.messages }))

  const stored = await repo.get(slug)
  const storedDef = stored && stored.status !== 'deleted' ? stored.definition : null
  const { classification, blockedReasons } = classifyCandidate(storedDef, candidate)

  // Physical columns — the ONLY correct input for planExtendSeed.
  const existingCols = await schemaMutator.getColumns(`content_${slug}`)

  let statements: string[] = []
  let ftsRebuildNeeded = false
  if (blockedReasons.length === 0 && !issues.some(i => i.fatal)) {
    if (existingCols === null) {
      statements = planCreateSeed(candidate)
    } else {
      const plan = planExtendSeed(candidate, existingCols)
      statements = plan.statements
      ftsRebuildNeeded = plan.ftsRebuildNeeded
    }
  }

  const currentVersion = await repo.getRegistryVersion()

  return context.json({
    slug,
    classification,                                   // 'create' | 'additive' | 'destructive'
    requiresConfirmation: classification === 'destructive',
    applicable: blockedReasons.length === 0 && !issues.some(i => i.fatal),
    blockedReasons,                                   // non-empty ⇒ mcp-apply will refuse
    statements,                                       // exactly the DDL mcp-apply will run
    ftsRebuildNeeded,
    expectedVersion: currentVersion,                  // feed this straight back into mcp-apply
    issues,
  }, 200)
})
```

**Contract**: `expectedVersion` in the response is the value the agent must echo back to
`mcp-apply`. This is the only supported way to obtain the registry version — see Task 7 for the
list-level header.

--------------------------------------------------------------------------
**Task 5 — API: `POST /api/seeds/:slug/mcp-apply` (atomic OCC apply)**
`apps/api/src/features/seeds/seeds.handler.ts`
--------------------------------------------------------------------------

```typescript
/** POST /api/seeds/:slug/mcp-apply — atomic, OCC-guarded, additive-only schema apply. */
seedsApp.post('/:slug/mcp-apply', async (context) => {
  const slug = context.req.param('slug')
  if (!SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const { candidate: candidateInput, expectedVersion, planId } = body as {
    candidate?: unknown
    expectedVersion?: unknown
    planId?: unknown
  }

  if (!candidateInput || typeof candidateInput !== 'object') {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`candidate` must be a Seed object.' })
  }
  if (!Number.isInteger(expectedVersion)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`expectedVersion` must be an integer. Obtain it from POST /api/seeds/:slug/mcp-plan.' })
  }
  const candidate: Seed = { ...(candidateInput as Seed), slug }

  const repo = context.get('seedRepository')
  const schemaMutator = context.get('schemaMutator')

  // 1 — validate against the full active set (relation targets, reserved aliases, slug format)
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: Seed) => s.slug !== slug), candidate]
  const fatalIssues = validateSeedDefinitions(candidateSet).filter(i => i.fatal && i.slug === slug)
  if (fatalIssues.length > 0) {
    return publicProblem(context, {
      type: 'validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: fatalIssues.flatMap(i => i.messages).join('; '),
    })
  }

  // 2 — additive-only gate. Destructive intent is REJECTED, never confirmed here: drop /
  //     rename / retype have dedicated endpoints with their own typed confirm tokens.
  const stored = await repo.get(slug)
  const storedDef = stored && stored.status !== 'deleted' ? stored.definition : null
  const { classification, blockedReasons } = classifyCandidate(storedDef, candidate)
  if (blockedReasons.length > 0) {
    return publicProblem(context, {
      type: 'destructive-change-not-supported',
      title: 'Destructive change not supported on mcp-apply',
      status: 422,
      detail: blockedReasons.join('; '),
    })
  }

  // 3 — plan the DDL against the PHYSICAL columns
  const existingCols = await schemaMutator.getColumns(`content_${slug}`)
  let ddl: string[]
  let ftsRebuildNeeded = false
  if (existingCols === null) {
    ddl = planCreateSeed(candidate)
  } else {
    const plan = planExtendSeed(candidate, existingCols)
    ddl = plan.statements
    ftsRebuildNeeded = plan.ftsRebuildNeeded
  }

  // 4 — ONE atomic batch: CAS guard + DDL + upsert + version bump
  let result
  try {
    result = await repo.applyAtomic({
      slug,
      definition: candidate,
      ddl,
      expectedVersion: expectedVersion as number,
      source: 'runtime',
    })
  } catch (err) {
    return publicProblem(context, {
      type: 'ddl-failed',
      title: 'Atomic apply failed',
      status: 422,
      detail: internalErrorDetail(context.env, err),
    })
  }

  if (!result.applied) {
    return publicProblem(context, {
      type: 'conflict',
      title: 'Schema drift detected',
      status: 409,
      detail: `Registry version mismatch: planned against ${expectedVersion}, database is at ${result.version}. Nothing was written. Re-run mcp-plan.`,
    })
  }

  // 5 — FTS5 tail. SQLite cannot ALTER an fts5 table's columns, so a rebuild is DESTRUCTIVE
  //     and must go through execDestructive — it cannot join the additive batch above.
  //     It runs after a committed apply; on failure the schema is still correct and the agent
  //     is told to call the existing rebuild endpoint.
  let warning: string | undefined
  if (ftsRebuildNeeded) {
    try {
      const ftsStmts = planFtsRebuild(candidate)
      if (ftsStmts.length > 0) await schemaMutator.execDestructive(ftsStmts)
    } catch (err) {
      warning = `Schema applied, but the FTS5 rebuild failed: ${internalErrorDetail(context.env, err)}. Call POST /api/seeds/${slug}/fts/rebuild to restore full-text search.`
    }
  }

  // 6 — audit trail (Issue #328: actor, tool, plan id, schema revision, outcome)
  const actor = actorFromContext(context)
  context.get('activityLogger').log({
    action: existingCols === null ? 'create' : 'update',
    entityType: 'seed',
    entityId: slug,
    details: {
      op: 'mcp-apply',
      planId: typeof planId === 'string' ? planId : null,
      classification,
      expectedVersion,
      newVersion: result.version,
      ddlCount: ddl.length,
      ftsRebuilt: ftsRebuildNeeded && !warning,
      outcome: warning ? 'partial' : 'ok',
    },
    actor,
  })

  return context.json({ slug, newVersion: result.version, ftsRebuilt: ftsRebuildNeeded && !warning, ...(warning ? { warning } : {}) }, 200)
})
```

--------------------------------------------------------------------------
**Task 6 — API: expose the registry version on the list route**
`apps/api/src/features/seeds/seeds.handler.ts:211`
--------------------------------------------------------------------------

Replace the existing handler body:

```typescript
/** GET /api/seeds — list all seed records (active + deleted). Admin-only.
 *  `X-Schema-Version` carries seed_meta.registry_version for OCC-aware clients. */
seedsApp.get('/', async (context) => {
  const repo = context.get('seedRepository')
  const records = await repo.listAll()
  context.header('X-Schema-Version', String(await repo.getRegistryVersion()))
  return context.json(records)
})
```

The JSON body is unchanged, so the dashboard is unaffected. Header-only additions require no
CORS change for same-origin dashboard calls; the MCP server reads it directly over HTTP.

--------------------------------------------------------------------------
**Task 7 — `packages/mcp/package.json`**
--------------------------------------------------------------------------

```json
{
  "name": "@beechcms/mcp",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "bin": {
    "beechcms-mcp": "./dist/index.js"
  },
  "files": [
    "dist",
    "SKILL.md"
  ],
  "scripts": {
    "build": "tsc --noEmit && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js",
    "dev": "esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js --watch",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@beechcms/core": "workspace:^0.7.0",
    "@modelcontextprotocol/sdk": "^1.29.0"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "esbuild": "^0.28.1",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "license": "MIT"
}
```

`license: MIT` matches `@beechcms/core` and `@beechcms/cli`; BUSL-1.1 is reserved for `apps/api`
and the dashboard. `lint` and `test` are mandatory — `turbo.json` declares both tasks and the
package would otherwise be silently skipped by `pnpm beech test`.

--------------------------------------------------------------------------
**Task 8 — `packages/mcp/tsconfig.json`** (byte-identical to `packages/cli/tsconfig.json`)
--------------------------------------------------------------------------

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../core" }]
}
```

--------------------------------------------------------------------------
**Task 9 — `packages/mcp/src/client.ts`** (auth + offline diagnostics)
--------------------------------------------------------------------------

Every new file starts with the repo's SPDX header:

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso
```

Requirements (exact behaviour, no ambiguity):

- Config, read once at startup from `process.env`, with defaults:
  - `BEECH_API_URL` (default `http://localhost:8787`)
  - `BEECH_EMAIL` — required
  - `BEECH_PASSWORD` — required
  - If either credential is missing, every tool call fails with:
    `"Missing BEECH_EMAIL / BEECH_PASSWORD. Add them to the env block of your MCP client config (e.g. .mcp.json / claude_desktop_config.json)."`
  - Fallback: if `BEECH_API_URL` is unset and a `.dev.vars` file exists in `process.cwd()`, parse
    it for a `BEECH_API_URL=` line. **Do not** attempt to read credentials from `.dev.vars` —
    `.dev.vars` holds Worker secrets, not user accounts, and no admin secret exists in this
    codebase (see Section 2).
- `login()`: `POST {base}/auth/login` with `{ email, password }`; store `token` from the
  `{ token, expiresIn }` response in a module-level variable. The JWT lives 15 minutes.
- `request(method, path, body?)`: sends `Authorization: Bearer <token>`; on `401` performs exactly
  **one** re-login and retries once; a second `401` surfaces
  `"Authentication failed. Check BEECH_EMAIL / BEECH_PASSWORD, and that the account has role 'admin'."`
- Offline diagnostics: catch `fetch` `TypeError` / `ECONNREFUSED` and return
  `"Cannot reach the BeechCMS API at {base}. Start the local stack with: pnpm beech dev"`.
- Non-2xx responses are surfaced with `status`, `title` and `detail` from the Problem+JSON body,
  unmodified — the agent must be able to read the 409 drift message verbatim.
- Result sizes: `beech_list_seeds` returns summaries only (`slug`, `label`, `status`,
  `branchCount`, `updatedAt`), never full definitions, to bound the context cost.

--------------------------------------------------------------------------
**Task 10 — `packages/mcp/src/plans.ts`** (TTL + single use)
--------------------------------------------------------------------------

```typescript
export interface StoredPlan {
  planId: string
  slug: string
  candidate: unknown            // Seed
  expectedVersion: number
  classification: 'create' | 'additive' | 'destructive'
  statements: string[]
  ftsRebuildNeeded: boolean
  createdAt: number             // Date.now()
}

export const PLAN_TTL_MS = 10 * 60 * 1000   // brief: strict 10-minute TTL
```

- Backing store: `Map<string, StoredPlan>`, process-local. Nothing is persisted to D1 or disk.
- `savePlan(plan)` uses `crypto.randomUUID()` for `planId`.
- `takePlan(planId)` is **destructive-read on success**: it deletes the entry before returning, so
  a `planId` can never be applied twice (replay protection).
- `takePlan` returns `null` for an unknown id and, for an expired one
  (`Date.now() - createdAt > PLAN_TTL_MS`), deletes it and reports it as expired so the tool can
  answer `"Plan {id} expired (10-minute TTL). Re-run beech_schema_plan."`.
- A lazy sweep drops expired entries on every `savePlan` call — no timers, no background work
  (the process must stay passive per the brief).

--------------------------------------------------------------------------
**Task 11 — `packages/mcp/src/index.ts`** (Stdio server, 6 tools)
--------------------------------------------------------------------------

- `#!/usr/bin/env node` shebang (the package declares a `bin`).
- `Server` from `@modelcontextprotocol/sdk/server/index.js` + `StdioServerTransport` from
  `@modelcontextprotocol/sdk/server/stdio.js`.
- **Never write to `stdout`** for logging — Stdio is the JSON-RPC channel. Diagnostics go to
  `console.error` (stderr).
- Tool names keep the `beech_` prefix used by Issue #328 and the idea document, so they cannot
  collide with other MCP servers loaded in the same IDE:

| Tool | Transport | Contract |
|---|---|---|
| `beech_list_seeds` | `GET /api/seeds` | Returns `{ seeds: Summary[], schemaVersion }`; `schemaVersion` from the `X-Schema-Version` header (Task 6). |
| `beech_get_seed` | `GET /api/seeds/:slug` | Full `SeedRecord`. 404 → `"No seed with slug '<slug>'"`. |
| `beech_schema_export` | `GET /api/schema` | Full registry snapshot (definitions + layouts). |
| `beech_schema_validate` | local, `@beechcms/core` | Calls `beech_list_seeds` first, splices the candidate into the active set, runs `validateSeedDefinitions`. Fetching the set first is required — relation-target validation is meaningless on a single seed. |
| `beech_schema_plan` | `POST /api/seeds/:slug/mcp-plan` | Server-computed. Stores the response via `savePlan` and returns `{ planId, classification, requiresConfirmation, applicable, blockedReasons, statements, ftsRebuildNeeded, expectedVersion, issues, expiresInSeconds: 600 }`. |
| `beech_schema_apply` | `POST /api/seeds/:slug/mcp-apply` | Requires `planId`. `takePlan` → sends `{ candidate, expectedVersion, planId }`. |

- `beech_schema_apply` guard rails, enforced **in the server**, not only in the prompt:
  - unknown / expired / already-used `planId` → error, no HTTP call;
  - `classification === 'destructive'` or `applicable === false` → refuse with the
    `blockedReasons` and the dedicated endpoint to use instead;
  - `409` from the API → return the drift message plus
    `"Re-run beech_schema_plan; the previous plan has been discarded."` (the plan is already gone,
    since `takePlan` consumed it).
- Every tool result is JSON-stringified into a single `{ type: 'text' }` content block.
- **No writes bypass the API**: the package imports `@beechcms/core` only for
  `validateSeedDefinitions` and its types, and has no D1, `wrangler` or `better-sqlite3`
  dependency.

--------------------------------------------------------------------------
**Task 12 — `packages/mcp/SKILL.md`**
--------------------------------------------------------------------------

```markdown
---
name: beechcms-mcp
description: BeechCMS MCP Agent Skill — inspect and evolve BeechCMS content schemas safely through the Botanical Engine.
---

# BeechCMS MCP Agent Skill

A BeechCMS MCP server is available over Stdio. D1 is the only runtime authority for schema:
there are no `seeds.ts` files to edit, and raw SQL is never an option.

## Domain rules
- Seed slugs match `^[a-z0-9_]+$`. Branch ids match `^br_[A-Za-z0-9]+$` and are assigned by the
  server — never invent one; omit `id` on new branches.
- Aliases must not collide with the system columns `id`, `created_at`, `updated_at`, `status`.
- A relation branch must target a slug that already exists.

## Mandatory workflow: Inspect → Validate → Plan → Apply
1. `beech_list_seeds`, then `beech_get_seed` for any seed you intend to change. Never propose a
   change to a seed you have not read.
2. `beech_schema_validate` on your candidate for a zero-latency syntax check.
3. `beech_schema_plan` — always. It returns the exact DDL, a safety classification and the
   `expectedVersion` the apply is bound to.
4. `beech_schema_apply` with the `planId` from step 3. Never call it without one.

## Safety
- A `planId` is single-use and expires after 10 minutes. Expired or already-applied ⇒ re-plan.
- **`classification: "destructive"` ⇒ STOP.** Show the developer the full `blockedReasons` and
  DDL, and wait for an explicit human answer. `beech_schema_apply` is additive-only and will
  refuse; dropping, renaming or retyping a branch is a deliberate, separate operation on its own
  endpoint. Never work around a refusal.
- HTTP 409 means another writer (usually the dashboard) changed the schema while you were
  thinking. Nothing was written. Re-run `beech_schema_plan` and show the developer the new diff.
- `ftsRebuildNeeded: true` means full-text search is rebuilt as part of the apply. If the
  response carries a `warning`, tell the developer to run the FTS rebuild endpoint it names.
- Data preservation outranks convenience. When a request would drop data, propose an additive
  alternative first.
```

--------------------------------------------------------------------------
**Task 13 — `packages/mcp/README.md`**
--------------------------------------------------------------------------

Must contain (Issue #328 documentation criterion):
1. Install + MCP client config snippet with the `env` block (`BEECH_API_URL`, `BEECH_EMAIL`,
   `BEECH_PASSWORD`) and the `beechcms-mcp` command.
2. The 6 tool contracts: input JSON schema, output shape, error cases.
3. Permission model: JWT bearer + `role === 'admin'`; read-only tools currently need the same
   admin role because `seedsApp` is admin-gated as a whole — state this explicitly as a known
   limitation rather than implying finer scopes exist.
4. Failure semantics table: 400 bad input, 401 auth, 409 drift, 422 validation / destructive /
   DDL, connection-refused → `pnpm beech dev`.
5. A worked agent session: create a `products` seed, then add a `price` branch.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order (core must build first — `turbo.json` declares `type-check`/`test` with
`dependsOn: ["^build"]`):

```bash
pnpm install                                   # picks up packages/mcp via the packages/* glob
pnpm --filter @beechcms/core build             # emits dist + .d.ts consumed by api and mcp
npx tsc --noEmit                               # in packages/core/
npx tsc --noEmit                               # in apps/api/
npx tsc --noEmit                               # in packages/mcp/
pnpm --filter @beechcms/mcp build              # tsc --noEmit + esbuild bundle
pnpm beech test --diff                         # core + api + mcp suites
pnpm lint
```

Manual smoke test (requires the local stack):

```bash
pnpm beech dev                                 # separate shell — API on :8787
BEECH_EMAIL=<admin@example.com> BEECH_PASSWORD=<pwd> node packages/mcp/dist/index.js
# then, on stdin, a tools/list JSON-RPC frame must return the 6 beech_* tools
```

No `pnpm beech db:migrate` / `db:reset` is required — this sprint adds no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Atomicity & concurrency**
- [ ] `ISeedRepository.applyAtomic()` exists in `@beechcms/core` and is implemented by
      `D1SeedRepository`, `InMemorySeedRepository` and the `makeRepo()` test factory — `tsc`
      exits 0 for `apps/api` with no `as any` casts added.
- [ ] `applyAtomic` issues exactly **one** `db.batch()` containing, in order: CAS guard → DDL →
      `seeds` upsert → `registry_version` bump. No sequential `.run()` calls, no `env.DB` access
      from any handler.
- [ ] The OCC check is inside the batch: a unit test proves that a stale `expectedVersion`
      returns `{ applied: false }` and leaves `seeds` and `seed_meta` **unchanged** (no
      read-then-write TOCTOU window).
- [ ] `POST /api/seeds/:slug/mcp-apply` returns 409 with the live version when `applied === false`.
- [ ] The `seeds` / `seed_meta` SQL exists only in `seed.repository.d1.ts` — `grep -c "INSERT INTO seeds"`
      over `apps/api/src` returns 1.

**Correctness against the real core API**
- [ ] No reference anywhere to `hasDestructiveChanges` — `ExtendPlan` is `{ statements, ftsRebuildNeeded }`.
- [ ] Destructive intent is detected by diffing the candidate against the stored definition
      (dropped branch id, alias rename, type change) and returns 422 pointing at the dedicated
      endpoint. `mcp-apply` is additive-only by construction.
- [ ] `planExtendSeed` is called with the **physical** columns from `schemaMutator.getColumns`,
      never with columns derived from a seed definition.
- [ ] `ftsRebuildNeeded` is honored: the apply runs `planFtsRebuild` through `execDestructive`
      and reports `ftsRebuilt`; a rebuild failure returns 200 with a `warning` naming
      `POST /api/seeds/:slug/fts/rebuild`.

**Reachability**
- [ ] `GET /api/seeds` returns an `X-Schema-Version` header; the JSON body is byte-identical to
      today's (dashboard regression test still green).
- [ ] `POST /api/seeds/:slug/mcp-plan` writes nothing: a test asserts `applyAtomic`, `upsert`,
      `execDdl` and `execDestructive` are never called.
- [ ] `mcp-plan` returns `expectedVersion`, and feeding it straight into `mcp-apply` succeeds.

**Auth**
- [ ] Both routes inherit `authMiddleware()` (JWT) and `seedsApp`'s `requireAdmin` with zero new
      middleware registration; tests cover 401 (no token) and 403 (role `editor`).
- [ ] The MCP client authenticates via `POST /auth/login` and re-logins exactly once on 401.
      No `BEECH_ADMIN_SECRET` or any other non-existent secret is referenced.

**Package**
- [ ] `@beechcms/mcp` builds as a Node ESM bundle (`"type": "module"`), speaks Stdio, and writes
      nothing to stdout except JSON-RPC frames.
- [ ] `packages/mcp/package.json` declares `build`, `dev`, `lint`, `type-check`, `test`;
      `license` is MIT; `@modelcontextprotocol/sdk` is pinned `^1.29.0`.
- [ ] `pnpm install` at the root resolves `packages/mcp` with no `pnpm-workspace.yaml` change.
- [ ] `packages/mcp` has zero D1 / `wrangler` / SQLite dependencies; `@beechcms/core` is imported
      only for `validateSeedDefinitions` and types.
- [ ] Every new `.ts` file carries the SPDX header used across the repo.

**Plan lifecycle**
- [ ] Plans live in a process-local `Map` with a 10-minute TTL; nothing is written to D1 or disk.
- [ ] A `planId` is single-use: a second `beech_schema_apply` with the same id fails without an
      HTTP call. Unit-tested in `plans.test.ts`.

**Observability & docs**
- [ ] The activity log entry for `mcp-apply` records `op`, `planId`, `classification`,
      `expectedVersion`, `newVersion`, `ddlCount`, `ftsRebuilt`, `outcome`, plus the actor.
- [ ] `SKILL.md` and `README.md` exist; the README documents tool contracts, the env-var config,
      the permission model and the failure-semantics table.

**Tests**
- [ ] `seeds.handler.test.ts` covers: mcp-plan is read-only; mcp-plan classifies create /
      additive / destructive; mcp-apply happy path (create and extend); 409 on stale version;
      422 on destructive intent; 422 on validation failure; 400 on non-integer
      `expectedVersion`; 403 for a non-admin.
- [ ] `seed.repository.d1.test.ts` covers the `applyAtomic` batch shape and the CAS-guard
      conflict path.
- [ ] `packages/mcp/src/plans.test.ts` covers TTL expiry and single-use invalidation.
- [ ] `pnpm beech test --diff` is green.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Content CRUD, drafts, publishing, R2 / media uploads.** Content stays with
  `@beechcms/client` and the existing REST endpoints.
- **TypeScript AST parsing and `beech.schema.ts` generation** — Issue #381, still open, decoupled
  by design. `beech_schema_export` emits JSON only.
- **Arbitrary SQL tools.** No generic query tool is exposed, ever.
- **Destructive schema operations from MCP**: drop branch, rename alias, retype branch, soft or
  hard seed delete. They keep their dedicated endpoints
  (`DELETE /api/seeds/:slug/branches/:branchId`, `PATCH …/rename`, `PATCH …/retype`,
  `DELETE /api/seeds/:slug`, `DELETE /api/seeds/:slug/hard`) and their typed `confirm` tokens.
  `mcp-plan` *classifies* them so the agent can explain the situation; `mcp-apply` refuses them.
- **Multi-seed plans.** One plan targets one slug. Topological ordering of interdependent seed
  creations (`sortSeedsByDependencies` in `@beechcms/core`) is not wired into this endpoint;
  an agent creating related seeds calls the tool once per seed, targets first.
- **A service-token / API-key auth path.** The MCP server uses the existing JWT login. Adding
  scoped machine tokens (Issue #328's "least-privilege scopes for read vs plan vs apply") is a
  follow-up: today `seedsApp` is admin-gated as a whole, and the README must say so.
- **Replacing `POST /api/seeds/`, `PUT /api/seeds/:slug` or `POST /:slug/branches`.** The
  dashboard keeps using them unchanged; only new routes are added.
- **Migrating the dashboard path to `applyAtomic`.** Tempting, but out of scope: it would change
  behaviour for every existing UI flow and deserves its own sprint with its own regression pass.
  `validateAndApplySeedDef()` is left exactly as it is.
- **Process supervision.** The MCP server never launches Docker, Mailpit, `wrangler` or any
  background daemon; when the API is unreachable it prints the `pnpm beech dev` hint and stops.
