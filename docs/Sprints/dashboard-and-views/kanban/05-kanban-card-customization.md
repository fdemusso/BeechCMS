# Sprint Plan — Kanban Card Customization

> Feature source: `stages/00_ideation/output/feature_brief.md`
> Entity binding: **View** (per-seed `view_config` blob). NOT User, NOT Collection/Schema.

---

### Pre-Computation Analysis

Mapping performed exclusively via the `graphify` CLI (`explain`, `query`, `affected`), then surgical file reads for exact interfaces per `tooling_graphify.md` ordering.

**a) God Nodes identified**

| Node | Location | Degree | Role in this feature |
|------|----------|--------|----------------------|
| `AppEnv` | `apps/api/src/types.ts:93` | 59 | Hono context env; carries `getSeed`, `seedLayoutRepository`, `jwtPayload` used by the view-config handlers. Touched **read-only** (no new variable). |
| `seedViewConfigSchema` | `packages/core/src/seed-layout.ts:20` | low, but topological chokepoint | Single Zod gate for the entire `view_config` blob. `.passthrough()` already tolerant. **Primary extension point.** |
| `FieldDisplay` / display registry | `apps/dashboard/src/features/fields/FieldDisplay.tsx` + `registry` | shared kernel | Type-driven read renderer already consumed cross-slice by the Table View (`lib/dynamic-columns.tsx:20`). **Mandated reuse target** per brief §2. |
| `resolveKanbanConfig()` | `packages/core/src/kanban.ts:64` | 8 | Axis/compat logic. Orthogonal to card layout — read-only, not modified. |

**b) Architectural boundaries affected**

- **`@beechcms/core`** — `packages/core/src/seed-layout.ts`: add `kanbanCardConfigSchema` + `KanbanCardConfig` type, wire `card` key into `seedViewConfigSchema`, add pure validator `validateCardConfigAgainstSeed()`. Pure, zero-I/O, zero new deps.
- **`apps/api`** — **ZERO code change.** `getViewConfigHandler` / `putViewConfigHandler` (`features/content/handlers/view-config.ts`) already validate the whole blob through `seedViewConfigSchema` and persist through `seedLayoutRepository.setViewConfig`. Extending the core schema flows through automatically. No new endpoint, no new migration.
- **`apps/dashboard`** — slice `features/content-kanban`: replace heuristic `buildKanbanCardDisplayModel` (`kanban-card-display.ts`) with slot resolution against `card` config; rebuild `kanban-card.tsx` into Header/Subtitle/Metadata slots delegating to `FieldDisplay`; extend `use-kanban-view-config.ts` to surface + persist `card`; add a slot-config editor. Reuses the shared `features/fields` kernel.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
graphify affected "seedViewConfigSchema" --depth 2
  - seed-layout.test.ts [imports]        # only consumer is its own unit test
```
→ The schema change is **additive** (`.passthrough()` + optional `card`). Zero downstream production nodes break.

```
graphify affected "resolveKanbanConfig" --depth 2
  - kanbanMoveHandler(), kanbanPositionHandler(), listHandler(), buildRelationsMap(), isAxisCandidate()
