# Sprint: LocalizationCoreContracts

Sprint 1 of 5 of **Field-Level Localization** (roadmap: `backlog/ROADMAP.md`).
Teaches the Botanical Engine what a localized branch is, which ones are legal, and how a locale
dictionary is validated, stored and indexed. Every change is additive and dormant: a project with no
`localized: true` branch, and every caller that does not pass a `LocaleConfig`, behaves exactly as it
does today.

---

### Pre-Computation Analysis

Graph refreshed first with `graphify update . --force` (21 148 nodes, 31 976 edges, 1 984 communities).

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `createBeechApp()` | **77** | `apps/api/src/factory.ts:L117` | Composition root. **Not touched.** No middleware, route or registration order changes. |
| `D1ContentRepository` | **53** | `apps/api/src/shared/db/repositories/content.repository.d1.ts:L119` | The only D1 gateway for content. **Not touched.** It already reaches storage only through `serializeForDb` (via `serializeAndProtect`, L148) and `deserializeFromDb` (via `rowToData`, L212), so the new dictionary codec reaches it with zero repository edits. |
| `validateAndSanitizeSeedPayload()` | **22** | `packages/core/src/engine/validation/index.ts:L412` | Gains one optional option (`localeConfig`). Callers: `createHandler`, `updateHandler`, `kanbanMoveHandler`, `sanitizePublicPayload`, `publicAddHandler`, `resolveData` (public-edit). None passes the option in this sprint → their behaviour is unchanged. |
| `resolveClassification()` | 10 | `packages/core/src/engine/policies.ts:L60` | Read-only consumer: seed-validation uses it to refuse `localized` on encrypted/hashed storage. Not modified. |
| `validateSeedDefinitions()` | 9 | `packages/core/src/engine/seed-validation.ts:L41` | Gains Fatal 17. Reached by the Seeds API (`validateAndApplySeedDef`), the MCP tool (`handleTool`), the CLI (`validateSeeds`, `seedLoad`) and manifest validation — all inherit the new rule with no edits. |
| `validateAndApplySeedDef()` | 9 | `apps/api/src/features/seeds/seeds.helpers.ts:L129` | Not modified. It stores the candidate definition verbatim (no branch-key whitelist), so `localized` persists, and a flag toggle on an existing column yields `planExtendSeed` → zero statements: the metadata-only guarantee already holds structurally. |
| `compileSeedSchema()` | 8 | `packages/core/src/engine/validation/cache.ts:L142` | Dispatches localized branches to the new schema; cache key and branch fingerprint gain the locale dimension. |
| `serializeForDb()` / `deserializeFromDb()` | 7 / 7 | `packages/core/src/engine/serialize.ts:L86 / L135` | Gain the dictionary codec. Today `serializeForDb` returns `null` for any non-string on a `text` branch — a dictionary would be silently erased without this change. |
| `extractIndexableText()` | 4 | `packages/core/src/search/vector-extractor.ts:L15` | Gains dictionary flattening; consumer `computeVectorJob()` receives deserialized entries (`findById`), where a localized text value is an object and is dropped today. |
| `projectSchemaContract()` | 3 | `packages/core/src/engine/schema-fingerprint.ts:L104` | Gains `localized` in the contract projection, conditionally (see VETO §4). |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — engine types | **Yes** | `engine/types.ts`: `Branch.localized?: boolean`. |
| `@beechcms/core` — localization (pure) | **Yes (new)** | `engine/localization.ts`: `LOCALE_CODE_RE`, `LOCALIZABLE_BRANCH_TYPES`, `LocaleConfig`, `LocalizedDictionary`, `LocalizedPatch`, `isLocaleCode`, `isLocalizedBranch`, `isLocaleDictionary`, `isLocalizedWriteDictionary`, `toLocalizedPatch`, `compactLocalizedDictionary`. Zero I/O. |
| `@beechcms/core` — seed validation | **Yes** | `engine/seed-validation.ts`: Fatal 17. |
| `@beechcms/core` — payload validation | **Yes** | `validation/index.ts` (option + required check), `validation/cache.ts` (dispatch + cache key), `validation/schema-builders.ts` (`localizedSchema`). |
| `@beechcms/core` — storage codec | **Yes** | `engine/serialize.ts`. |
| `@beechcms/core` — search | **Yes** | `search/vector-extractor.ts`. FTS DDL (`generateFtsTable` / `generateFtsTriggers`) **not touched**: triggers copy the raw column text into FTS5, so the dictionary JSON — every language — is already tokenised by `unicode61`. |
| `@beechcms/core` — schema contract | **Yes** | `engine/schema-fingerprint.ts`. |
| `@beechcms/core` — barrel | **Yes** | `index.ts`: one `export *` line. |
| `@beechcms/core` — DDL (`ddl.ts`, `seed-ddl.ts`, `seed-ddl-destructive.ts`), `query.ts`, `policies.ts`, `site-settings.repository.ts` | **No** | Column type never changes; filter/sort by locale is Sprint 3; settings are Sprint 2. |
| `apps/api/features/seeds` | **Yes** | `seeds.destructive.ts`: retype guard (VETO §5 violation 3). New integration suite. |
| `apps/api/features/*` (any other slice), `public/`, `middleware/`, `shared/`, `factory.ts`, `types.ts` | **No** | Zero files. |
| `apps/api` — D1 / migrations | **No** | Zero SQL, zero migrations. |
| `apps/dashboard` | **No** | Zero files (the `Branch` type change is additive/optional). |
| `@beechcms/client`, `api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. MCP/CLI inherit Fatal 17 through `validateSeedDefinitions`. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "validateAndSanitizeSeedPayload()" --depth 2
- createHandler()          [calls]   apps/api/src/features/content/handlers/create.ts:L26
- kanbanMoveHandler()      [calls]   apps/api/src/features/content/handlers/kanban-move.ts:L15
- updateHandler()          [calls]   apps/api/src/features/content/handlers/update.ts:L28
- sanitizePublicPayload()  [calls]   apps/api/src/public/sanitize.ts:L26
- publicAddHandler()       [calls]   apps/api/src/public/public-add.ts:L133
- resolveData()            [calls]   apps/api/src/public/public-edit.ts:L66
- safeValidate()/validate()/validateRepeater()/validateWithAllowNullFalse() [calls] core validation tests
- core-validation.test.ts  [imports] apps/api/test/core-validation.test.ts:L1
- kanban-move.test.ts      [imports] apps/api/src/features/content/handlers/kanban-move.test.ts:L1

$ graphify affected "compileSeedSchema()" --depth 2
- validateAndSanitizeSeedPayload() [calls] packages/core/src/engine/validation/index.ts:L412
- (same six API callers as above) + core validation tests + cache.test.ts

$ graphify affected "validateSeedDefinitions()" --depth 2
- validateAndApplySeedDef() [calls] apps/api/src/features/seeds/seeds.helpers.ts:L129
- handleTool()              [calls] packages/mcp/src/index.ts:L219
- validateSeeds()/validate()/seedLoad() [calls] packages/cli/src/commands/{validate,seed-load}.ts
- validateManifest()        [calls] packages/core/src/schema/manifest-validation.ts:L26
- interpretManifestModule() [calls] packages/cli/src/lib/manifest-loader.ts:L38
- isSeedSetValid()          [calls] packages/core/src/engine/seed-validation.ts:L361

$ graphify affected "serializeForDb()" --depth 2
- .serializeAndProtect()      [calls] content.repository.d1.ts:L148
- .processBulkUpdateSingle()  [calls] content.repository.d1.ts:L789
- buildInsertBindings() / buildUpdateBindings() [calls] apps/api/src/shared/utils/content-utils.ts:L44/L64

$ graphify affected "deserializeFromDb()" --depth 2
- rowToApiData() / rowToEntry() [calls] apps/api/src/shared/utils/content-utils.ts:L11/L20
- (repository rowToData reaches it at content.repository.d1.ts:L212)

$ graphify affected "projectSchemaContract()" --depth 2
- computeSchemaFingerprint() [calls] packages/core/src/engine/schema-fingerprint.ts:L136
- generateTypes()            [calls] packages/cli/src/commands/generate-types.ts:L30
- typesCheck()               [calls] packages/cli/src/commands/types-check.ts:L28

$ graphify affected "extractIndexableText()" --depth 2
- computeVectorJob() [calls] apps/api/src/features/search/jobs/semantic-search.worker.ts:L221
- semantic-search.worker.test.ts, vector-extractor.test.ts

$ graphify affected "resolveClassification()" --depth 2
- 34 dependants (ddl, query, policies, repository, public projection, dashboard FieldEdit…) — read-only use; function NOT modified.
```

