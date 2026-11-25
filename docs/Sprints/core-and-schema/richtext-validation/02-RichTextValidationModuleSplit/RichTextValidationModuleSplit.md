# Sprint Plan — RichTextValidationModuleSplit (Phase 2: Mechanical Split, zero logic change)

> Follow-up sprint. Sprint 1 (`RichTextValidationRenderHardening`) is **MERGED** and archived at
> `docs/Sprints/RichTextValidationRenderHardening/`. This is the second and final sprint of the
> RichText Validation & Render Hardening feature (see `output/backlog/ROADMAP.md`). It operates on
> the **live 1214-line** `packages/core/src/engine/validation.ts` that Sprint 1 produced.

### Re-Plan Note — Rejection Addressed (2026-07-07)

> **Prior rejection (`output/rejections.md`):** the previous draft placed `fileSchema` in
> `file-branch.ts`, but `fileSchema`'s body calls `withNullable`/`withEmptyPreprocessing`, which live
> in `schema-builders.ts`; meanwhile `schema-builders.ts` imported `fileSchema` back from
> `file-branch.ts` → runtime import cycle `file-branch ⇄ schema-builders`, contradicting the "verified
> acyclic" DAG.
>
> **Root cause:** `fileSchema` was miscategorized. It is a **Zod schema builder** (verbatim sibling of
> `textSchema`/`numberSchema`/`relationSchema`), not a file-URL helper. It depends *downward* on the
> two `withX` combinators and on the file-URL leaf helpers.
>
> **Fix (this re-plan):** `fileSchema` moves into **`schema-builders.ts`** (with `withNullable`,
> `withEmptyPreprocessing`, and every other builder). `file-branch.ts` keeps ONLY the file-URL leaf
> helpers + the public `resolveFileOptions`, and imports nothing from `schema-builders`. The edge
> becomes single-directional `schema-builders → file-branch`. Cycle eliminated by construction, not by
> duplicating helpers and not by touching `primitives.ts` (both forbidden by SECTION 7). No new module,
> still 6 files. Every downstream change (SECTION 2 map, SECTION 3 deliverables, TASK 3/TASK 4, DAG)
> reflects this.

### Pre-Computation Analysis

> **Graph staleness note (must read):** `graphify` reports `skill 0.7.15 vs package 0.9.5` and its
> node source points at `packages/core/src/validation.ts L730` — a **pre-refactor path**. The graph
> predates the v0.4 doctype refactor that moved the file to `engine/`. The `affected` fan-out
> (consumer set) is still directionally correct, so it is reported below as the God-Node proof, but
> the authoritative consumer list was **cross-verified by `grep`** against the working tree (the
> grep set is a strict superset — it additionally finds `draft.handler.ts`, `rotate-field.handler.ts`
> and the dashboard `media.tsx` consumer of `resolveFileOptions`, which the stale graph omits).
> Regenerating the graph (`graphify update . --force`) is **not** in this sprint's scope.

**a) God Nodes (via `graphify affected` + grep cross-check)**

1. **`validateAndSanitizeSeedPayload()`** — the single public input gate; the file being split
   exists to expose it. `graphify affected "validateAndSanitizeSeedPayload" --depth 2` fans out to
   every write path; grep confirms the full live consumer set (all import from `@beechcms/core`, the
   package barrel — **none** import the file by relative path):
   - `apps/api/src/features/content/handlers/create.ts` (`createHandler`)
   - `apps/api/src/features/content/handlers/update.ts` (`updateHandler`, also `isValidContentStatus`)
   - `apps/api/src/features/content/handlers/kanban-move.ts` (`kanbanMoveHandler`)
   - `apps/api/src/features/draft/draft.handler.ts` (grep-only; missed by stale graph)
   - `apps/api/src/features/rotate-field/rotate-field.handler.ts` (grep-only)
   - `apps/api/src/public/sanitize.ts` (`sanitizePublicPayload`; also imports type `ValidationDetail`)
   - `apps/api/src/public/public-add.ts`, `public-edit.ts` (`isValidContentStatus`)
   - `apps/api/test/core-validation.test.ts` (imports from `@beechcms/core`)
   - `packages/core/src/engine/validation.test.ts` (imports by **relative path** `./validation.js`)

2. **`resolveFileOptions()`** — the second public export. Consumed by
   `apps/dashboard/src/components/fields/display/media.tsx:12` (via `@beechcms/core`) and internally
   by `fileSchema`. It must remain in the public surface after the split.