```
→ These are **axis/position** consumers. Card layout does not touch axis resolution, so none are impacted. Confirmed the two concerns are decoupled.

**Storage fact (verified, prevents redundant work):** `seed_layouts.view_config TEXT` already exists (`apps/api/migrations/0034_kanban_foundation.sql:24`). **No new migration is required.**

---

### VETO Audit

Proposed boundaries evaluated against `ponytail_arch.md`.

**1. Botanical Invariant (no `@beech/core` bypass, Branch IDs not aliases).**
- Card config persists via `seedLayoutRepository.setViewConfig(slug, blob, sub)` → same botanical repository already backing kanban/form layout. **No direct D1 access. PASS.**
- Slot references use `{ branchId: 'br_XX' }`, mirroring the existing `LayoutField` contract (`seed-layout.ts:32`). No hardcoded aliases persisted. **PASS.**

**2. VSA — no cross-feature imports.**
- `content-kanban` will import `FieldDisplay` from `@/features/fields`. `features/fields` is **not a peer feature slice** — it is the shared, type-driven display kernel already consumed cross-slice by the Table View (`lib/dynamic-columns.tsx`) and the entry editor. It is the sanctioned shared-rendering lib, exactly what Ponytail rule 3 *mandates* ("move shared logic to shared libs"). Reuse is compliant; **no duplication of render logic. PASS.**
- New card-config logic lives inside `content-kanban`; the pure slot/validation rules live in `@beechcms/core`. No new peer-to-peer feature import introduced. **PASS.**

**3. Cloudflare Purity / YAGNI.**
- No ORM, no background job, no schema mutation outside the migration workflow (indeed, no migration at all). Slot model is rigid (Header/Subtitle/Metadata) — the brief's discarded free-form builder is explicitly out of scope. **PASS.**

**Verdict: no violation. Plan proceeds unchanged.**

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The card layout is a **View-level, shared configuration** — it must live in the same `view_config` blob that already holds the kanban axis/sort preferences, validated by the same single core gate. Building the **core contract first** (schema + type + pure validator in `@beechcms/core`) is mandatory because:

- **Botanical single-source-of-truth:** every write to `view_config` passes through `seedViewConfigSchema`. If the dashboard shipped a `card` shape before core recognised it, `.passthrough()` would silently persist an *unvalidated* blob — RichText fields and dangling `branchId`s could leak in, violating brief §4 (RichText prohibition) and the auto-cleanup contract that `LayoutField` guarantees.
- **VSA layering (core → api → dashboard):** the api slice needs zero changes only *if* the core schema is the one enforcing the shape. Defining the contract in core keeps the api handler a thin, unchanged pass-through and prevents card-validation logic leaking into the api or dashboard slices.
- **Decoupling proven in Pre-Computation:** axis logic (`resolveKanbanConfig`) and card layout are independent. Establishing the card contract as a sibling key (`view_config.card`) alongside `view_config.kanban` keeps the two concerns isolated and independently testable.

Foundational order: **(1) core schema + validator → (2) core unit tests → (3) dashboard consumption + UI.** The api tier is untouched by construction.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Persistence (unchanged, reused):**
- Column: `seed_layouts.view_config TEXT` (nullable) — `migrations/0034_kanban_foundation.sql:24`.
- Repository contract: `ISeedLayoutRepository.getViewConfig(slug)` / `setViewConfig(slug, config, updatedBy)` — `packages/core/src/seed-layout.repository.ts:22-25`. D1 impl at `apps/api/src/shared/db/repositories/seed-layout.repository.d1.ts`.
- Injected into context as `seedLayoutRepository` via `apps/api/src/middleware/repository.middleware.ts`; typed on `AppEnv.Variables` (`apps/api/src/types.ts`).

**Core schema (extension point):**
```ts
// packages/core/src/seed-layout.ts:20
export const seedViewConfigSchema = z.object({
  kanban: kanbanViewConfigSchema.optional(),
}).passthrough()               // <-- card key added here
export type SeedViewConfig = z.infer<typeof seedViewConfigSchema>
```
Existing precedent for branch-id references + auto-cleanup: `layoutFieldSchema` (`br_[A-Za-z0-9]+` regex, `seed-layout.ts:106`), `validateLayoutAgainstSeed()` (strips missing/unsupported branches, `seed-layout.ts:208`), `findBranchById()` from `seed-registry.js`. Type gate helpers `isLayoutableBranch`, `UNSUPPORTED_BRANCH_TYPES` (`json`), `SYSTEM_ALIASES` already exist.

**API handlers (pass-through, unchanged):**
- `getViewConfigHandler` returns `seedLayoutRepository.getViewConfig(slug) ?? {}` — `features/content/handlers/view-config.ts:11`.
- `putViewConfigHandler` validates `body` with `seedViewConfigSchema.safeParse`, then `setViewConfig(slug, parsed.data, jwtPayload.sub)` — `view-config.ts:26`. Guards: invalid-slug (400), seed-not-found (404), invalid-json (400), schema-fail (422) via `publicProblem`.

**Dashboard (to modify):**
- `features/content-kanban/hooks/use-kanban-view-config.ts` — TanStack `useQuery(['seed-view-config', slug])` + `useMutation`. Currently maps only `data.kanban.*`; merges via `{ ...data, kanban: next }`.
- `features/content-kanban/kanban-card-display.ts` — **heuristic** `buildKanbanCardDisplayModel`: guesses title (first non-system string), image (first path-like string), status badge. To be replaced by slot resolution.
- `features/content-kanban/kanban-card.tsx` — renders `title` + `imageUrl` + `statusBadge` only. To be rebuilt into slots.
- `features/content-kanban/types.ts` — `KanbanCardDisplayModel`, `KanbanBoardConfig`.

**Shared render kernel (reuse, unchanged):**
- `features/fields/FieldDisplay.tsx` — applies visibility policy (`resolvePolicies`) then delegates to `getDisplayComponent(branch.type)`.
- `features/fields/types.ts` — `FieldDisplayProps { branch: Branch; value: unknown; options?: { maxLength?: number } }`.
- Per-type renderers in `features/fields/display/` (boolean, date, number, media, relation, richtext, text, json, repeater). Truncation already honoured via `options.maxLength` (see Table View wiring `lib/dynamic-columns.tsx:475`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core` (contract + pure logic — full implementation):**
- `packages/core/src/seed-layout.ts` — add `kanbanCardConfigSchema`, `KanbanCardConfig`, `CardSlotField`; add `card` key to `seedViewConfigSchema`; add pure `validateCardConfigAgainstSeed(config, seed)`; add `isCardEligibleBranch(branch)` helper.
- `packages/core/src/index.ts` — re-export the new symbols.
- `packages/core/src/seed-layout.test.ts` — unit tests for schema + validator (see Section 5).