**Breaking-change verdict: none.**
- `validateAndSanitizeSeedPayload` / `compileSeedSchema`: the new option is optional; every one of the six API
  callers omits it, so `localizedSchema` is never compiled for them and the cache key gains a constant `-`
  suffix. Their compiled schemas are byte-identical in behaviour.
- `validateSeedDefinitions`: Fatal 17 fires only on `localized !== undefined`. No shipped seed, canonical seed
  or migration carries the key (`grep localized` over `packages/testing`, `apps/api/migrations` → 0 hits).
- `serializeForDb` / `deserializeFromDb`: the new branches are guarded by `isLocalizedBranch(branch)`, false for
  every existing branch. Non-localized `text` holding JSON-looking strings is untouched (regression-guarded).
- `projectSchemaContract`: `localized` is spread only when `=== true`, so every existing schema keeps its exact
  fingerprint; `SCHEMA_FINGERPRINT_VERSION` stays `1` (regression-guarded).
- `extractIndexableText`: the new branch is reached only for localized branches holding a dictionary.

**VSA boundary proof:**
```
$ graphify path "compileSeedSchema()" "D1ContentRepository"
  compileSeedSchema() <--contains-- cache.ts --imports_from--> types.ts <--imports_from-- search.repository.ts
  <--imports_from-- repository.middleware.ts --imports--> D1ContentRepository
$ graphify path "extractIndexableText()" "D1Database"
  extractIndexableText() <--contains-- vector-extractor.ts <--re_exports-- index.ts ... init() --calls--> createD1Database()
```
Both paths reach storage only *backwards* through importers (shared type modules and the API composition
root). Core has no forward edge to any D1 binding, and the new `localization.ts` imports only `./types.js`
(type-only) and `./validation/primitives.js`.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**
- ✅ Zero new SQL. The dictionary is written and read exclusively through `serializeForDb` /
  `deserializeFromDb`, the two functions `D1ContentRepository` already funnels every value through.
- ✅ No hardcoded field names: every rule keys on `branch.type` / `branch.localized`; the only aliases that
  appear are in diagnostic messages. Locale codes are data, validated by `LOCALE_CODE_RE`.
- ✅ The integration suite reads physical state only via `PRAGMA table_info` and a `SELECT` on the column the
  branch addresses — the same idiom `seed-ownership.integration.test.ts` uses — and provisions tables through
  the Seeds API (`planCreateSeed`), never with hand-written DDL (testing Rule 3.7).

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- ✅ The only slice touched is `features/seeds`; the guard uses the `Branch` it already loads. No new import.
- ✅ All shared logic (grammar, detection, normalisation, codec) lives in `@beechcms/core`, consumed by the
  engine itself. No slice duplicates it.

**3. CLOUDFLARE PURITY.**
- ✅ No DDL, no migration, no new table, no bridge table, no KV, no background job. The dictionary lives in
  the branch's existing D1 `TEXT` column; FTS5 triggers index it unchanged.

**4. YAGNI / RUTHLESS VETO — every addition has a consumer in this sprint.**
- ✅ `localization.ts` exports are consumed by seed-validation, payload validation, the codec and the vector
  extractor in this same PR.
- ✂ **Cut to Sprint 2:** `resolveLocaleConfig()` (its only consumer is the settings read path) and
  `applyLocalizedPatch()` (its only consumer is the update/draft merge).
- ✂ **Cut to Sprint 3:** `resolveLocalizedValue()` (only consumer: public projection) and
  `SelectOptions.locale` (only consumer: public filters/sort).