3. **The barrel edge `packages/core/src/index.ts:19`** — `export * from './engine/validation.js'`.
   This one line is the entire public contract: it re-exports the file's 6 public symbols. It is a
   God edge — every `@beechcms/core` consumer of validation flows through it.

**b) Architectural boundaries affected**

| Boundary | Touched? | Nature |
|----------|----------|--------|
| `@beechcms/core` engine slice | **YES (structure only)** | `engine/validation.ts` (1 file) → `engine/validation/` (6 files). Pure code relocation; zero runtime logic delta. |
| `@beechcms/core` package barrel (`src/index.ts`) | **YES (1 line)** | L19 re-point `./engine/validation.js` → `./engine/validation/index.js`. The `export *` set is preserved identically. |
| `apps/api` (all handlers, public routes, `apps/api/test`) | **NO** | Import from `@beechcms/core`; the barrel surface is unchanged. Zero edits. |
| `apps/dashboard` (`media.tsx`) | **NO** | `resolveFileOptions` still exported from the barrel. Zero edits. |
| `content/richtext`, `media/file-types`, `common/id-generator` | **NO** | Consumed by the split modules via `import`; relative paths deepen by one segment (`../` → `../../`) but the imported modules are untouched. |
| caching / `SeedRegistry` layer | **NO** | The in-file `seedSchemaCache` moves verbatim into `cache.ts`; no cache semantics change (brief §5 exclusion honored). |

**c) `graphify affected` impact / breaking-change proof**

- **Public surface is byte-identical.** The 6 exported symbols — `validateAndSanitizeSeedPayload`,
  `resolveFileOptions`, `isValidContentStatus` (functions) and `ValidationDetail`,
  `ValidateSeedPayloadOptions`, `ValidateSeedPayloadResult` (interfaces) — keep identical names,
  signatures, and shapes. Only their *file of origin* moves; the barrel re-exports the same set.
- **No consumer signature breaks.** Every `apps/` consumer imports from `@beechcms/core`; the barrel
  (`src/index.ts`) still `export *`s the identical set → zero downstream import edits, zero type
  drift. `graphify affected` shows all fan-out lands on the barrel, not on internal helpers.
- **Only two relative-path re-points** (both inside `packages/core`, neither a public consumer):
  `src/index.ts:19` and `src/engine/validation.test.ts:16` (`./validation.js` → `./validation/index.js`).
