# Sprint 03 — TypeScript Codegen CLI (`beech generate:types`)

> Feature: static TypeScript type generator that turns the canonical Seed registry
> into client-facing `interface` declarations. Source of truth: `@beechcms/core` Seeds.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The Botanical Engine is the single authority that compiles `Seed` definitions into
D1 DDL and validates runtime payloads. External clients (React, Next.js, fetch
callers) currently re-declare those shapes by hand, so any branch rename or type
change silently drifts the client out of sync. This sprint closes that gap by
emitting types **from the same `Seed[]` the engine already consumes** — no second
source of truth is introduced.

Architectural rationale and invariant compliance:

- **Botanical Invariant respected.** The generator never reads `content_{slug}`
  tables, never issues `PRAGMA table_info`, and never hardcodes a column name. It
  operates exclusively on `Seed.branches` (Branch IDs / aliases) — the same canonical
  definition the engine compiles. In `--local` mode it reads the in-code
  `SEED_REGISTRY`; in remote mode it reads the serialized `definition` JSON from the
  `seeds` system table (written by `seed:load`). Both paths feed the **identical** pure
  core function, so DB and code can never produce divergent types.
- **VSA respected.** The pure transformation lives in `@beechcms/core`
  (`seed-types-generator.ts`); the I/O wrapper lives in `@beechcms/cli`
  (`commands/generate-types.ts`). No `apps/api/features/*` or
  `apps/dashboard/src/features/*` slice is touched, and there are zero cross-feature
  imports.
- **Cloudflare purity respected.** Read-only operation. No migration, no DDL, no
  background job, no new dependency. Remote introspection reuses the existing
  `queryD1` wrangler shell helper — no ORM, no driver.
- **YAGNI respected.** Relation branches emit the foreign-key `string` (or `string[]`
  for many-to-many), not an expanded related interface. Interface expansion / `import`
  graphs are explicitly Out of Scope.

This must precede any client-SDK or typed-fetch work: those consume the artifact this
sprint produces.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Verified via `graphify update . --force`, `graphify query`, and targeted reads.

**CLI package — `packages/cli/`** (`@beechcms/cli`, ESM, `type: module`):
- Command modules: `packages/cli/src/commands/{init,validate,seed-load,seed-create,deploy,onboard,update,reset}.ts`.
  Each exports a pure `async function cmd(opts)` taking an options object plus an
  optional `registry?: Record<string, Seed> | null`.
- Public surface re-exported from `packages/cli/src/index.ts` (function + options type per command).
- Wrangler helpers in `packages/cli/src/lib/wrangler.ts`:
  - `queryD1<T>(sql, options: WranglerOptions): T[]` — runs `wrangler d1 execute --json`, returns `results`.
  - `findWranglerConfig(): string | null`, `resolveDbName(configPath): string`, `sqlQuote(value): string`.
  - `WranglerOptions = { db: string; local: boolean; configPath: string | null }`.
- Arg parsing is **not** in the package — it lives in the root binary `bin/cli.mjs`:
  - `COMMANDS` map (`'seed:load' → cmdSeedLoad`, etc.), dynamic `import('@beechcms/cli')`.
  - `tryLoadLocalRegistry()` already resolves `seeds.ts|seeds.js|seed.ts|seed.js` from
    cwd or `apps/api`, via `--experimental-strip-types`, into `Record<slug, Seed>`.
    The `generate:types --local` path reuses this verbatim.

**Core package — `packages/core/`** (`@beechcms/core`, dependency-free):
- `packages/core/src/types.ts`:
  - `BranchType = 'text' | 'number' | 'boolean' | 'json' | 'date' | 'richtext' | 'file' | 'tags' | 'relation' | 'repeater'` (10 types — the brief listed only 5; all 10 must be handled).
  - `Branch` (`id`, `alias`, `label`, `type`, `requiredOnCreate?`, `requiredOnUpdate?`,
    `multiple?`, `options?`, `targetSeed?`, `fields?: Branch[]` for repeaters, `policies?`).
  - `Seed` (`slug`, `label`, `displayNameAlias`, `branches: Branch[]`, `allowDrafts?`, …).