- ✂ **No FTS change**: triggers already index every language (brief §2 "aggiungere o rimuovere una lingua non
  richiede mai reindicizzazione" holds for free).
- ✂ **No type-generator change**: the default public response is flat, so a localized `text` branch is still
  `string` in generated types.
- ✅ **Kept:** `localized` in the schema-contract projection. It changes the public contract (dictionary
  shape under `?lang=all`, dictionary accepted on public writes); a drift detector that ignored it would be
  wrong. Conditional spread keeps every existing fingerprint identical — zero cost.

**Violations found and corrected during this audit:**

1. **Silent erasure of dictionaries on `text` branches.** `serializeForDb` falls to its `default` case for
   `text` and returns `null` for any non-string. A validated dictionary written to a localized `text` branch
   would persist as `NULL` with a `201`. The codec therefore runs *before* the type switch and is keyed on
   `isLocalizedBranch(branch) && isLocaleDictionary(value)`.

2. **Short JSON keys look like locale codes.** `{"url": "…", "alt": "…"}` — a legitimate `json` value — has
   only 2–3-letter lowercase keys and matches the locale-code grammar. Treating every grammar-matching object
   as a dictionary on write would drop both keys as "unregistered locales": data loss on a `201`. Rule adopted:
   a written object is a dictionary only if every key matches the grammar **and at least one key is a
   registered locale** (`isLocalizedWriteDictionary`). Anything else is the default-locale value. Unit test is
   the regression guard.

3. **Retype bypasses seed validation.** `PATCH /api/seeds/:slug/branches/:branchId/retype` builds
   `{ ...branch, type: newType }` and persists through `applyDestructiveSeedDef`, which never calls
   `validateSeedDefinitions`. Retyping a localized `text` to `number` would persist `localized: true` on a
   `number` (illegal per Fatal 17) and reinterpret dictionaries as numbers. The route now refuses a localized
   branch with `422 retype-localized-not-supported`; the owner disables localization first (metadata-only),
   then retypes.

4. **A wrapped plain value must not report a phantom locale path.** When a client sends a plain value that is
   wrapped under `defaultLocale`, a failure is reported at `<alias>` (what the client sent), not at
   `<alias>.<defaultLocale>` (a path that does not exist in its payload). Dictionary inputs report at
   `<alias>.<locale>`.

5. **Patch vs stored shape.** Validation output is a *patch* (`null` = clear that locale) because Sprint 2
   merges it into the stored dictionary. A patch serialized directly (the create path) must never persist
   `null`/`""` entries: `serializeForDb` compacts the dictionary and writes `NULL` if nothing remains. So
   brief §4 "stringhe vuote … ripulite in scrittura" holds on every path, including ones Sprint 2 wires later.

**VERDICT: APPROVED.** Both invariants hold. Proceed to the linear plan.

---

### Scope Gate

**Does NOT fit one sprint** (brief requires sequential merges: engine contract → API write path → API read
path + SDK → dashboard schema UI → entry editor). `backlog/ROADMAP.md` written with five sprints; this
document is the detailed plan for **Sprint 1 only**. Everything deferred is listed in SECTION 7 with its
roadmap reference.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every later sprint speaks a language this sprint defines: what a locale code is, when an object is a locale
dictionary, what a validated localized write looks like, how it is stored, and which branches may be
localized at all. If the API write path (Sprint 2) were built first, it would have to invent those rules
inside `apps/api`, violating the Botanical rule that `@beechcms/core` is the single source of truth — and the
dashboard (Sprints 4–5), the MCP tool and the CLI would each need their own copy.

Ordering inside the sprint is forced by the invariants:

1. **Schema legality first.** `Branch.localized` + Fatal 17 make illegal combinations (non-text types,
   repeater sub-fields, encrypted/hashed storage) unrepresentable in *every* seed entry point — Seeds API,
   MCP, CLI, manifest — because they all go through `validateSeedDefinitions`. The one entry point that
   bypasses it (retype) gets an explicit guard.
2. **Value contract second.** `localization.ts` defines the dictionary grammar and the write-patch
   normalisation (plain value → default locale, unregistered locales dropped, blank → clear). Payload
   validation consumes it behind an *optional* `localeConfig`, so no caller changes behaviour until Sprint 2
   opts in.
3. **Storage codec third.** `serializeForDb` / `deserializeFromDb` are the Botanical Engine's `apiToDb` /
   `dbToApi`. Teaching them the dictionary here means the D1 repository — the highest-risk file in the API —
   needs no edit in any sprint for storage purposes.
4. **Indexing parity.** FTS already covers all languages; the vector extractor is brought to parity so the
   brief's "search finds content regardless of language" holds for semantic search too.

VSA: the only `apps/api` slice touched is `features/seeds`, and only to close a hole in its own route. No
cross-slice import is introduced.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Branch model** (`packages/core/src/engine/types.ts`): `Branch` has no localization concept. `BranchType` =
`text | number | boolean | json | date | richtext | file | tags | relation | repeater`. Physical SQL types
(`ddl.ts` `BRANCH_TYPE_SQL`): `text`, `json`, `richtext` are all `TEXT`.

**Classification** (`policies.ts:L60`, `resolveClassification`): `confidential` → `storage: 'encrypt'`,
`restricted` → `storage: 'hash'`, `internal` / `public` → `'plain'`. Legacy `policies.privacy`
(`'encrypt' | 'hash' | …`) is normalised by `normalizeClassification`.

**Seed validation** (`seed-validation.ts`): Fatal 1–16 + Warnings 7–10, pure, returns
`SeedValidationIssue[]`. Callers filter `fatal` issues for the candidate slug (`seeds.helpers.ts:L134`) and
answer `422 validation-failed` with the messages joined by `; `.

**Seeds API** (`apps/api/src/features/seeds`, mounted by `apiProtected.route('/seeds', seedsApp)` at
`factory.ts:L251`, behind `authMiddleware → oauthScope → permission`; seed mutations additionally require the
admin role):
- `POST /api/seeds` and `PUT /api/seeds/:slug` → `validateAndApplySeedDef` → `validateSeedDefinitions` →
  `planCreateSeed` / `planExtendSeed` → `repo.upsert(..., 'runtime')` → `bumpRegistryVersion`. Branch objects
  are stored verbatim (no key whitelist). `planExtendSeed` emits `ADD COLUMN` only for aliases missing from
  `PRAGMA table_info`, so a flag-only change on an existing branch produces **zero** DDL.
- `PUT` rejects alias renames / type changes via `validateIncomingBranches`; other branch properties pass.
- `PATCH /:slug/branches/:branchId/retype` (`seeds.destructive.ts:L213`) builds
  `{ ...branch, type: newType }`, runs `generateRetypeColumn` + `planFtsRebuild` through
  `applyDestructiveSeedDef`. **It never calls `validateSeedDefinitions`.**

**Payload validation** (`validation/index.ts`): `validateAndSanitizeSeedPayload(seed, payload, options)` →
`splitUnknownAliases` → `compileSeedSchema(seed, resolved)` (Zod object, `.strict()`, LRU-cached by seed
fingerprint + options; relation seeds partitioned per `idGenerator`) → `processZodIssues` →
`detectMissingRequired`. Per-type builders in `schema-builders.ts` (`BRANCH_SCHEMA_BUILDERS`); `richtext` and
`json` use `z.any()`/union + `.transform` with `ctx.addIssue({ code: 'custom', … })`; `dangerous` richtext is
signalled through `params: { dangerous: true }`. Field paths are built by `buildFieldPath`
(`title`, `items[0].name`, `title.en`).

**Storage codec** (`serialize.ts`): `serializeForDb` — `json | tags | richtext` → string or `JSON.stringify`;
`text` (default case) → string, **`null` for objects**. `deserializeFromDb` — `json | tags | richtext` →
`JSON.parse` with raw fallback; `text` → raw.

**Search**: FTS5 table per seed (`generateFtsTable`), columns = `indexableSearchBranches(seed)` (`text` /
`richtext` with `search && public`), tokenizer `unicode61`, triggers copy `new.<alias>` verbatim — the raw
JSON text of any dictionary is indexed. Vectors: `computeVectorJob` → `repository.findById` (deserialized) →
`extractIndexableText` keeps only `typeof value === 'string'`.

**Schema contract** (`schema-fingerprint.ts`): `projectBranch` projects response-shape-bearing keys with
conditional spreads; `SCHEMA_FINGERPRINT_VERSION = 1`.

**Site settings**: `site_settings(key, value)` key-value table; `SiteSettings.defaultLanguage` is the
dashboard UI language (`it | en`). No content-locale keys exist. (Sprint 2.)

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production code:

| # | File | Change |
|---|------|--------|
| 1 | `packages/core/src/engine/types.ts` | MODIFY — `Branch.localized?: boolean` |
| 2 | `packages/core/src/engine/localization.ts` | NEW — grammar, config type, detection, patch normalisation, compaction |
| 3 | `packages/core/src/engine/seed-validation.ts` | MODIFY — Fatal 17 |
| 4 | `packages/core/src/engine/validation/index.ts` | MODIFY — `localeConfig` option; required check on default locale |
| 5 | `packages/core/src/engine/validation/schema-builders.ts` | MODIFY — `localizedSchema()` |
| 6 | `packages/core/src/engine/validation/cache.ts` | MODIFY — dispatch, branch fingerprint, cache key |
| 7 | `packages/core/src/engine/serialize.ts` | MODIFY — dictionary codec |
| 8 | `packages/core/src/search/vector-extractor.ts` | MODIFY — index every locale |
| 9 | `packages/core/src/engine/schema-fingerprint.ts` | MODIFY — `localized` in `ContractBranch` |
| 10 | `packages/core/src/index.ts` | MODIFY — `export * from './engine/localization.js'` |
| 11 | `apps/api/src/features/seeds/seeds.destructive.ts` | MODIFY — retype guard |

Tests:

| # | File | Tier |
|---|------|------|
| T1 | `packages/core/src/engine/localization.test.ts` | unit (NEW) |
| T2 | `packages/core/src/engine/seed-validation.test.ts` | unit (extend) |
| T3 | `packages/core/src/engine/validation/localized-schema.test.ts` | unit (NEW) |
| T4 | `packages/core/src/engine/validation/cache.test.ts` | unit (extend) |
| T5 | `packages/core/src/engine/serialize.test.ts` | unit (extend) |
| T6 | `packages/core/src/search/vector-extractor.test.ts` | unit (extend) |
| T7 | `packages/core/src/engine/schema-fingerprint.test.ts` | unit (extend) |
| T8 | `apps/api/src/features/seeds/test/integration/seed-localization.integration.test.ts` | integration (NEW, real D1) |

Explicitly **not** produced: any D1 migration, any settings key, any change to content handlers, public
routes, repositories, middleware, dashboard, SDKs or docs (see SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Headers: `packages/core` files use the package header
(`// SPDX-License-Identifier: MIT` + `// Copyright (c) 2024–2026 Flavio De Musso`); `apps/api` files use the
three-line BUSL header. Quote style: single quotes, no semicolons (match surrounding files).

### Task 1 — `Branch.localized` (`packages/core/src/engine/types.ts`)

Insert directly after `fileOptions?: FileFieldOptions` (L140):

```ts
  /**
   * Field-level localization. When true, the branch's existing column stores a locale dictionary
   * (`{"it": "Scarpa", "en": "Shoe"}`) instead of a single value. Metadata-only: toggling it never
   * emits DDL and never rewrites rows — values written before the toggle stay readable as-is.
   * Valid only on top-level `text | richtext | json` branches with `plain` storage (not
   * `confidential` / `restricted`); never on repeater sub-fields. Enforced by seed-validation.ts
   * (Fatal 17). Default: false.
   */
  localized?: boolean
```

### Task 2 — `packages/core/src/engine/localization.ts` (NEW)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/localization
 * Field-level localization primitives for the Botanical Engine. A localized branch keeps its native
 * TEXT column and stores a locale dictionary in it (`{"it":"Scarpa","en":"Shoe"}`), so ids, relations
 * and metrics are untouched and toggling `Branch.localized` never emits DDL. Pure functions: no I/O and
 * no settings access — callers pass the project's {@link LocaleConfig}.
 */

import type { Branch, BranchType } from './types.js'
import { cleanString, isPlainObject } from './validation/primitives.js'

/**
 * Locale code grammar (v1): ISO 639 language (2–3 lowercase letters), optionally followed by an ISO 3166
 * region (2 uppercase letters) or a UN M.49 area (3 digits) — `it`, `en`, `pt-BR`, `es-419`. Script
 * subtags (`zh-Hant`) are outside v1. The grammar doubles as an injection guard: validated codes are
 * later interpolated into SQLite JSON paths.
 */
export const LOCALE_CODE_RE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|[0-9]{3}))?$/

