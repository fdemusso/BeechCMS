# Runtime Seeds — Sprint Series Overview

> **Audience:** AI coding agents implementing each sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Each sprint file is self-contained: it carries
> the context, file paths, current code, and target code needed to implement it without
> re-reading the repository. Where a sprint quotes code, trust the live code if it has
> drifted — and note the drift.

## The goal

Today, Beech CMS content types ("Seeds") are defined at **compile time**: a developer
writes `seed.ts`, the worker imports it at module load, and the DDL (`CREATE TABLE`,
indexes, FTS, junctions) is applied offline by the `beech seed:load` CLI. Seeds are
immutable at runtime — changing a content type requires editing code, re-running the
CLI, and redeploying.

This series moves Seed definitions from **compile time to runtime**. After it lands:

- Seed definitions live in a **D1 table** (`seeds`), which becomes the **single source
  of truth**.
- The dashboard can **create, edit, and delete content types** directly in the UI;
  changes apply their own DDL at runtime.
- `seed.ts` becomes **optional**. It is used **once** to bootstrap the database — its
  primary remaining purpose is to let an AI agent (or a developer) define content types
  in code and load them via the CLI. After the one-time load, `seed.ts` can be deleted;
  the database is authoritative.
- The worker **no longer imports `seed.ts` at boot**. It hydrates its registry from D1
  on each request (with caching).

## The decided end-state (read before designing anything)

These four product decisions are fixed. Do not relitigate them inside a sprint.

1. **D1 is the source of truth.** `seed.ts` is no longer auto-loaded by the worker. It
   exists only so a human or an AI agent can author content types in code and push them
   into the DB via the CLI **one time**. After that load, the DB is canonical and
   `seed.ts` is disposable.

2. **Developer / AI onboarding must be scriptable in code.** There must be CLI commands
   that an agent can run non-interactively to: (a) initialise the DB with the base
   schema (migration `0000`), and (b) load `seed.ts` definitions into the `seeds` table
   and apply their DDL. This replaces the "edit code + redeploy" loop for first
   provisioning.

3. **Additive-only DDL now; destructive DDL later.** In sprints 01–05, runtime schema
   changes are strictly **additive**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN`,
   `CREATE INDEX IF NOT EXISTS`, FTS table/triggers. Removing a field from a definition
   **orphans** the column (kept in DB, ignored by the engine). Deleting a content type
   **soft-deletes** it (hidden, table retained). Real `DROP`/`RENAME` is **sprint 06**
   only, behind explicit confirmation.

4. **The CLI stays.** `beech seed:load` is repurposed (sprint 04) to write `seed.ts`
   into the `seeds` table **and** apply DDL, so agents can drive Beech from outside the
   UI. `beech validate` and the diff/dry-run flows remain.

## Current architecture (what every sprint must respect)

### Seed / Branch model — `packages/core/src/types.ts`

```ts
export interface Branch {
  id: string            // stable logical id, ^br_[A-Za-z0-9]+$ — survives alias renames
  alias: string         // human-readable; also the SQL column name in content_{slug}
  label: string
  type: BranchType      // 'text'|'number'|'boolean'|'json'|'date'|'richtext'|'file'|'tags'|'relation'
  format?: 'plain'|'markdown'|'html'|'date'|'datetime'|'asset-list'
  multiple?: boolean
  options?: string[]
  requiredOnCreate?: boolean
  requiredOnUpdate?: boolean
  policies?: { privacy?; visibility?; search?; filter?; sort?; public? }
  numberOptions?: NumberFieldOptions
  fileOptions?: FileFieldOptions
  targetSeed?: string   // required when type==='relation'
  onDelete?: 'CASCADE'|'SET NULL'|'RESTRICT'
}