- `packages/core/src/engine.ts` — authoritative SQL/type facts to mirror:
  - `BRANCH_TYPE_SQL` map (engine line ~28). System columns set (line 41):
    `id, slug, status, created_at, updated_at`.
  - `generateCreateTable` (line 132) is the canonical shape contract:
    - `id   TEXT NOT NULL PRIMARY KEY` → always present.
    - `slug TEXT NOT NULL UNIQUE` → always present.
    - `status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived'))`
      → **four** statuses (the brief's example showing 3 is wrong; engine is source of truth).
    - branch column: `NOT NULL` **iff** `requiredOnCreate === true`.
    - `created_at INTEGER NOT NULL`, `updated_at INTEGER NOT NULL` → always present.
    - Many-to-many branch (`type === 'relation' && multiple === true`) produces **no**
      parent column (junction table). It must still surface in TS as `string[]`.
- `packages/core/src/index.ts` — barrel; every public module is re-exported here. The
  new generator module must be appended.
- `packages/core/src/policies.ts` — `resolvePolicies(branch)`; `visibility`/`public`
  policy fields exist but are **not** consulted by this sprint (see Out of Scope).

**Remote system table** (created by `init --db`, populated by `seed:load`):
- `seeds(slug TEXT, definition TEXT /* JSON-serialized Seed */, status TEXT, source, created_at, updated_at)`
  — see `buildSeedRegistrationSql` in `seed-load.ts`. `definition` is the canonical Seed
  JSON; remote codegen reads this column rather than introspecting `content_*` tables.

No existing `generate:types`, `generateTypes`, or `seed-types-generator` symbol exists
(grep-verified). This is greenfield within established patterns.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New files**
1. `packages/core/src/seed-types-generator.ts` — pure generator (`Seed[] → string`). No I/O, no D1.
2. `packages/core/src/seed-types-generator.test.ts` — unit tests for the mapping matrix.
3. `packages/cli/src/commands/generate-types.ts` — I/O wrapper (`generateTypes(opts)`): resolves registry (local) or queries `seeds` table (remote), writes the `--out` file.
4. `packages/cli/src/test/generate-types.test.ts` — command test with an injected registry (no real wrangler).

**Modified files**
5. `packages/core/src/index.ts` — append `export * from './seed-types-generator.js'`.
6. `packages/cli/src/index.ts` — export `generateTypes` + `GenerateTypesOptions`.
7. `bin/cli.mjs` — register `'generate:types': cmdGenerateTypes`, add the handler, add a help entry.

**Excluded from this sprint:** no client SDK, no typed-fetch wrapper, no relation
interface expansion, no UI. The generated `.ts` artifact itself is a build output, not
committed source.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.0 Database impact

**None.** Read-only. No `CREATE TABLE`, no `ALTER`, no migration, no FTS trigger change.
Remote mode issues exactly one read: `SELECT slug, definition FROM seeds WHERE status = 'active'`.

### 4.1 Type-mapping matrix (authoritative — implement exactly)

`BranchType` → TypeScript, mirroring `BRANCH_TYPE_SQL` semantics:

| BranchType | TS type | Notes |
|---|---|---|
| `text` | `string` | |
| `richtext` | `string` | Tiptap/HTML JSON envelope stored as TEXT |
| `file` | `string` \| `string[]` | `string[]` iff `multiple === true` |
| `number` | `number` | |
| `boolean` | `boolean` | stored 0/1, surfaced as boolean |
| `date` | `number` | Unix timestamp (seconds) |
| `json` | `unknown` | opaque serialized JSON |
| `tags` | `string[]` | JSON array of strings |
| `relation` | `string` \| `string[]` | `string[]` iff `multiple === true` (junction); else FK `string` |
| `repeater` | `Array<{…sub-branches…}>` | inline object literal from `branch.fields[]`, recursing the same matrix (sub-branches are leaf/scalar only) |

When `branch.options` is a non-empty string array **and** `type` is `text` or `tags`,
emit a string-literal union instead of bare `string`/`string[]`:
- `text` + options → `'a' | 'b' | 'c'`
- `tags` + options → `('a' | 'b' | 'c')[]`

### 4.2 Required vs optional

A branch property is **non-optional** (no `?`) iff `branch.requiredOnCreate === true`
(mirrors the `NOT NULL` rule in `generateCreateTable`). Otherwise emit `prop?: T`.
`requiredOnUpdate` does **not** affect the generated read-model and is ignored here.

System columns are always present and never optional.

### 4.3 Core module — `packages/core/src/seed-types-generator.ts`

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch } from './types.js'

const HEADER =
  '// Questo file è generato automaticamente da BeechCMS CLI. Non modificarlo direttamente.\n'

/** System columns emitted by generateCreateTable — always present, never optional. */
const SYSTEM_FIELDS =
  `  id: string\n` +
  `  slug: string\n` +
  `  status: 'draft' | 'review' | 'published' | 'archived'\n`

const SYSTEM_TIMESTAMPS =
  `  created_at: number\n` +
  `  updated_at: number\n`