**`apps/api` — NONE.** (Verified pass-through. Existing `view-config.handler.test.ts` re-run only.)

**`apps/dashboard` (consumption + UI):**
- `features/content-kanban/types.ts` — add `slots` to `KanbanCardDisplayModel`; extend `KanbanBoardConfig`/add `KanbanCardBoardConfig`.
- `features/content-kanban/kanban-card-display.ts` — replace heuristic with `buildKanbanCardDisplayModel(entry, seed, cardConfig)` resolving configured slots (fallback to legacy heuristic when `card` is absent).
- `features/content-kanban/kanban-card.tsx` — render Header / Subtitle / Metadata (2-col grid) slots, each delegating to `FieldDisplay`.
- `features/content-kanban/hooks/use-kanban-view-config.ts` — surface `cardConfig`, add `setCardConfig` (merge-preserving `kanban`).
- `features/content-kanban/card-config/` **(new)** — `card-config-dialog.tsx` slot editor (assign branch → slot, respecting caps + exclusions).
- `features/fields/types.ts` — additive optional `options.compact?: boolean` on `FieldDisplayProps` (for tag/array `+N` compaction, brief §4).
- Locale keys under `apps/dashboard/src/locales/*.json` for the config UI.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**4.0 D1 Migration — NONE.**
`seed_layouts.view_config TEXT` already exists (0034). The downstream agent MUST NOT author a new migration. The `card` key is an additive JSON sibling inside the existing blob.

**4.1 Core — schema + types** (`packages/core/src/seed-layout.ts`)

```ts
// --- Kanban card layout (view_config.card) ------------------------------
/** One field placed in a card slot, referenced by stable branch id (br_XX). */
export const cardSlotFieldSchema = z.object({
  branchId: z.string().regex(/^br_[A-Za-z0-9]+$/),
})
export type CardSlotField = z.infer<typeof cardSlotFieldSchema>

/** Rigid slot layout for a kanban card (brief §2 "Slot-based"). */
export const kanbanCardConfigSchema = z.object({
  version: z.literal(1),
  /** Optional media/avatar slot. Full width. Max 1. */
  media: cardSlotFieldSchema.nullable().optional(),
  /** Full-width primary line. Max 1. */
  header: cardSlotFieldSchema.nullable().optional(),
  /** Full-width secondary line. Max 1. */
  subtitle: cardSlotFieldSchema.nullable().optional(),
  /** 2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP). */
  metadata: z.array(cardSlotFieldSchema).max(6).default([]),
})
export type KanbanCardConfig = z.infer<typeof kanbanCardConfigSchema>

export const seedViewConfigSchema = z.object({
  kanban: kanbanViewConfigSchema.optional(),
  card: kanbanCardConfigSchema.optional(),        // <-- ADDED
}).passthrough()
```

**4.2 Core — eligibility rule + pure validator** (`packages/core/src/seed-layout.ts`)