- **Zero runtime behavior change** (this is the sprint's defining invariant): no new/removed code
  paths, no reordered evaluation, no dependency added/removed, no D1 schema change. The
  `(issue as any).errors` tidy is compile-time-only (type erased at build).

---

### VETO Audit

Evaluated against `ponytail_arch.md`:

1. **BOTANICAL INVARIANT (no bypass of `@beechcms/core`).** ✅ Everything stays inside
   `@beechcms/core/engine`. No D1 query is added or moved; no hardcoded field name; branch handling
   stays keyed on `Branch`/`br_XX` definitions exactly as before. The split relocates code within the
   single source of truth — it does not create a second validation path.
2. **VSA ENFORCEMENT (no cross-feature imports).** ✅ All 6 new files are **intra-slice**
   (`engine/validation/*`). The intra-package edges to `content/richtext`, `media/file-types`,
   `common/id-generator` already existed in the monolith and are preserved 1:1 (only the relative
   depth changes). No `apps/api/features/*` or `apps/dashboard/src/features/*` cross-import is created.
   No shared logic needs promotion — it is already in core.
3. **CLOUDFLARE PURITY.** ✅ Pure TS relocation. No dependency added (`package.json` untouched), no
   ORM, no background job, no SQLite change. Bundle output is functionally identical; tree-shaking is
   unaffected because the barrel `export *` surface is unchanged.
4. **YAGNI / MINIMALIST — deviation audit.** The ROADMAP named **5** modules
   (`richtext-sanitizer`, `file-branch`, `schema-builders`, `cache`, `index`). The split requires a
   **6th** leaf, `primitives.ts`, for the three genuinely cross-module helpers
   (`stripControlChars`, `cleanString`, `isPlainObject`) used by ≥2 of the leaf modules.
   - **Why not fold them into `index.ts`?** `index.ts` imports `cache` → `schema-builders` →
     `{richtext-sanitizer, file-branch}`. If those leaves imported their primitives *from* `index.ts`,
     the graph becomes cyclic (`index → schema-builders → richtext-sanitizer → index`). A runtime
     import cycle in the exact security-critical module is precisely the fragility this split exists
     to remove. A dedicated leaf keeps the DAG acyclic (`primitives` is a pure sink with no local
     imports). This is the *minimal* structure that satisfies "zero cycles", not over-engineering.
   - **VERDICT:** deviation ACCEPTED and documented. It is the smallest change that keeps the split
     pure-move **and** acyclic. Low-fan-out helpers `tryParseJson` and `isValidIsoDate` (sole consumer
     each) are **not** promoted to `primitives.ts` — they live with their consumer. `parseHttpUrl` has
     two consumers (`collectAssetListUrls` in file-branch, `fileSchema` in schema-builders) but both
     sit *at or above* file-branch, so it stays **exported from file-branch** (still a downward edge)
     rather than being pushed into `primitives.ts` — it is file-domain logic, not a generic primitive.

5. **CYCLE-FREEDOM (the rejection).** ✅ The prior draft's `file-branch ⇄ schema-builders` cycle is
   eliminated structurally: `fileSchema` now lives in `schema-builders.ts`, so `file-branch.ts` imports
   **nothing** from `schema-builders.ts`. The only inter-module edge between them is the single
   downward `schema-builders → file-branch`. Verified against every `fileSchema` dependency
   (`resolveFileOptions`, `isAssetListBranch`, `collectAssetListUrls`, `parseHttpUrl`): all resolve
   downward. No `withNullable`/`withEmptyPreprocessing` duplication; `primitives.ts` untouched by the
   fix (SECTION 7 respected).

No blocking violation. Rejection resolved. Plan proceeds. **HANDOFF -> caveman_coder.**

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint exists **second and last** in the feature (Sprint 1 shipped the security fix; this ships
the maintainability follow-up). It exists **as its own sprint** — never merged into Sprint 1 — because
`feature_brief.md` §4 makes it a hard delivery constraint: coupling a 1200-line restructure with a
security-critical patch on the exact file attackers touch produces an unreviewable diff. Sprint 1's
diff had to be auditable as "here is what changed about XSS"; this sprint's diff must be auditable as
"nothing changed except where the code lives." Those are two different review lenses and must not
share a PR.

It runs **after** Sprint 1 (not before) because it moves the code Sprint 1 just hardened. Planning it
earlier would have encoded stale line ranges; the ranges in SECTION 4 are re-derived against the live
1214-line file as it exists post-merge.

VSA / Botanical adherence: the change is confined to the `@beechcms/core` engine slice, the single
source of truth. `apps/api` and `apps/dashboard` consume the unchanged `@beechcms/core` barrel
surface — no slice reaches around core, no cross-feature import is created, no D1 path moves. The
decomposition's whole purpose is to make the *next* edit to this security surface safe: a focused
150–300-line module cannot silently drop a line the way a 1200-line monolith can.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify + grep + Read)
==========================================================================

**The file:** `packages/core/src/engine/validation.ts` — **1214 lines**, single module, post-Sprint-1.
Its top-of-file imports (L4–L9), which must be redistributed to the new modules:

```ts
import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from './types.js'
import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from '../content/richtext/richtext.js'
import type { FileAccept } from '../media/file-types.js'
import { extensionFromUrl, isExtensionAccepted } from '../media/file-types.js'
import type { IIdGenerator } from '../common/id-generator.js'
```

**Public export surface (the contract to preserve — verified via `export * from './engine/validation.js'`):**

| Symbol | Kind | Current line | Consumers (all via `@beechcms/core`) |
|--------|------|-------------|--------------------------------------|
| `ValidationDetail` | `interface` | L22 | `public/sanitize.ts` |
| `ValidateSeedPayloadOptions` | `interface` | L36 | (type surface; re-exported) |
| `ValidateSeedPayloadResult` | `interface` | L75 | (type surface; re-exported) |
| `resolveFileOptions` | `function` | L227 | `dashboard/.../display/media.tsx`, internal `fileSchema` |
| `validateAndSanitizeSeedPayload` | `function` | L1146 | create/update/kanban-move/draft/rotate-field/sanitize handlers |
| `isValidContentStatus` | `function` | L1211 | create/update/public-add/public-edit handlers |

**Internal structure (section banners already present in the file), mapped to target modules:**