/** slug/alias → PascalCase identifier. 'blog-posts' → 'BlogPosts'. */
export function pascalCase(input: string): string {
  return input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function literalUnion(options: string[]): string {
  return options.map(o => `'${o.replace(/'/g, "\\'")}'`).join(' | ')
}

/** Maps a single Branch to its TypeScript type expression (no optional marker). */
export function tsTypeForBranch(branch: Branch): string {
  switch (branch.type) {
    case 'number':
    case 'date':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'json':
      return 'unknown'
    case 'text':
    case 'richtext':
    case 'file': {
      const base =
        branch.type === 'text' && branch.options?.length
          ? literalUnion(branch.options)
          : 'string'
      return branch.type === 'file' && branch.multiple ? `${base}[]` : base
    }
    case 'tags': {
      const base = branch.options?.length ? `(${literalUnion(branch.options)})` : 'string'
      return `${base}[]`
    }
    case 'relation':
      return branch.multiple ? 'string[]' : 'string'
    case 'repeater': {
      const inner = (branch.fields ?? [])
        .map(f => `${propName(f)}${optional(f)}: ${tsTypeForBranch(f)}`)
        .join('; ')
      return `Array<{ ${inner} }>`
    }
    default: {
      // Exhaustiveness guard — fails the build if BranchType gains a member.
      const _never: never = branch.type
      return _never
    }
  }
}

function optional(branch: Branch): string {
  return branch.requiredOnCreate ? '' : '?'
}

function propName(branch: Branch): string {
  // alias is a valid SQL column; quote only if not a plain identifier.
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(branch.alias) ? branch.alias : `'${branch.alias}'`
}

/** Emits one exported interface for a single Seed. */
export function interfaceForSeed(seed: Seed): string {
  const name = pascalCase(seed.slug)
  const props = seed.branches
    .map(b => `  ${propName(b)}${optional(b)}: ${tsTypeForBranch(b)}`)
    .join('\n')
  return (
    `export interface ${name} {\n` +
    SYSTEM_FIELDS +
    (props ? props + '\n' : '') +
    SYSTEM_TIMESTAMPS +
    `}\n`
  )
}

/** Pure entry point. Deterministic: sorts seeds by slug for stable diffs. */
export function generateSeedTypes(seeds: Seed[]): string {
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const interfaces = sorted.map(interfaceForSeed).join('\n')
  const registry =
    `export interface SeedRegistryTypes {\n` +
    sorted.map(s => `  ${propName({ alias: s.slug } as Branch)}: ${pascalCase(s.slug)}`).join('\n') +
    (sorted.length ? '\n' : '') +
    `}\n`
  return `${HEADER}\n${interfaces}\n${registry}`
}
```

Notes for the executing agent:
- Keep this module **dependency-free** (type-only import of `./types.js`). It must not
  import `engine.ts`, `picocolors`, `node:fs`, or anything from `@beechcms/cli`.
- The `never` default branch is mandatory — it guarantees a compile error if a new
  `BranchType` is added without updating the matrix.

### 4.4 CLI command — `packages/cli/src/commands/generate-types.ts`

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { generateSeedTypes } from '@beechcms/core'
import {
  queryD1,
  findWranglerConfig,
  resolveDbName,
  type WranglerOptions,
} from '../lib/wrangler.js'

export interface GenerateTypesOptions {
  /** Output path for the generated .ts file. */
  out: string
  /** Read from in-code SEED_REGISTRY (true) instead of introspecting D1 (false). */
  local: boolean
  /** Pre-resolved registry (injected by bin/ for --local, and by tests). */
  registry?: Record<string, Seed> | null
  /** Override D1 database name (remote path only). */
  db?: string
}

interface SeedRow { slug: string; definition: string }

/** Remote path: read canonical Seed JSON from the `seeds` system table. */
function loadSeedsFromD1(db: string): Seed[] {
  const configPath = findWranglerConfig()
  const options: WranglerOptions = { db, local: false, configPath }
  const rows = queryD1<SeedRow>(
    `SELECT slug, definition FROM seeds WHERE status = 'active';`,
    options,
  )
  return rows.map(r => JSON.parse(r.definition) as Seed)
}

export async function generateTypes(args: GenerateTypesOptions): Promise<void> {
  let seeds: Seed[]

  if (args.local) {
    const registry = args.registry ?? {}
    if (Object.keys(registry).length === 0) {
      console.log(pc.red('\n  ✗ No seeds found (seeds.ts empty or missing).\n'))
      process.exit(1)
    }
    seeds = Object.values(registry)
  } else {
    const db = args.db ?? resolveDbName(findWranglerConfig())
    seeds = loadSeedsFromD1(db)
    if (seeds.length === 0) {
      console.log(pc.red(`\n  ✗ No active seeds in D1 (${db}). Run \`beech seed:load\` first.\n`))
      process.exit(1)
    }
  }

  const code = generateSeedTypes(seeds)
  const outPath = resolve(process.cwd(), args.out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, code, 'utf-8')

  console.log(pc.green(`\n  ✓ Generated ${seeds.length} interface(s) → ${args.out}\n`))
}
```

### 4.5 Barrel exports

`packages/core/src/index.ts` — append after the existing block:
```typescript
export * from './seed-types-generator.js'
```

`packages/cli/src/index.ts` — append:
```typescript
export { generateTypes } from './commands/generate-types.js'
export type { GenerateTypesOptions } from './commands/generate-types.js'
```

### 4.6 Binary wiring — `bin/cli.mjs`

Add to the `COMMANDS` map:
```javascript
  'generate:types': cmdGenerateTypes,