/** Branch types that may carry `localized: true`. */
export const LOCALIZABLE_BRANCH_TYPES: ReadonlySet<BranchType> = new Set<BranchType>(['text', 'richtext', 'json'])

/**
 * Project-level language configuration. Invariant (guaranteed by its producer): `locales` is non-empty,
 * every entry matches {@link LOCALE_CODE_RE}, and it contains `defaultLocale`.
 */
export interface LocaleConfig {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

/** A locale dictionary as stored in the branch column: locale code → value. */
export type LocalizedDictionary = Record<string, unknown>

/**
 * A validated write for a localized branch: registered locale code → new value, or `null` meaning
 * "clear this locale". Locales absent from the patch must be left untouched by the write path.
 */
export type LocalizedPatch = Record<string, unknown>

/** True when `value` is a string matching {@link LOCALE_CODE_RE}. */
export function isLocaleCode(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_CODE_RE.test(value)
}

/**
 * True when the branch is localized AND its type supports it. A malformed definition that slipped past
 * seed validation (e.g. `localized: true` on a `number`) is treated as not localized, never as a dictionary.
 */
export function isLocalizedBranch(branch: Pick<Branch, 'type' | 'localized'>): boolean {
  return branch.localized === true && LOCALIZABLE_BRANCH_TYPES.has(branch.type)
}

/**
 * Structural check used on READ paths (no config available): a non-empty plain object whose every key
 * matches the locale-code grammar. A richtext envelope (`schemaVersion`, `doc`) and a TipTap doc
 * (`type`, `content`) never match.
 */
export function isLocaleDictionary(value: unknown): value is LocalizedDictionary {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every(isLocaleCode)
}

/**
 * Stricter check used on WRITE paths: a locale dictionary with at least one REGISTERED locale key.
 * Without the registration requirement a legitimate json value such as `{"url": "…", "alt": "…"}` —
 * whose keys happen to match the grammar — would be read as a dictionary of unregistered locales and
 * silently emptied.
 */
export function isLocalizedWriteDictionary(value: unknown, config: LocaleConfig): value is LocalizedDictionary {
  return isLocaleDictionary(value) && Object.keys(value).some((key) => config.locales.includes(key))
}

function isBlankLocaleValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && cleanString(value) === '')
}

/**
 * Normalises any accepted write value of a localized branch into a {@link LocalizedPatch}:
 * - a write dictionary keeps its registered locales, in `config.locales` order; unregistered locale
 *   keys are dropped;
 * - any other value (string, richtext doc, non-dictionary json) is the default-locale value;
 * - `null`, `undefined` and blank strings become `null` ("clear this locale").
 * Idempotent: a patch passed back in yields the same patch.
 */