| Current lines | Content | Target module |
|---------------|---------|---------------|
| L110–111, L147–169 | `CONTROL_CHARS_REGEX`, `stripControlChars`, `cleanString`, `isPlainObject` | `primitives.ts` |
| L112–130 | `ALLOWED_RICHTEXT_NODE_TYPES`, `ALLOWED_RICHTEXT_MARK_TYPES`, `URL_LIKE_RICHTEXT_KEYS`, `ALLOWED_URL_PROTOCOLS`, `RICHTEXT_MAX_DEPTH` | `richtext-sanitizer.ts` |
| L177–183 | `tryParseJson` (sole consumer: `collectAssetListUrls`) | `file-branch.ts` |
| L191–202 | `parseHttpUrl` (consumers: `collectAssetListUrls`, `fileSchema`) | `file-branch.ts` |
| L210–215 | `isValidIsoDate` (sole consumer: `dateSchema`) | `schema-builders.ts` |
| L106, L108 | `DEFAULT_MAX_TEXT_LENGTH` → `index.ts`; `DEFAULT_FILE_MAX_SIZE` → `file-branch.ts` | (split) |
| L227–281 | `resolveFileOptions` (public), `isAssetListBranch`, `extractUrlFromCandidate`, `collectAssetListUrls` | `file-branch.ts` |
| L287–463 | `RichtextSanitizeResult`, `SanitizeState`, `sanitizeRichtextString`, `isProtocolAllowed`, `walkRichtextNode`, `sanitizeRichtextJson`, `sanitizeRichtext`, `gatherRichtextText`, `isRichtextDocEmpty` | `richtext-sanitizer.ts` |
| L476–712 | `withNullable`, `withEmptyPreprocessing`, `textSchema`, `richtextSchema`, `decimalPlaces`, `numberSchema`, `booleanSchema`, `dateSchema`, `jsonOrTagsSchema`, `relationSchema`, **`fileSchema`** | `schema-builders.ts` |
| L718–780 | `REPEATER_DISALLOWED_SUBTYPES`, `repeaterSchema`, `BRANCH_SCHEMA_BUILDERS`, `schemaForBranch` | `schema-builders.ts` |
| L787–901 | `seedSchemaCache`, `BranchFingerprint`, `buildBranchFingerprint`, `buildSeedFingerprint`, `buildCacheKey`, `compileSeedSchema` | `cache.ts` |
| L22–103, L132–135 | public interfaces + `ResolvedOptions` + `STATUS_VALUES`/`statusSchema` + `DEFAULT_MAX_TEXT_LENGTH` | `index.ts` |
| L913–975 | `isEffectivelyEmpty`, `detectMissingRequired` | `index.ts` |
| L987–1128 | `describeReceivedType`, `expectedFromMessage`, `splitUnknownAliases`, `flattenZodIssues`, `processZodIssues` | `index.ts` |
| L1146–1213 | `validateAndSanitizeSeedPayload`, `isValidContentStatus` | `index.ts` |

**Target dependency DAG (verified acyclic — the whole point of the split):**

```
primitives.ts            (no local imports — pure sink)
  ▲                    ▲                     ▲
richtext-sanitizer.ts   file-branch.ts       │
  ▲                    ▲   (url helpers +     │
  │                    │    resolveFileOptions;│
  │                    │    imports media/file-types + primitives ONLY)
  │                    │
schema-builders.ts ────┘   (imports richtext-sanitizer + file-branch + primitives;
  ▲                          fileSchema lives here — depends downward on withNullable/
  │                          withEmptyPreprocessing (local) + file-branch url helpers)
cache.ts             (imports schema-builders)
  ▲
index.ts             (imports cache + richtext-sanitizer + file-branch + primitives; re-exports resolveFileOptions)
```