```

Add the handler (reuses the existing `tryLoadLocalRegistry()`):
```javascript
async function cmdGenerateTypes(args) {
  const outIdx = args.indexOf('--out')
  const out    = outIdx !== -1 ? args[outIdx + 1] : 'src/types/beech.ts'
  const local  = args.includes('--local')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const registry = local ? await tryLoadLocalRegistry() : null

  const { generateTypes } = await import('@beechcms/cli')
  await generateTypes({ out, local, db, registry })
}
```

Add a `help()` entry mirroring the existing format:
```
    generate:types  Generate TypeScript interfaces from the Seed registry
      --out <path>    Output file (default: src/types/beech.ts)
      --local         Read from seeds.ts instead of querying remote D1
      --db <name>     Override D1 database name (remote mode)
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from repo root unless noted.

```bash
# 1. Core typechecks + builds (pure generator, zero new deps)
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/core test        # includes seed-types-generator.test.ts

# 2. CLI typechecks + bundles (tsc --noEmit is part of its build script)
pnpm --filter @beechcms/cli build
pnpm --filter @beechcms/cli test         # includes generate-types.test.ts (injected registry)

# 3. End-to-end smoke against local registry (no D1 needed)
npx beech generate:types --local --out /tmp/beech.types.ts
npx tsc --noEmit /tmp/beech.types.ts     # generated artifact must itself compile

# 4. Remote path smoke (requires a seed:load'd local/remote DB)
npx beech onboard --local --yes
npx beech generate:types --out /tmp/beech.remote.types.ts   # reads seeds table
```

Acceptance gate: steps 1–3 must pass in CI. Step 4 is a manual/optional smoke since it
depends on a provisioned D1.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/core/src/seed-types-generator.ts` exists, exports `generateSeedTypes`,
      `interfaceForSeed`, `tsTypeForBranch`, `pascalCase`.
- [ ] The generator imports **only** a type from `./types.js` — zero runtime deps, no
      `engine.ts`/`fs`/`cli` imports. Verified: `@beechcms/core` build stays dependency-free.
- [ ] All **10** `BranchType` members are mapped; a `never` exhaustiveness guard is present.
- [ ] System fields emitted exactly as: `id: string`, `slug: string`,
      `status: 'draft' | 'review' | 'published' | 'archived'`, `created_at: number`,
      `updated_at: number` — matching `generateCreateTable`.
- [ ] A branch is optional (`?`) iff `requiredOnCreate !== true`.
- [ ] `multiple: true` yields `string[]` for both `relation` and `file`; many-to-many
      relations (no parent column) still appear in the interface.
- [ ] `repeater` emits an inline `Array<{…}>` recursing its `fields[]`.
- [ ] `--local` reads via `tryLoadLocalRegistry()`; remote reads
      `SELECT slug, definition FROM seeds WHERE status='active'` via `queryD1` — no
      `content_*` table or PRAGMA introspection.
- [ ] Command writes to `--out` (default `src/types/beech.ts`), creating parent dirs.
- [ ] Output begins with the auto-generated banner and emits `SeedRegistryTypes`.
- [ ] `generate:types` registered in `bin/cli.mjs` COMMANDS + help; `--out`/`--local`/`--db` parsed.
- [ ] Generated artifact passes `tsc --noEmit`.
- [ ] Output is deterministic (seeds sorted by slug) — re-running produces an identical file.
- [ ] `pnpm --filter @beechcms/core build`, `pnpm --filter @beechcms/cli build`, and both
      test suites pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Relation interface expansion.** `relation` emits the FK `string`/`string[]` only.
  No nested related-entity interfaces, no cross-interface `import` graph.
- **Policy-aware projection.** `visibility: 'hidden'`/`'masked'` and `public: false`
  branches are still emitted; producing a separate public/read DTO is a later sprint.
- **Draft / write DTOs.** Only the read model is generated. No `Partial`-style draft
  interface, no create/update payload types (`requiredOnUpdate` deliberately ignored).
- **Live D1 column introspection.** Do **not** add `PRAGMA table_info` or read
  `content_{slug}` tables — remote mode reads the canonical `seeds.definition` JSON.
- **No new dependencies.** Do not add a TS AST library, prettier, ts-morph, or codegen
  framework. String assembly only.
- **No API/dashboard changes.** No `apps/api/features/*` or `apps/dashboard/*` edits, no
  new REST endpoint, no migration, no FTS change.
- **No watch mode / formatting config.** Single-shot generation only.