export function toLocalizedPatch(value: unknown, config: LocaleConfig): LocalizedPatch {
  const source: Record<string, unknown> = isLocalizedWriteDictionary(value, config)
    ? value
    : { [config.defaultLocale]: value }
  const patch: LocalizedPatch = {}
  for (const locale of config.locales) {
    if (!Object.hasOwn(source, locale)) continue
    patch[locale] = isBlankLocaleValue(source[locale]) ? null : source[locale]
  }
  return patch
}

/**
 * Removes `null` / `undefined` / blank-string entries. Returns `null` when nothing remains, so an
 * all-cleared dictionary is stored as SQL NULL rather than `{}`. Keys are otherwise preserved as-is —
 * including locales no longer registered, which must never be dropped by a write (brief §2, no data loss).
 */
export function compactLocalizedDictionary(value: LocalizedDictionary): LocalizedDictionary | null {
  const compact: LocalizedDictionary = {}
  for (const [locale, localeValue] of Object.entries(value)) {
    if (isBlankLocaleValue(localeValue)) continue
    compact[locale] = localeValue
  }
  return Object.keys(compact).length > 0 ? compact : null
}
```

Import-cycle check: `validation/primitives.ts` has no imports; `localization.ts` imports only it and
`types.ts` (type-only). Consumers (`serialize.ts`, `seed-validation.ts`, `validation/*`,
`search/vector-extractor.ts`) import `localization.ts`; `localization.ts` imports none of them.

### Task 3 — Fatal 17 (`packages/core/src/engine/seed-validation.ts`)

Imports — add:
```ts
import { LOCALIZABLE_BRANCH_TYPES } from './localization.js'
import { resolveClassification } from './policies.js'
```

Insert immediately **before** `return result` (after Fatal 16):

```ts
  // ── Fatal 17: field-level localization constraints ─────────────────────────
  // A localized value is a readable locale dictionary. Encrypted or hashed storage turns it into an
  // opaque blob: per-locale extraction would be meaningless and would break decryption. Repeater
  // sub-fields are excluded by domain rule, whatever their type.
  for (const seed of seeds) {
    const messages: string[] = []
    for (const branch of seed.branches) {
      if (branch.localized !== undefined && typeof branch.localized !== 'boolean') {
        messages.push(`branch '${branch.alias}': localized must be a boolean`)
      } else if (branch.localized === true) {
        if (!LOCALIZABLE_BRANCH_TYPES.has(branch.type)) {
          messages.push(
            `branch '${branch.alias}': localized is only supported on text, richtext and json branches ` +
            `(got '${branch.type}').`,
          )
        } else {
          const { classification, storage } = resolveClassification(branch)
          if (storage !== 'plain') {
            messages.push(
              `branch '${branch.alias}': localized cannot be combined with '${classification}' classification ` +
              `(values are stored ${storage === 'encrypt' ? 'encrypted' : 'hashed'}).`,
            )
          }
        }
      }
      for (const sub of branch.fields ?? []) {
        if (sub.localized !== undefined && sub.localized !== false) {
          messages.push(
            `branch '${branch.alias}': sub-field '${sub.alias}' cannot be localized. ` +
            `Repeater sub-fields are never localized.`,
          )
        }
      }
    }
    if (messages.length > 0) result.push({ slug: seed.slug, messages, fatal: true })
  }
```

### Task 4 — `localizedSchema()` (`packages/core/src/engine/validation/schema-builders.ts`)

Imports — add:
```ts
import { isLocalizedWriteDictionary, toLocalizedPatch, type LocaleConfig, type LocalizedPatch } from '../localization.js'
```

Append after `schemaForBranch` (end of file):

```ts
/**
 * Compiles the schema of a localized branch. Top level only: `compileSeedSchema` is the sole caller, so
 * repeater sub-fields (validated through `schemaForBranch`) can never reach it.
 *
 * Accepts a plain value (→ default locale) or a locale dictionary, normalises it with
 * {@link toLocalizedPatch}, and validates every non-null locale value with the branch's base-type schema.
 * Output is a {@link LocalizedPatch}. Failures are reported at `<alias>.<locale>` for dictionary input
 * and at `<alias>` for a plain value, i.e. always at a path that exists in the client's payload.
 *
 * @param branch - A branch for which `isLocalizedBranch(branch)` is true.
 * @param options - The resolved validation options.
 * @param config - The project language configuration.
 * @returns The compiled localized schema.
 */
export function localizedSchema(branch: Branch, options: ResolvedOptions, config: LocaleConfig): z.ZodTypeAny {
  const valueSchema = schemaForBranch({ ...branch, localized: false }, { ...options, allowNull: false })
  return z.any().transform((raw, ctx) => {
    if (raw === null) {
      if (!options.allowNull) ctx.addIssue({ code: 'custom', message: 'Expected localized-value' })
      return null
    }
    const isDictionaryInput = isLocalizedWriteDictionary(raw, config)
    const patch = toLocalizedPatch(raw, config)
    const validated: LocalizedPatch = {}
    for (const [locale, localeValue] of Object.entries(patch)) {
      if (localeValue === null) {
        validated[locale] = null
        continue
      }
      const parsed = valueSchema.safeParse(localeValue)
      if (parsed.success) {
        validated[locale] = parsed.data
        continue
      }
      for (const issue of parsed.error.issues) {
        const innerPath = issue.path as (string | number)[]
        ctx.addIssue({
          code: 'custom',
          path: isDictionaryInput ? [locale, ...innerPath] : innerPath,
          // Keep the "Expected <type>" convention expectedFromIssue() relies on.
          message: issue.code === 'invalid_type' ? `Expected ${issue.expected}` : issue.message,
          params: (issue as { params?: Record<string, unknown> }).params,
        })
      }
    }
    return validated
  })
}
```

Notes for the executor:
- `params` is forwarded so a `dangerous` richtext translation still lands in `dangerousFields`
  (as `body.en`).
- `maxTextLength` applies **per locale value** (each is validated by the base-type schema). Total column size
  is therefore bounded by `locales.length × maxTextLength`; this is intended.

### Task 5 — option + required check (`packages/core/src/engine/validation/index.ts`)

Imports — add:
```ts
import { isLocalizedBranch, toLocalizedPatch, type LocaleConfig } from '../localization.js'
```

`ValidateSeedPayloadOptions` — add after `idGenerator`:
```ts
  /**
   * Project language configuration. When provided, branches with `localized: true` accept a plain
   * value (stored under `defaultLocale`) or a locale dictionary, and validate to a `LocalizedPatch`.
   * When omitted, localized branches validate exactly like their base type — the pre-localization
   * contract. `requiredOnCreate` / `requiredOnUpdate` then check the default locale only.
   */
  localeConfig?: LocaleConfig