```ts
export const METADATA_SLOT_CAP = 6

/** Field types forbidden on any kanban card slot (brief §4). RichText excluded;
 *  reuse existing system/unsupported gates. */
const CARD_FORBIDDEN_TYPES = new Set<Branch['type']>(['richtext', 'json', 'repeater'])

export function isCardEligibleBranch(branch: Branch): boolean {
  if (SYSTEM_ALIASES.has(branch.alias)) return false
  if (branch.policies?.visibility === 'hidden') return false
  if (CARD_FORBIDDEN_TYPES.has(branch.type)) return false
  return true
}

export type ValidateCardConfigResult =
  | { ok: true; cleaned: KanbanCardConfig }
  | { ok: false; errors: string[]; cleaned: KanbanCardConfig }

/**
 * Pure. Strips slot fields whose branch is missing/ineligible (auto-cleanup,
 * mirroring validateLayoutAgainstSeed), enforces single-field slots + metadata cap,
 * and rejects duplicate branch placement across slots.
 */
export function validateCardConfigAgainstSeed(
  config: KanbanCardConfig,
  seed: Seed,
): ValidateCardConfigResult {
  const errors: string[] = []
  const seen = new Set<string>()

  const keepSingle = (f: CardSlotField | null | undefined): CardSlotField | null => {
    if (!f) return null
    const b = findBranchById(seed, f.branchId)
    if (!b || !isCardEligibleBranch(b)) return null       // silent strip
    if (seen.has(f.branchId)) { errors.push(`Branch ${f.branchId} placed more than once.`); return null }
    seen.add(f.branchId)
    return { branchId: f.branchId }
  }

  const media    = keepSingle(config.media)
  const header   = keepSingle(config.header)
  const subtitle = keepSingle(config.subtitle)

  const metadata: CardSlotField[] = []
  for (const f of config.metadata ?? []) {
    const b = findBranchById(seed, f.branchId)
    if (!b || !isCardEligibleBranch(b)) continue          // silent strip
    if (seen.has(f.branchId)) { errors.push(`Branch ${f.branchId} placed more than once.`); continue }
    seen.add(f.branchId)
    if (metadata.length >= METADATA_SLOT_CAP) { errors.push(`Metadata slot exceeds cap ${METADATA_SLOT_CAP}.`); continue }
    metadata.push({ branchId: f.branchId })
  }

  const cleaned: KanbanCardConfig = { version: 1, media, header, subtitle, metadata }
  return errors.length ? { ok: false, errors, cleaned } : { ok: true, cleaned }
}
```

**4.3 API — registration order (unchanged, documented for the agent).**
Route wiring in `apps/api/src/features/content/index.ts` binds `getViewConfigHandler`/`putViewConfigHandler` after the standard content middleware chain (auth → repository.middleware → seed resolution). **Do not add or reorder middleware.** `putViewConfigHandler` already funnels the full blob through `seedViewConfigSchema` — the new `card` key is validated with zero handler edits. (Optional hardening, only if a test demands it: after `safeParse`, call `validateCardConfigAgainstSeed(parsed.data.card, seed)` and persist `cleaned`. Default: rely on Zod shape + dashboard-side cleanup to honour YAGNI.)

**4.4 Dashboard — display model** (`features/content-kanban/kanban-card-display.ts`)

```ts
import type { Seed, KanbanCardConfig } from '@beechcms/core'
import { findBranchById } from '@beechcms/core'

export interface ResolvedSlotField { branch: Branch; value: unknown }

export interface KanbanCardSlots {
  media?: ResolvedSlotField
  header?: ResolvedSlotField
  subtitle?: ResolvedSlotField
  metadata: ResolvedSlotField[]
}

/** New signature — slot resolution when `card` config exists, else legacy heuristic. */
export function buildKanbanCardDisplayModel(
  entry: ContentEntry,
  seed: Seed,
  axisBranch: Branch,
  columnValue: string | null,
  card: KanbanCardConfig | undefined,
): KanbanCardDisplayModel {
  const data = entry.data as Record<string, unknown>
  const resolve = (f?: { branchId: string } | null): ResolvedSlotField | undefined => {
    if (!f) return undefined
    const branch = findBranchById(seed, f.branchId)
    if (!branch) return undefined
    return { branch, value: data[branch.alias] }
  }
  const slots: KanbanCardSlots | undefined = card ? {
    media: resolve(card.media), header: resolve(card.header),
    subtitle: resolve(card.subtitle), metadata: (card.metadata ?? []).map(resolve).filter(Boolean) as ResolvedSlotField[],
  } : undefined
  // ...retain existing title/imageUrl heuristic as fallback when slots===undefined...
  return { /* entryId, title, statusBadge, imageUrl, axisValue, position, */ slots }
}
```
Add `slots?: KanbanCardSlots` to `KanbanCardDisplayModel` in `types.ts`.

**4.5 Dashboard — card render** (`features/content-kanban/kanban-card.tsx`)
- Header slot: `<FieldDisplay branch value options={{ maxLength: 40 }} />`, full width, `truncate`.
- Subtitle slot: same, `maxLength: 60`, muted.
- Metadata slot: `grid grid-cols-2 gap-x-3 gap-y-1`; each cell `<FieldDisplay ... options={{ maxLength: 24, compact: true }} />` with the branch label. Empty value → render nothing but preserve grid cell (brief §4 empty-state / alignment).
- When `model.slots` is undefined, render the legacy title/image/badge markup (backwards compat for un-configured views).