**Cycle-freedom (the rejected draft's failure, now fixed):** `file-branch.ts` imports **nothing** from
`schema-builders.ts`. `fileSchema` — the only symbol that pulled the edge backward — now sits *in*
`schema-builders.ts`, so its dependency on `withNullable`/`withEmptyPreprocessing` is a **local**
reference, and its dependency on the file-URL helpers (`resolveFileOptions`, `isAssetListBranch`,
`collectAssetListUrls`, `parseHttpUrl`) is a single **downward** `schema-builders → file-branch` edge.
No back edge exists.

Runtime import edges above are all downward → **no cycle**. `ResolvedOptions` (defined in `index.ts`)
is needed by `schema-builders.ts` and `cache.ts`; it is imported **type-only** (`import type`), which
TypeScript erases at build → the `schema-builders → index` / `cache → index` edges do **not** exist at
runtime and cannot form a cycle.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Create — 6 files under new dir `packages/core/src/engine/validation/`:**

1. `primitives.ts` — `CONTROL_CHARS_REGEX`, `stripControlChars`, `cleanString`, `isPlainObject`.
2. `richtext-sanitizer.ts` — richtext allowlist consts + `RichtextSanitizeResult`, `SanitizeState`,
   `sanitizeRichtextString`, `isProtocolAllowed`, `walkRichtextNode`, `sanitizeRichtextJson`,
   `sanitizeRichtext`, `gatherRichtextText`, `isRichtextDocEmpty`.
3. `file-branch.ts` — `DEFAULT_FILE_MAX_SIZE`, `tryParseJson`, `parseHttpUrl`, `resolveFileOptions`
   (public), `isAssetListBranch`, `extractUrlFromCandidate`, `collectAssetListUrls`. **No `fileSchema`**
   (moved to schema-builders to break the cycle — see Re-Plan Note). Pure leaf: imports only
   `media/file-types` + `primitives`.
4. `schema-builders.ts` — `isValidIsoDate`, `withNullable`, `withEmptyPreprocessing`, `textSchema`,
   `richtextSchema`, `decimalPlaces`, `numberSchema`, `booleanSchema`, `dateSchema`,
   `jsonOrTagsSchema`, `relationSchema`, **`fileSchema` (full body, moved here)**,
   `REPEATER_DISALLOWED_SUBTYPES`, `repeaterSchema`, `BRANCH_SCHEMA_BUILDERS`, `schemaForBranch`.
   Imports the file-URL helpers (`resolveFileOptions`, `isAssetListBranch`, `collectAssetListUrls`,
   `parseHttpUrl`) + `extensionFromUrl`/`isExtensionAccepted` for `fileSchema`.
5. `cache.ts` — `seedSchemaCache`, `BranchFingerprint`, `buildBranchFingerprint`,
   `buildSeedFingerprint`, `buildCacheKey`, `compileSeedSchema`.
6. `index.ts` — public interfaces, `ResolvedOptions`, `STATUS_VALUES`/`statusSchema`,
   `DEFAULT_MAX_TEXT_LENGTH`, required-field enforcement, issue mapping,
   `validateAndSanitizeSeedPayload`, `isValidContentStatus`, and
   `export { resolveFileOptions } from './file-branch.js'`.

**Delete — 1 file:**

7. `packages/core/src/engine/validation.ts` (fully superseded by the directory).

**Edit — 2 lines (relative re-points only; no logic):**

8. `packages/core/src/index.ts:19` — `./engine/validation.js` → `./engine/validation/index.js`.
9. `packages/core/src/engine/validation.test.ts:16` — `./validation.js` → `./validation/index.js`.

**Explicitly NOT delivered:** no behavior change, no new/removed test, no `apps/**` edit, no
dependency change, no D1 migration. (The existing `validation.test.ts` is the regression oracle — it
must pass **unchanged** except for its one import line; see SECTION 5.)

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 migration. All TypeScript, inside `@beechcms/core`. **This is a pure move: every function body
is copied verbatim from the current `validation.ts`. Do NOT rewrite bodies.** The only permitted
edits are (a) `import`/`export` statements, (b) relative-path depth (`../` → `../../`), and (c) the one
`(issue as any).errors` type tidy (TASK 6). All import paths below use the mandatory `.js` ESM
extension (NodeNext resolution).

---
**TASK 1 — `validation/primitives.ts` (no local imports; pure sink)**

Move `CONTROL_CHARS_REGEX` (L111) and the three cross-module helpers. Export all four so leaf modules
can import them.

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Matches standard control characters that should be stripped. */
export const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Strips non-printable and dangerous control characters from a string. */
export function stripControlChars(input: string): string {
  return input.replaceAll(CONTROL_CHARS_REGEX, '')
}

/** Cleans a string by stripping control characters and trimming whitespace. */
export function cleanString(input: string): string {
  return stripControlChars(input).trim()
}

/** Type-guard: value is a plain object (excluding arrays and null). */
export function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
```

---
**TASK 2 — `validation/richtext-sanitizer.ts`**

Move the richtext allowlist constants (L112–130), `RichtextSanitizeResult` + `SanitizeState`
interfaces (L287–305), and the sanitizer functions (L307–463) **verbatim**. Add imports; export the
two symbols consumed elsewhere (`sanitizeRichtext` → schema-builders; `isRichtextDocEmpty` → index).
`RICHTEXT_SCHEMA_VERSION`/`isRichtextEnvelopeV1` path deepens by one level.

```ts
import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from '../../content/richtext/richtext.js'
import { stripControlChars, cleanString, isPlainObject } from './primitives.js'
```

- Keep `ALLOWED_RICHTEXT_NODE_TYPES` / `ALLOWED_RICHTEXT_MARK_TYPES` and their **sync comment**
  (“Keep in sync with content/richtext/richtext-render.ts::createRichTextHtmlExtensions”) — the
  cross-file invariant survives the move.
- `export function sanitizeRichtext(...)`, `export function isRichtextDocEmpty(...)`. The rest
  (`sanitizeRichtextString`, `isProtocolAllowed`, `walkRichtextNode`, `sanitizeRichtextJson`,
  `gatherRichtextText`) stay module-private (no `export`).
- `RichtextSanitizeResult` / `SanitizeState` remain local interfaces (not re-exported).

---
**TASK 3 — `validation/file-branch.ts` (pure leaf — NO `fileSchema`)**

Move `DEFAULT_FILE_MAX_SIZE` (L108), the file helpers (L227–281), plus the two single-consumer
primitives `tryParseJson` (L177) and `parseHttpUrl` (L191) **verbatim**. `fileSchema` does **NOT** live
here (it moves to TASK 4 — this is the cycle fix). This module imports nothing from `schema-builders`.

```ts
import type { Branch } from '../types.js'
import type { FileAccept } from '../../media/file-types.js'
import { cleanString, isPlainObject } from './primitives.js'
```

- `export function resolveFileOptions(branch: Branch): { accept: FileAccept; maxSize: number }` — the
  **public** symbol; its signature is unchanged.
- **Also `export`** `parseHttpUrl`, `isAssetListBranch`, `collectAssetListUrls` — `fileSchema` (now in
  schema-builders) consumes them across the module boundary.
- `tryParseJson`, `extractUrlFromCandidate` stay module-private (only used within file-branch).
- No `z`/`zod` import needed here anymore — the only Zod user (`fileSchema`) left this file.

---
**TASK 4 — `validation/schema-builders.ts` (now owns `fileSchema`)**

Move `isValidIsoDate` (L210), **all** Zod builders (L476–712 **including `fileSchema` L671–712**), and
the dispatch table (L718–780) **verbatim**. `fileSchema` moving here is the cycle fix: its calls to
`withNullable`/`withEmptyPreprocessing` become local references, and it reaches the file-URL helpers
via a single downward `schema-builders → file-branch` import.

```ts
import { z } from 'zod'
import type { Branch, BranchType } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'
import type { ResolvedOptions } from './index.js'   // type-only → erased, no runtime cycle
import { extensionFromUrl, isExtensionAccepted } from '../../media/file-types.js'
import { cleanString } from './primitives.js'
import { sanitizeRichtext } from './richtext-sanitizer.js'
import { resolveFileOptions, isAssetListBranch, collectAssetListUrls, parseHttpUrl } from './file-branch.js'
```

- `fileSchema` body is copied **byte-for-byte** from L671–712; it now resolves `resolveFileOptions`,
  `isAssetListBranch`, `collectAssetListUrls`, `parseHttpUrl` from `./file-branch.js` and
  `extensionFromUrl`/`isExtensionAccepted` from `media/file-types` — same runtime, no logic edit.
- `richtextSchema` calls `sanitizeRichtext(value, options.maxTextLength)` — unchanged; now resolves
  the import from `./richtext-sanitizer.js`.
- `BRANCH_SCHEMA_BUILDERS`’s `file` entry delegates to the **local** `fileSchema` — verbatim.
- `export function schemaForBranch(branch: Branch, options: ResolvedOptions): z.ZodTypeAny` — the
  single symbol `cache.ts` needs. Everything else (incl. `fileSchema`) stays module-private.
- `decimalPlaces`, `numberSchema` (the Sprint-1 sci-notation fix) move **byte-for-byte**. No logic edit.

---
**TASK 5 — `validation/cache.ts`**

Move the fingerprint + cache block (L787–901) **verbatim**.

```ts
import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from '../types.js'
import type { ResolvedOptions } from './index.js'   // type-only → erased
import { schemaForBranch } from './schema-builders.js'
```

- `export function compileSeedSchema(seed: Seed, options: ResolvedOptions): z.ZodObject<Record<string, z.ZodTypeAny>>`
  — consumed by index. `seedSchemaCache`, `BranchFingerprint`, `build*` helpers stay module-private.
- The relation-caching guard comment (`Seeds with relation branches cannot be safely cached…`) moves
  with the code — semantics unchanged.

---
**TASK 6 — `validation/index.ts` (barrel + orchestrator)**

Move the public interfaces (L22–103), `ResolvedOptions` (L96–103), status consts (L132–135),
`DEFAULT_MAX_TEXT_LENGTH` (L106), required-field enforcement (L913–975), issue mapping (L987–1128),
and the two public entry points (L1146–1213) **verbatim**. `ResolvedOptions` is **exported** so the
type-only imports in schema-builders/cache resolve.

```ts
import { z } from 'zod'
import type { Seed } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'
import { isRichtextEnvelopeV1 } from '../../content/richtext/richtext.js'
import { isPlainObject } from './primitives.js'
import { isRichtextDocEmpty } from './richtext-sanitizer.js'
import { compileSeedSchema } from './cache.js'

// Re-export the public file-branch symbol so the barrel surface stays complete.
export { resolveFileOptions } from './file-branch.js'
```

- **Keep `export` on**: `ValidationDetail`, `ValidateSeedPayloadOptions`, `ValidateSeedPayloadResult`,
  `ResolvedOptions`, `validateAndSanitizeSeedPayload`, `isValidContentStatus`. This — plus the
  re-exported `resolveFileOptions` — reproduces the exact 6-symbol public set the old file exposed.
- `isEffectivelyEmpty` (L913) uses `isRichtextEnvelopeV1` + `isRichtextDocEmpty` + `isPlainObject`:
  now imported (from `../../content/richtext/richtext.js`, `./richtext-sanitizer.js`, `./primitives.js`).
- `validateAndSanitizeSeedPayload` (L1146) uses `DEFAULT_MAX_TEXT_LENGTH` (local) + `compileSeedSchema`
  (from `./cache.js`). Body unchanged.

**The one permitted type tidy (`(issue as any).errors`, brief §5 fold-in), inside `flattenZodIssues`:**
current L1049–1051 reads:

```ts
if (issue.code === 'invalid_union' && 'errors' in issue) {
  const unionErrors = (issue as any).errors as z.ZodIssue[][]
```

Replace the `as any` with a **narrow local type assertion** — same runtime, no `any`:

```ts
if (issue.code === 'invalid_union' && 'errors' in issue) {
  const unionErrors = (issue as { errors: z.ZodIssue[][] }).errors
```

This is compile-time-only; the emitted JS is identical. If `tsc` flags the narrowed assertion under
the installed `zod@^4.3.6` union-issue typing, **revert to the original `as any` line** rather than
introduce any behavioral or structural change — the tidy is optional, the zero-logic-change invariant
is not.

---
**TASK 7 — Delete + re-point (2 one-line edits)**

- Delete `packages/core/src/engine/validation.ts`.
- `packages/core/src/index.ts:19`: `export * from './engine/validation.js'`
  → `export * from './engine/validation/index.js'`.
- `packages/core/src/engine/validation.test.ts:16`:
  `import { validateAndSanitizeSeedPayload, isValidContentStatus } from './validation.js'`
  → `from './validation/index.js'`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. The refactor is behavior-preserving ⇔ the UNCHANGED Sprint-1 test suite still passes.
#    (validation.test.ts is the regression oracle; only its import line changed.)
pnpm --filter @beechcms/core test

# 2. Build + typecheck the split package (catches broken import paths, missing exports, cycles).
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core exec tsc --noEmit

# 3. Prove the public barrel surface is intact — API + dashboard typecheck against @beechcms/core
#    with ZERO edits. If any symbol dropped from the barrel, these fail.
pnpm --filter @beechcms/api exec tsc --noEmit
pnpm --filter @beechcms/api test           # includes apps/api/test/core-validation.test.ts

# 4. Confirm the monolith is gone and nothing still imports it by the old relative path.
test ! -f packages/core/src/engine/validation.ts && echo "monolith removed OK"
grep -rnE "engine/validation\.js|\./validation\.js" packages apps --include="*.ts" --include="*.tsx" \
  | grep -v "engine/validation/"    # expect: no matches

# 5. Diff-scoped workspace test as a final gate.
pnpm beech test --diff
```

**Reviewer’s zero-logic-change check (mechanical):** the union of the 6 new files, with imports/exports
stripped, must be a line-for-line permutation of the deleted `validation.ts` body — plus only the
single `flattenZodIssues` assertion tidy. Any other diff line is a scope violation.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] New dir `packages/core/src/engine/validation/` contains exactly: `primitives.ts`,
      `richtext-sanitizer.ts`, `file-branch.ts`, `schema-builders.ts`, `cache.ts`, `index.ts`.
- [ ] `packages/core/src/engine/validation.ts` (the monolith) is **deleted**.
- [ ] `src/index.ts:19` and `engine/validation.test.ts:16` re-pointed to `./validation/index.js`;
      **no other** `apps/**` or `packages/**` import edited.
- [ ] Public barrel surface unchanged: `@beechcms/core` still exports `validateAndSanitizeSeedPayload`,
      `resolveFileOptions`, `isValidContentStatus`, `ValidationDetail`, `ValidateSeedPayloadOptions`,
      `ValidateSeedPayloadResult` — identical names/signatures/shapes.
- [ ] `pnpm --filter @beechcms/core test` passes with `validation.test.ts` **otherwise unchanged**
      (import line only) — proves zero behavior change.
- [ ] `tsc --noEmit` clean in `@beechcms/core` **and** `@beechcms/api`; `apps/dashboard` untouched.
- [ ] Dependency graph is acyclic: only `import type { ResolvedOptions } from './index.js'` references
      index from a leaf; all value imports point downward (index→cache→schema-builders→leaves→primitives).
- [ ] Every moved function body is byte-identical to its pre-split form (verified per SECTION 5 review
      check); the ONLY logic-adjacent edit is the `(issue as any).errors` → narrowed-assertion tidy,
      and it is compile-time-only (or reverted if `tsc` objects).
- [ ] The `ALLOWED_RICHTEXT_*` ↔ `createRichTextHtmlExtensions` sync comment survives in
      `richtext-sanitizer.ts`.
- [ ] **No new dependency** (`packages/core/package.json` unchanged); no D1 migration; no `apps/**` edit.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT, in this sprint:

- **Change any runtime behavior.** No renamed public symbol, no altered signature, no reordered
  evaluation, no new/removed code path. This is the defining invariant; violating it fails the sprint.
- **Add, remove, or rewrite tests.** `validation.test.ts` moves with a single import-line edit and
  must otherwise pass unchanged — it is the regression oracle. Do not "improve" assertions here.
- **Edit `apps/api` or `apps/dashboard`** (beyond the fact that they must still compile untouched).
  If any `apps/**` file needs editing to compile, the split broke the barrel — fix the barrel, not
  the consumer.
- **Regenerate the graphify graph**, add a `primitives.ts` beyond the 3 documented cross-module
  helpers, or promote file/date helpers (`tryParseJson`, `isValidIsoDate` — sole consumer each;
  `parseHttpUrl` — stays exported from `file-branch`) into `primitives.ts`. They stay in their domain
  module. Do **not** move `fileSchema` back into `file-branch.ts` — that reintroduces the rejected
  `file-branch ⇄ schema-builders` cycle; `fileSchema` lives in `schema-builders.ts`.
- **Touch caching / `SeedRegistry` semantics.** `seedSchemaCache` moves verbatim into `cache.ts`; the
  `getHydratedRegistry` version-token fix, two-level `WeakMap`+`Map` cache, plain-`WeakMap`
  fingerprint removal, file-URL double-validation dedup, and per-relation schema caching all remain
  **excluded** (brief §5) — separate briefs. Do not "while we're here" any of them.
- **Add an HTML sanitizer dependency** or alter the allowlist/protocol/depth logic Sprint 1 shipped.
- **Convert the `(issue as any).errors` tidy into a larger Zod-typing refactor.** It is a single-line,
  compile-time-only assertion narrowing; anything beyond that is out of scope.

> This is the final sprint of the RichText Validation & Render Hardening feature. On merge, the
> feature is complete; no further sprint is queued in `output/backlog/ROADMAP.md`.