```

`ResolvedOptions` — add `localeConfig: LocaleConfig | undefined`.

`validateAndSanitizeSeedPayload` — in the `resolved` literal add `localeConfig: options.localeConfig,`.

`detectMissingRequired` — replace the line
`const candidate = parseSucceeded ? parsedData[branch.alias] : filtered[branch.alias]` with:
```ts
    const value = parseSucceeded ? parsedData[branch.alias] : filtered[branch.alias]
    // A localized branch is present when its default locale is; other locales are optional (brief §4).
    const candidate = options.localeConfig && isLocalizedBranch(branch)
      ? toLocalizedPatch(value, options.localeConfig)[options.localeConfig.defaultLocale]
      : value
```
(`toLocalizedPatch` is idempotent, so it is correct on both the parsed patch and the raw input.)
The emitted `ValidationDetail` shape and codes (`required-field` / `missing` / `empty`) are unchanged.

### Task 6 — dispatch + cache (`packages/core/src/engine/validation/cache.ts`)

Imports — add `localizedSchema` to the `./schema-builders.js` import and:
```ts
import { isLocalizedBranch } from '../localization.js'
```

`BranchFingerprint` — add:
```ts
  /** Whether the branch is localized. */
  lo: boolean
```
`buildBranchFingerprint` — add `lo: branch.localized === true,`.

`buildCacheKey` — append one element to the array:
```ts
    options.localeConfig
      ? `${options.localeConfig.defaultLocale}>${options.localeConfig.locales.join(',')}`
      : '-',
```

`compileSeedSchema` loop — replace `const branchSchema = schemaForBranch(branch, options)` with:
```ts
    const branchSchema = options.localeConfig && isLocalizedBranch(branch)
      ? localizedSchema(branch, options, options.localeConfig)
      : schemaForBranch(branch, options)
```

### Task 7 — storage codec (`packages/core/src/engine/serialize.ts`)

Imports — add:
```ts
import { compactLocalizedDictionary, isLocaleDictionary, isLocalizedBranch } from './localization.js'
```

`serializeForDb` — insert right after `if (value === null || value === undefined) return null`:
```ts
  // Must precede the type switch: its `text` case returns null for any object, which would silently
  // erase a dictionary on a localized text branch.
  if (isLocalizedBranch(branch) && isLocaleDictionary(value)) {
    const compact = compactLocalizedDictionary(value)
    return compact === null ? null : JSON.stringify(compact)
  }
```

`deserializeFromDb` — insert right after `if (value === null || value === undefined) return null`:
```ts
  // richtext/json already JSON.parse below; text must opt in. A legacy plain string written before the
  // branch became localized is returned unchanged — the read-side fallback chain handles it.
  if (branch.type === 'text' && isLocalizedBranch(branch) && typeof value === 'string' && value.startsWith('{')) {
    const parsed = parseJsonSafe(value)
    return isLocaleDictionary(parsed) ? parsed : value
  }
```
Update the two JSDoc summaries with one line each: "Localized branches: locale dictionary ↔ compact JSON."

### Task 8 — vector extractor (`packages/core/src/search/vector-extractor.ts`)

Imports — add:
```ts
import { isLocaleDictionary, isLocalizedBranch } from '../engine/localization.js'
```
Replace the loop body:
```ts
  for (const branch of branches) {
    const val = entry[branch.alias]
    if (val && typeof val === 'string') {
      texts.push(val)
    } else if (isLocalizedBranch(branch) && isLocaleDictionary(val)) {
      // Every language is indexed, so a query matches regardless of the language it is typed in.
      for (const localeValue of Object.values(val)) {
        if (typeof localeValue === 'string' && localeValue) texts.push(localeValue)
      }
    }
  }
```
(Localized richtext dictionaries hold envelopes, not strings, and stay skipped — identical to today's
non-localized richtext behaviour.)

### Task 9 — schema contract (`packages/core/src/engine/schema-fingerprint.ts`)

`ContractBranch` — add after `maxItems?: number`:
```ts
  /** Present only when true: the dictionary shape is part of the public contract (`?lang=all`, writes). */
  localized?: boolean
```
`projectBranch` — add after the `maxItems` spread:
```ts
    // Spread only when true so every schema without localized branches keeps its fingerprint.
    ...(branch.localized === true ? { localized: true } : {}),
```
`SCHEMA_FINGERPRINT_VERSION` stays `1`.

### Task 10 — barrel (`packages/core/src/index.ts`)

After L19 (`export * from './engine/validation/index.js'`) add:
```ts
export * from './engine/localization.js'
```
No name collisions (`grep` for `LocaleConfig|isLocaleCode|LOCALE_CODE_RE|LocalizedPatch` → 0 hits in the
workspace).

### Task 11 — retype guard (`apps/api/src/features/seeds/seeds.destructive.ts`)

Insert after the repeater guard (`if (branch.type === 'repeater' || newType === 'repeater') {…}`, ends
L242) and **before** `requireConfirm`:

```ts
  // Retype persists through applyDestructiveSeedDef, which never runs validateSeedDefinitions: without
  // this guard `localized: true` would survive onto a non-localizable type and stored dictionaries would
  // be reinterpreted as the new type. Disabling localization is metadata-only, so the owner can do that first.
  if (branch.localized === true) {
    return publicProblem(context, {
      type: 'retype-localized-not-supported',
      title: 'Retype not supported',
      status: 422,
      detail: `Branch '${branch.alias}' is localized. Disable localization on it before retyping.`,
    })
  }
```

### Task 12 — tests

Conventions: `_config/testing_conventions.md`. Four zones, one act, no `should`, no `any`, fresh state per
test. Core suites are unit tier (pure, no I/O). Hand-rolled seeds/configs are permitted in the core unit
suites exactly as the existing `seed-validation.test.ts` / `schema-builders.test.ts` do (engine definitions,
not entity fixtures). Shared config literal for T1/T3/T5:
`const CONFIG: LocaleConfig = { locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }`.

**T1 — `localization.test.ts`** (`describe` per exported symbol):
- `isLocaleCode`: `accepts it, en, pt-BR and es-419 and rejects IT, en_US, zh-Hant, e and 4-letter codes`
  (matrix, Rule 1.6).
- `isLocalizedBranch`: `is true only for localized text, richtext and json` (matrix over all 10 types).
- `isLocaleDictionary`: `accepts an object whose every key is a locale code`;
  `rejects an empty object, an array, a richtext envelope and a TipTap doc`.
- `isLocalizedWriteDictionary`: `rejects a json value whose short keys match the grammar but name no registered locale`
  — `{ url: 'https://x', alt: 'A' }` → `false`. **Regression guard comment** (Rule 6.2.4): data loss on
  legitimate json values.
- `toLocalizedPatch`:
  - `wraps a plain string under the default locale` → `{ it: 'Scarpa' }`.
  - `keeps registered locales in config order and drops unregistered locale keys` —
    input `{ en: 'Shoe', de: 'Schuh', it: 'Scarpa' }` → `toEqual({ it: 'Scarpa', en: 'Shoe' })` and
    `Object.keys(...)` equals `['it', 'en']`.
  - `turns empty and whitespace-only locale values into null` — `{ it: 'x', en: '  ' }` → `{ it: 'x', en: null }`.
  - `wraps a non-dictionary json object under the default locale` — `{ url: 'u', alt: 'a' }` →
    `{ it: { url: 'u', alt: 'a' } }`.
  - `returns the same patch when applied to its own output` (idempotence).
- `compactLocalizedDictionary`:
  - `drops null and blank entries but keeps unregistered locales` — `{ it: 'x', en: null, de: 'y', fr: '' }` →
    `{ it: 'x', de: 'y' }`.
  - `returns null when every entry is blank`.

**T2 — `seed-validation.test.ts`** — new block `// ── Fatal 17: localization ──` inside the existing
`describe('validateSeedDefinitions')`, using the file's `makeSeed`:
- `fatal: localized on a non-localizable type` — matrix over `number, boolean, date, file, tags, relation
  (with a valid targetSeed in the set), repeater`; each yields a fatal issue for the seed whose messages
  contain `localized is only supported`.