**4.6 Dashboard — shared kernel additive option** (`features/fields/types.ts`)
```ts
readonly options?: {
  readonly maxLength?: number
  readonly compact?: boolean   // ADD: tags/relation renderers cap items + show "+N"
}
```
Update `display/` renderers for `tags`/array-like types to honour `compact` (show ≤3 items + `+N`). No signature break — additive optional.

**4.7 Dashboard — hook** (`features/content-kanban/hooks/use-kanban-view-config.ts`)
- Expose `cardConfig: data?.card`.
- Add `setCardConfig(next: KanbanCardConfig)` mutating `{ ...data, card: next }` (preserving `kanban`), reusing the existing `updateSeedViewConfig` + `invalidateQueries` pattern.

**4.8 Dashboard — config UI** (`features/content-kanban/card-config/card-config-dialog.tsx`)
- Slot editor: per slot, a branch picker filtered by `isCardEligibleBranch`; Header/Subtitle single-select, Metadata multi-select capped at `METADATA_SLOT_CAP`.
- On save: `setCardConfig(cleanedConfig)`; disable ineligible branches (RichText/json/repeater/system) with a tooltip.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core builds and type-checks (contract tier first)
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core exec tsc --noEmit

# 2. Core unit tests — schema round-trip + validator
#    (add cases to packages/core/src/seed-layout.test.ts)
pnpm --filter @beechcms/core run test

# 3. API type-check + existing view-config handler test (must stay green, unchanged)
pnpm --filter ./apps/api exec tsc --noEmit
pnpm --filter ./apps/api run test -- view-config

# 4. Dashboard type-check + kanban tests
pnpm --filter ./apps/dashboard exec tsc --noEmit
pnpm --filter ./apps/dashboard run test -- kanban

# 5. Workspace-wide (diff-scoped) gate
pnpm beech test --diff
```

Required new core test cases (`seed-layout.test.ts`):
- `seedViewConfigSchema` accepts `{ card: { version:1, header, subtitle, metadata:[...] } }` and preserves `kanban` alongside.
- `validateCardConfigAgainstSeed` strips a `branchId` absent from the seed.
- `validateCardConfigAgainstSeed` strips a RichText branch from every slot.
- Metadata beyond `METADATA_SLOT_CAP` is truncated with an error.
- Same branch in two slots → error + de-duplicated.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `@beechcms/core` builds; `tsc --noEmit` clean; new symbols re-exported from `index.ts`.
- [ ] `seedViewConfigSchema` extended with optional `card`; `.passthrough()` retained; `kanban` untouched.
- [ ] `validateCardConfigAgainstSeed` is **pure** (no I/O, no imports beyond core) and auto-strips missing/ineligible branches, matching the `validateLayoutAgainstSeed` contract.
- [ ] RichText (and json/repeater/system aliases) provably rejected from all slots by a unit test.
- [ ] Metadata slot hard-capped at `METADATA_SLOT_CAP`; Header/Subtitle single-field.
- [ ] Slot fields persisted as `{ branchId: 'br_XX' }` only — zero aliases in the blob (Botanical invariant).
- [ ] **No new D1 migration** in the diff.
- [ ] **Zero code change** under `apps/api/src` except (optionally) added tests; `view-config.handler.test.ts` green.
- [ ] Kanban card renders configured slots exclusively via `FieldDisplay` (no bespoke per-type formatting in `content-kanban`).
- [ ] Text slots truncate with ellipsis; tag/array fields show ≤3 items + `+N`; empty values keep grid alignment.
- [ ] Un-configured views (no `card`) still render via the legacy heuristic (backwards compatible).
- [ ] `FieldDisplayProps.options.compact` added additively — no breaking change to existing `FieldDisplay` callers (`lib/dynamic-columns.tsx`).
- [ ] No cross-feature import introduced other than the sanctioned `@/features/fields` kernel.
- [ ] `pnpm beech test --diff` green.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Any free-form row/column card builder (brief §5) — the slot model is rigid.
- Per-user card overrides — config is shared at the View level; no `User`-entity binding.
- Rendering RichText or other long/complex types on the card.
- Uncapped tag/array or text display; any change that lets card dimensions grow unbounded.
- New D1 migration or any change to `kanban_positions` / axis logic (`resolveKanbanConfig`, kanban-move/position handlers).
- New REST endpoints — reuse existing `GET/PUT /:slug/view-config`.
- Refactor of the `FieldDisplay` registry beyond the additive `options.compact` flag.
- Drag-and-drop / column behaviour (this sprint is card *content* only).