export interface Seed {
  slug: string          // identity; also table name content_{slug}
  label: string
  labelPlural?: string
  allowPublicRead?: boolean
  allowPublicPost?: boolean
  allowPublicEdit?: boolean
  allowDrafts?: boolean
  displayNameAlias: string   // required; must match a branch alias
  branches: Branch[]
  dashboard?: DashboardSeedConfig
  layout?: unknown           // FormLayout, populated server-side by GET /api/schema
}
```

The **Botanical Engine invariant**: `branch.id` (`br_XX`) is the only stable key.
`alias` is the SQL column name and may be renamed; never persist a reference to an
alias. The layout JSON, FTS triggers, automations, and draft indexing all key on
`branch.id`.

### The registry abstraction — `packages/core/src/seed-registry.ts`

`ISeedRegistry` is the synchronous façade every consumer uses:

```ts
export interface ISeedRegistry {
  all(): Seed[]
  get(slug: string): Seed | null
  visibleInDashboard(): Seed[]
  publicReadable(): Seed[]
  draftEnabled(): Seed[]
}
```

`SeedRegistry` (concrete) validates branch ids and reserved aliases in its constructor.
The same file exports `findBranchById(seed, id)` and `sortSeedsByDependencies(seeds)`
(Kahn topological sort over `relation` targets, with cycle + unknown-target detection).

**This sync interface is sacred.** 31 call sites in `apps/api/src` read
`c.get('seedRegistry')` / `c.get('getSeed')` synchronously. The migration to runtime
must keep the interface synchronous — only the *origin* of the instance changes (from a
factory closure to a per-request, D1-hydrated instance). No handler should become async
because of this work.

### The DDL generators — `packages/core/src/engine.ts`

Pure functions, same Seed → same SQL:

- `generateCreateTable(seed)` — `CREATE TABLE IF NOT EXISTS content_{slug}` with system
  columns + one column per branch (skips multi-relation branches).
- `generateAddColumn(seed, branch)` — `ALTER TABLE … ADD COLUMN` (always nullable).
- `generateIndexes(seed)` — status, created_at, and per-filterable-branch B-tree indexes.
- `generateFtsTable(seed)` / `generateFtsTriggers(seed)` — FTS5 virtual table + 3 sync
  triggers for text/richtext branches with `policies.search !== false`.
- `generateDraftTable(seed)` — `content_{slug}_drafts` when `allowDrafts`.
- `generateJunctionTable / generateJunctionIndexes / generateJunctionDraftTable` —
  many-to-many `rel_{slug}_{alias}` tables.
- `getExpectedColumns(seed)` — for diffing DB vs definition.
- `serializeForDb / deserializeFromDb` — value (de)serialization per branch type.

### How seeds load today — `apps/api/src/index.ts` + `factory.ts`

`index.ts` does `await import('../seed.ts')` at module load, extracts the registry, and
calls `createBeechApp({ seeds })`. `createBeechApp` (factory.ts) builds **one**
`SeedRegistry` and **one** `backrefMap` at factory time, then injects them per request
via a closure:

```ts
const seedRegistry = new SeedRegistry(validSeeds)
const backrefMap = buildBackrefMap(validSeeds)
app.use('*', async (context, next) => {
  context.set('getSeed', (slug) => seedRegistry.get(slug))
  context.set('seedRegistry', seedRegistry)
  context.set('backrefMap', backrefMap)
  await next()
})
```

The `scheduled` (cron) handler in `index.ts` builds its own `new SeedRegistry(validSeeds)`.

### How the dashboard reads schema — `GET /api/schema`

`apps/api/src/features/schema/schema.handler.ts` returns `registry.all()`, each seed
enriched with its stored `FormLayout`. The dashboard consumes it via the `useSchema`
hook (`apps/dashboard/src/features/schema/`). This endpoint already exists and is the
natural read-path for the new UI; the **write** path (create/edit/delete seeds) is new.

### Repository wiring — `apps/api/src/middleware/repository.middleware.ts`

All D1 repositories are constructed here and set on the Hono context. New repositories
follow the same pattern (e.g. `D1SeedLayoutRepository` in
`apps/api/src/shared/seed-layout.repository.d1.ts` is the closest model for the new
`D1SeedRepository`).

### Migrations

`apps/api/migrations/` is numbered; the last is `0031_site_settings.sql`. **Never edit
an applied migration.** New tables get a new file (next number: `0032_…`). The base
schema is also embedded as a string in the CLI (`packages/cli/src/commands/init.ts`,
`BASE_SCHEMA_SQL`) and must be kept in sync when system tables change.

## The hard problems (and where each is solved)

| Problem | Sprint |
|---|---|
| Where do definitions live, and how is DDL planned safely (additive)? | 01 |
| How does the worker hydrate a sync registry from D1 per request, across isolates? | 02 |
| How do create/edit/delete endpoints persist + apply DDL at runtime? | 03 |
| How do the CLI and `seed.ts` onboarding flow change (code → DB, AI-driven)? | 04 |
| How does the dashboard expose a Seed Builder UI? | 05 |
| How are destructive ops (DROP/RENAME, orphan cleanup) done safely? | 06 |

### Multi-isolate cache coherence (design constant for sprints 02 & 03)

Cloudflare Workers run many isolates. A seed written by a request served on isolate A is
invisible to isolate B until B reloads from D1. The series solves this with a
**version token**: a single row (`seed_meta.registry_version`, a monotonically
increasing integer or a hash) bumped on every seed write. Isolates cache the built
`SeedRegistry` keyed by that token with a short TTL; on each request they cheaply read
the token and rebuild only when it changed. Sprint 02 builds the cache + token read;
sprint 03 bumps the token on every write. **Never assume a process-global registry is
fresh.**

## Shared ground rules (apply to every sprint)

1. **Cloudflare Workers runtime.** No filesystem at request time. All SQL is either a
   compiled-in TS string or generated by the engine. D1 executes DDL via
   `db.exec(...)` / `db.batch([...])` / `db.prepare(...).run()`.
2. **Repository pattern is mandatory.** Handlers never touch `context.env.DB` directly.
   Persistence goes through an interface declared in `@beechcms/core`, implemented under
   `apps/api/src/shared/*.repository.d1.ts`, wired in `repository.middleware.ts`, typed
   in `apps/api/src/types.ts`, read via `context.get('<name>Repository')`.
3. **Botanical Engine invariant.** `br_XX` ids are the only stable keys. Aliases rename;
   ids do not. Generate new ids; never reuse a deleted id.
4. **Additive-only** (sprints 01–05). No `DROP`, no `RENAME`, no data loss.
5. **`ISeedRegistry` stays synchronous.** Hydration is async (in middleware); the
   interface consumers see is not.
6. **Docs are English.** Every file under `docs/` is English (project rule).
7. **Tests** accompany every behavioural change. API: `vitest` under `apps/api`. Core:
   `vitest` under `packages/core`. Dashboard: `vitest` + Testing Library.
8. **RFC 7807** Problem Details for public/error responses where the surrounding code
   already uses them (see `publicProblem`).

## Sprint index

- **[01 — Core persistence contract + DDL planner](./01-core-persistence-and-ddl-planner.md)**
  `ISeedRepository`, `D1SeedRepository`, the `seeds` + `seed_meta` tables, a
  runtime-reusable `validateSeedDefinitions`, a branch-id generator, and an
  additive `planSeedDdl` function. No behaviour change yet — building blocks.

- **[02 — Runtime registry hydration](./02-runtime-registry-hydration.md)**
  Replace the factory-closure registry with a D1-hydrated, version-token-cached
  registry injected per request. Stop importing `seed.ts` at boot. Move `backrefMap`
  to request scope. Update the cron handler. All 31 consumers unchanged.

- **[03 — Seed CRUD API + runtime DDL execution](./03-seed-crud-and-runtime-ddl-api.md)**
  New `apps/api/src/features/seeds/` slice: create/edit (add branch, edit metadata)/
  soft-delete content types, each persisting to `seeds` and applying additive DDL via
  batch, then bumping the registry version token.

- **[04 — CLI: code → DB onboarding](./04-cli-code-onboarding.md)**
  Repurpose `beech seed:load` to upsert `seed.ts` into the `seeds` table **and** apply
  DDL. Add a scriptable, non-interactive onboarding command for agents. Stop the
  worker from auto-importing `seed.ts`. Keep diff/dry-run/validate.

- **[05 — Dashboard Seed Builder UI](./05-dashboard-seed-builder.md)**
  New `seed-builder` feature slice + page: list/create/edit/soft-delete content types,
  branch editor, policies, capability flags, dashboard config. Live-invalidates the
  `useSchema` query so the sidebar and forms update without reload.

- **[06 — Destructive operations (Danger Zone)](./06-destructive-operations.md)** *(later)*
  Guarded `DROP TABLE` / `DROP COLUMN` / `RENAME COLUMN`, orphan-column cleanup,
  backref-aware delete guards, audit logging.

Implement in order. 02 depends on 01; 03 on 01+02; 05 on 03; 04 on 01+02; 06 on 03+05.