- `fatal: localized on confidential, restricted and legacy privacy encrypt/hash storage` — matrix over
  `policies: { classification: 'confidential' }`, `{ classification: 'restricted' }`, `{ privacy: 'encrypt' }`,
  `{ privacy: 'hash' }`.
- `fatal: localized on a repeater sub-field of text type`.
- `fatal: non-boolean localized` (`localized: 'yes' as unknown as boolean`).
- `accepts localized text, richtext and json with public or internal classification` →
  `validateSeedDefinitions(...)` is `[]`.

**T3 — `validation/localized-schema.test.ts`** (NEW; `describe('validateAndSanitizeSeedPayload — localized branches')`).
Seed: `title` (text, `localized: true`, `requiredOnCreate: true`), `body` (richtext, `localized: true`),
`meta` (json, `localized: true`), `code` (text, not localized).
- `wraps a plain string under the default locale` → `data.title` equals `{ it: 'Scarpa' }`, `details` `[]`.
- `accepts a dictionary and drops unregistered locales` → `{ it: 'Scarpa', en: 'Shoe' }` from
  `{ it: 'Scarpa', en: 'Shoe', de: 'Schuh' }`.
- `marks a blank translation as a null clear-marker` → `{ it: 'Scarpa', en: null }`.
- `reports a per-locale type error at alias.locale` — `{ it: 'Scarpa', en: 42 }` →
  `details` contains `{ field: 'title.en', expected: 'string' }` (`toMatchObject`), `data` has no `title`.
- `reports a plain-value type error at the alias itself` — `title: 42` → field `title` (Violation 4 guard).
- `flags dangerous richtext in one translation as alias.locale` — `body: { it: <safe doc>, en: <doc with
  javascript: link> }` → `dangerousFields` equals `['body.en']`. Reuse the dangerous-document literal already
  used in `richtext-sanitizer.test.ts` (copy the literal; do not import from another test file).
- `satisfies requiredOnCreate with the default locale alone` — `{ title: { it: 'Scarpa' } }` →
  `requiredFieldsMissing` `[]`.
- `reports requiredOnCreate when only a non-default locale is provided` — `{ title: { en: 'Shoe' } }` →
  `requiredFieldsMissing` equals `['title']`.
- `treats localized branches as their base type when no localeConfig is passed` — `title: { it: 'x' }` with
  no option → `details` contains `field: 'title'`, `expected: 'string'` (backward-compat guard).
- `returns null for an explicit null when allowNull is true` → `data.title` is `null`.
- `leaves non-localized branches untouched` — `code: { it: 'x' }` fails as `string` even with `localeConfig`.

**T4 — `validation/cache.test.ts`** (extend):
- `compiles distinct schemas for different locale configurations` — same seed, configs
  `{ ['it','en'], 'it' }` vs `{ ['it'], 'it' }`: `{ title: { it: 'a', en: 'b' } }` keeps `en` under the first
  and drops it under the second.
- `recompiles when a branch is toggled to localized` — same slug, `localized` false then true, same config:
  plain string validates to `'x'` then to `{ it: 'x' }`.

**T5 — `serialize.test.ts`** (extend; `describe('serializeForDb')` / `describe('deserializeFromDb')`):
- `serializes a localized dictionary to compact JSON` — `{ it: 'a', en: null, fr: '' }` → `'{"it":"a"}'`.
- `serializes an all-blank localized dictionary to null`.
- `keeps serializing a plain string on a localized text branch as the raw string`.
- `deserializes a stored dictionary on a localized text branch to an object`.
- `returns a legacy plain string on a localized text branch unchanged`.
- `leaves a JSON-looking string on a non-localized text branch as a string` — **regression guard comment**:
  non-localized text must never change shape.
- `round-trips a localized richtext dictionary of envelopes`.

**T6 — `vector-extractor.test.ts`** (extend):
- `indexes every locale of a localized text dictionary` — `title: { it: 'Scarpa', en: 'Shoe' }` → result
  contains both words.
- `ignores a dictionary-shaped object on a non-localized branch`.

**T7 — `schema-fingerprint.test.ts`** (extend):
- `omits localized from the projection when false or absent` — `localized: false` and absent project
  identically (`toEqual`) and neither has the key. **Regression guard comment**: published clients'
  fingerprints must not move.
- `changes the fingerprint when a branch becomes localized`.

**T8 — `apps/api/src/features/seeds/test/integration/seed-localization.integration.test.ts`** (NEW)

Template: `_config/testing_conventions.md` §9.1 and `seed-ownership.integration.test.ts` (same harness,
`__resetSeedRegistryCache()` + `createTestHarness({ db: env.DB, createApp: … createBeechApp({ seeds: [], authProviders }) })`,
`admin = await harness.asUser('admin')`). File docblock: "Seeds slice — localization integration tier. Covers
the schema-level rules of field localization through the real Seeds API and D1: illegal combinations are
refused, the toggle is metadata-only, and retype refuses localized branches. Content read/write behaviour is
covered by the content and public slices in later sprints."

`describe('seeds slice — localization (real D1)')`:

- `describe('POST /api/seeds')`
  - `refuses localized on number, a repeater sub-field and confidential text with 422 and creates no table`
    — matrix of three candidate definitions (each with a valid `title` text branch plus the offending branch;
    slugs `loc_bad_number`, `loc_bad_sub`, `loc_bad_conf`). Per case: status `422`, body `type` contains
    `validation-failed`, and
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?` for `content_<slug>` is `0`.
  - `accepts localized text, richtext and json branches and persists the flag` — `201`; `GET /api/seeds/:slug`
    → the three branches carry `localized: true`.
- `describe('PUT /api/seeds/:slug')`
  - `toggles localized on a text branch with existing rows without touching columns or stored values`
    - ARRANGE: create seed `loc_toggle` (`title` text, `requiredOnCreate`); `POST /api/content/loc_toggle`
      `{ title: 'Scarpa', slug: 'scarpa' }` → assert `201` in one line (precondition); capture
      `PRAGMA table_info(content_loc_toggle)` results; read the stored definition.
    - ACT: `PUT /api/seeds/loc_toggle` with the stored definition, `title` branch spread with `localized: true`.
    - ASSERT RESPONSE: `200`.
    - ASSERT STATE: `GET /api/seeds/loc_toggle` → `title.localized === true`; `PRAGMA table_info` result
      `toEqual` the captured one (metadata-only proof); `SELECT title FROM content_loc_toggle WHERE slug = 'scarpa'`
      → `'Scarpa'` (no backfill, no rewrite).
- `describe('PATCH /api/seeds/:slug/branches/:branchId/retype')`
  - `refuses to retype a localized branch with 422 and leaves its type and column intact`
    - ARRANGE: seed `loc_retype` with `title` (text) and `subtitle` (text, `localized: true`); read the stored
      definition to get `subtitle`'s `br_XX` id (never hardcode it).
    - ACT: `PATCH /api/seeds/loc_retype/branches/<id>/retype` `{ newType: 'number', confirm: 'loc_retype.subtitle' }`.
    - ASSERT RESPONSE: `422`, body `type` contains `retype-localized-not-supported`.
    - ASSERT STATE: stored `subtitle.type === 'text'`, `localized === true`; `PRAGMA table_info` reports
      `subtitle` with `type` `TEXT`.

Each `it` creates its own slug (no cross-test state; Rule 3.3).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root.

1. Core build + unit tests:
   - `pnpm --filter @beechcms/core build`
   - `pnpm --filter @beechcms/core test`
2. API type-check: `npx tsc -p tsconfig.build.json --noEmit` in `apps/api/`
3. API unit tier (existing seeds / validation suites must stay green): `pnpm --filter @beechcms/api test:unit`
4. API integration tier (workerd, real D1): `pnpm --filter @beechcms/api test:integration`
5. Dashboard type-check (additive `Branch` field must not break it): `pnpm --filter @beechcms/dashboard type-check`
   (runs `tsc -b`)
6. Workspace: `pnpm beech test --diff` and `pnpm lint`

No `pnpm beech db:migrate` / `db:reset` step: the sprint has no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `Branch.localized?: boolean` exists and is documented; no other `Branch` field changes.
- [ ] `localization.ts` exports exactly: `LOCALE_CODE_RE`, `LOCALIZABLE_BRANCH_TYPES`, `LocaleConfig`,
      `LocalizedDictionary`, `LocalizedPatch`, `isLocaleCode`, `isLocalizedBranch`, `isLocaleDictionary`,
      `isLocalizedWriteDictionary`, `toLocalizedPatch`, `compactLocalizedDictionary`; it performs no I/O and
      imports nothing outside `packages/core/src`. All are re-exported from `@beechcms/core`.
- [ ] `@beechcms/core` `package.json` `dependencies` unchanged.
- [ ] Fatal 17 rejects `localized: true` on every non-`text|richtext|json` type, on repeater sub-fields, and on
      `encrypt`/`hash` storage (both `classification` and legacy `privacy` spellings), and rejects non-boolean
      values. It accepts localized `text|richtext|json` with `public`/`internal` classification.
- [ ] `POST /api/seeds` with an illegal localized combination → `422 validation-failed`, no `content_<slug>` table.
- [ ] Toggling `localized` via `PUT /api/seeds/:slug` on a branch with rows → `200`, identical
      `PRAGMA table_info`, stored values unchanged.
- [ ] `PATCH …/retype` on a localized branch → `422 retype-localized-not-supported`, definition and column unchanged.
- [ ] With `localeConfig`: plain value → `{ [defaultLocale]: value }`; unregistered locale keys dropped; blank
      → `null`; per-locale errors at `<alias>.<locale>`; plain-value errors at `<alias>`; dangerous richtext
      translation reported as `<alias>.<locale>`; `requiredOnCreate/Update` satisfied by the default locale alone.
- [ ] Without `localeConfig`: every existing validation test passes unchanged; a localized branch validates as
      its base type.
- [ ] A json value such as `{"url": "…", "alt": "…"}` on a localized json branch is wrapped under the default
      locale, never emptied.
- [ ] `serializeForDb` on a localized dictionary writes compact JSON with no `null`/blank entries, or SQL `NULL`
      when empty; non-localized branches serialize byte-identically to today.
- [ ] `deserializeFromDb` returns an object for a stored dictionary on a localized `text` branch and the raw
      string for a legacy value; non-localized `text` is unchanged.
- [ ] `extractIndexableText` includes every language of a localized text dictionary.
- [ ] `projectSchemaContract` output and `computeSchemaFingerprint` value are unchanged for any seed set with no
      `localized: true` branch; `SCHEMA_FINGERPRINT_VERSION === 1`.
- [ ] Zero changes under `apps/api/src/{public,middleware,shared,factory.ts,types.ts}`, `apps/api/migrations`,
      `apps/dashboard`, `packages/{client,api-client,mcp,cli,testing}`.
- [ ] All commands in SECTION 5 pass; every new test file conforms to `testing_conventions.md` (§8 checklist).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following in this sprint:

- **Project locale configuration** — `site_settings` keys `locales` / `defaultLocale`, `SiteSettings` /
  `D1SiteSettingsRepository` changes, `GET/PUT /api/settings` changes, `resolveLocaleConfig()`, per-request
  `LocaleConfig` provisioning. → ROADMAP §2 `LocalizedWritePath`.
- **Passing `localeConfig` from any API handler** (create, update, draft, bulk, kanban move, public add/edit)
  and **merging patches into stored dictionaries** (`applyLocalizedPatch()`). Until then no API path stores a
  dictionary through validation. → ROADMAP §2.
- **Read-side resolution** — `resolveLocalizedValue()`, `?lang` / `Accept-Language` negotiation,
  `?lang=all|*`, flat public projection, masked-visibility handling of dictionaries, edge-cache key /
  `Vary: Accept-Language`, relation includes. → ROADMAP §3 `LocalizedReadNegotiation`.
- **Filtering and sorting through the active locale** (`SelectOptions.locale`, `json_extract` in
  `buildSelectQuery`). → ROADMAP §3.
- **`@beechcms/client` `.lang(code)`**. → ROADMAP §3.
- **Any dashboard work** — Settings languages UI, Seed Builder toggle, value rendering, Entry Editor language
  selector, fallback indicator, "Copia dal valore predefinito", completion indicator. → ROADMAP §4 and §5.
- **Documentation** (`docs/`) — written when the feature is observable through the API (ROADMAP §3).
- **Any change to FTS DDL/triggers, `ddl.ts`, `seed-ddl*.ts`, `query.ts`, `policies.ts`, the type generator,
  migrations, or `D1ContentRepository`.**
- Permanently out of scope (brief §5): localized slugs, built-in machine translation, dashboard UI i18n,
  per-language RBAC, nested/partial json translation, orphan-locale purge tool, multi-currency.
