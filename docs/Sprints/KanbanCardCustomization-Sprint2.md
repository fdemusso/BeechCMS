# Sprint Plan — Kanban Card Customization: Sprint 2 (Hardening & Polish)

> Feature source: `stages/00_ideation/output/feature_brief.md`
> Prior art (DO NOT re-implement): `docs/Sprints/KanbanCardCustomization.md` (Sprint 1)
> Entity binding: **View** (per-seed `view_config` blob). No new entity, no migration, no new endpoint.

---

### Pre-Computation Analysis

Mapping performed via the `graphify` CLI (`affected`, one scoped `query`) per `tooling_graphify.md` ordering, then surgical reads for exact interfaces. Sprint 2 is **hardening only** — no core schema change; all extension points already exist from Sprint 1.

**a) God Nodes identified (CLI)**

| Node | Location | Role in Sprint 2 |
|------|----------|------------------|
| `buildKanbanCardDisplayModel` | `content-kanban/kanban-card-display.ts` | High fan-in (`affected` → content-kanban.tsx, use-kanban-drag, use-kanban-column-query, card-config-dialog, index re-export). **Read-only in Sprint 2** — signature is frozen; only its *consumers'* render options change. |
| `putViewConfigHandler` | `apps/api/src/features/content/handlers/view-config.ts` | `affected` → sole consumer is `view-config.handler.test.ts`. **Only api node touched** (Item 2). |
| `validateCardConfigAgainstSeed` | `packages/core/src/seed-layout.ts:~192` | `affected` → `seed-layout.test.ts [imports]` + `isCardEligibleBranch() [calls]`. Already exported; Sprint 2 **calls** it from the api tier — zero core edits. |
| `FieldDisplay` / display registry | `features/fields/FieldDisplay.tsx` + `registry.ts` | Shared render kernel. `registry.ts` maps `file → MediaDisplay`, all others per type. Sprint 2 makes two renderers (`TextDisplay`, `RelationDisplay`) honour the already-typed `options.compact`. |
| `SettingsMenu` | `content-toolbar/toolbar-components/settings-menu.tsx` | The real "kanban settings panel" (Item 3). Already renders the kanban Layout group via **prop callbacks** (`kanbanCandidates`, `kanbanConfig`, `onKanbanConfigChange`) injected by `content-list.tsx`. It does **not** import `content-kanban`. This IoC boundary is the crux of the Item 3 VETO check below. |

**b) Architectural boundaries affected**

- **`@beechcms/core`** — **ZERO code change.** `validateCardConfigAgainstSeed` / `isCardEligibleBranch` / `METADATA_SLOT_CAP` already exist and are exported (Sprint 1). Consumed, not modified.
- **`apps/api`** — **one file** (`features/content/handlers/view-config.ts`, Item 2) + its test. `seed` is already resolved in `putViewConfigHandler` scope. No new endpoint, no migration, no middleware change.
- **`apps/dashboard`** — three slices touched, all additively:
  - `features/fields` (shared kernel): `display/text.tsx`, `display/relation.tsx` honour `options.compact` (Items 1). `options.compact?: boolean` already on `FieldDisplayProps` (Sprint 1).
  - `features/content-kanban`: `kanban-card.tsx` media slot options (Item 4); trigger button removed from `content-kanban.tsx` (Item 3).
  - `features/content-toolbar`: `SettingsMenu` gains one callback prop + one row (Item 3).
  - `pages/content-list.tsx`: orchestrates the lifted `CardConfigDialog` (Item 3).

**c) `graphify affected` impact analysis (breaking-change proof)**

```
graphify affected "putViewConfigHandler" --depth 2
  - view-config.handler.test.ts [imports]        # only consumer is its own handler test
graphify affected "validateCardConfigAgainstSeed" --depth 2
  - seed-layout.test.ts [imports]; isCardEligibleBranch() [calls]   # pure, self-contained
graphify affected "RelationDisplay" --depth 2
  - No affected nodes found.                      # renderer is a leaf; compact change is local
graphify affected "MediaDisplay" --depth 2
  - isAssetListBranch/parseAssetListValue/parseSingleUrl [calls]     # internal helpers only
```

→ Every Sprint 2 change is **additive or leaf-local**. No production node downstream of the touched symbols breaks. `FieldDisplayProps.options.compact` is optional and already typed, so `lib/dynamic-columns.tsx` (table view) and every other `FieldDisplay` caller compile unchanged.

**Storage / migration fact (verified):** card config still lives in `seed_layouts.view_config TEXT`. **No new migration. No new REST route.**

---

### VETO Audit

Proposed boundaries evaluated against `ponytail_arch.md`.

**1. Botanical Invariant (no `@beech/core` bypass; Branch IDs not aliases).**
- Item 2 routes the PUT payload through `validateCardConfigAgainstSeed` (a `@beechcms/core` pure function) before `seedLayoutRepository.setViewConfig`. This *strengthens* the botanical gate — dangling `branchId`s are now stripped server-side, not just client-side. No direct D1 access. Slot fields remain `{ branchId: 'br_XX' }`. **PASS.**

**2. VSA — no cross-feature imports. ⚠ PRIMARY RISK (Item 3).**
- The brief says "move the trigger into the existing settings panel." That panel (`SettingsMenu`) lives in the **`content-toolbar`** slice; `CardConfigDialog` lives in the **`content-kanban`** slice. **Importing `CardConfigDialog` into `content-toolbar` would be a peer-to-peer cross-feature import → VETO.**
- **Adjustment (mandated):** follow the *existing* IoC pattern already used for kanban axis/hidden-column controls. `content-toolbar` never imports `content-kanban`; it receives `kanbanConfig`/`onKanbanConfigChange` as props from `content-list.tsx`. Item 3 mirrors this exactly:
  - `SettingsMenu` gains a **callback prop** `onOpenCardConfig?: () => void` and renders a labelled row inside its existing kanban Layout group.
  - `CardConfigDialog` is **lifted to `content-list.tsx`** (a page — composition of slices is sanctioned, not a peer slice). `content-list` already holds `seed`, `slug`, `cardConfig`, `setCardConfig`.
  - `content-toolbar` only *fires* the callback. **No `content-kanban` import added. VSA PASS.**
- Items 1/4 touch only `features/fields` (the sanctioned shared kernel) and `content-kanban`'s own files. No new peer import. **PASS.**

**3. Cloudflare Purity / YAGNI.**
- No ORM, no migration, no new endpoint, no background job. Item 2 reuses the existing pure validator instead of adding bespoke handler logic. Renderer changes cap output (bounded card height) — anti-over-engineering. **PASS.**

**Verdict: one adjustment applied (Item 3 IoC callback instead of cross-slice import). Plan proceeds.**

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 shipped the card-customization contract (core schema + validator) and the dashboard render/slot path. Sprint 2 exists to **close the correctness and integrity gaps** that make Sprint 1 shippable rather than merely present:

- **Botanical integrity at the write boundary (Item 2):** the api PUT currently validates only the Zod *shape*, so a `branchId` pointing at a deleted branch persists in the blob until the dashboard happens to reopen the dialog. Enforcing `validateCardConfigAgainstSeed` on write makes `@beechcms/core` the single source of truth for *semantic* validity, not just structural — the Botanical Invariant demands the core gate, not the client, own cleanup.
- **Shared-kernel correctness (Item 1):** `options.compact` is a typed-but-dead flag. Until `TextDisplay`/`RelationDisplay` honour it, cards with array/tag/multi-relation fields grow unbounded — the feature is visually broken. The fix lives in `features/fields` (the shared kernel) so table view and card view stay consistent; the relation clip is also a *regression fix* for table view (it currently always clips to 3).
- **VSA-correct trigger placement (Item 3):** the Sprint 1 trigger is a stray text link. Relocating it into `SettingsMenu` via IoC callback keeps the two slices isolated while giving the feature a discoverable home alongside axis/sort/hidden-column controls.

Order is dictated by risk and dependency: **(1) core-backed api hardening → (2) shared-kernel renderers → (3) slice-local render/trigger polish → (4) test coverage.** The core tier is untouched by construction; the api change depends on an already-exported core function; dashboard changes depend on nothing new.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Core (frozen, reused):** `validateCardConfigAgainstSeed(config, seed)`, `isCardEligibleBranch(branch)`, `METADATA_SLOT_CAP`, `kanbanCardConfigSchema`, `CardSlotField` — all exported from `@beechcms/core` (Sprint 1). `validateCardConfigAgainstSeed` returns `{ ok, cleaned, errors? }` with `cleaned: KanbanCardConfig`.

**API (`apps/api/src/features/content/handlers/view-config.ts`):**
- `putViewConfigHandler`: resolves `const seed = context.get('getSeed')(slug)` (already in scope), then `seedViewConfigSchema.safeParse(body)` → 422 on fail → `setViewConfig(slug, parsed.data, jwtPayload.sub)`.
- **Gap:** no semantic validation of `parsed.data.card`. Insertion point is between `safeParse` success and `setViewConfig`.

**Shared render kernel (`features/fields`):**
- `registry.ts`: `file → MediaDisplay`; `text → TextDisplay`; `relation → RelationDisplay`; richtext/json/repeater have their own renderers. `getDisplayComponent(type)` falls back to `DefaultDisplay`.
- `display/text.tsx`: `TextDisplay({ value, options })` → `ExpandableCell content maxLength={options?.maxLength ?? 50}`. **Ignores `options.compact`; ignores array values** (stringifies via `String(value)`).
- `display/relation.tsx`: `RelationDisplay({ branch, value })` — **destructures no `options`**. Multiple path hardcodes `const visible = ids.slice(0, 3)` (line ~153) → **always clips to 3, even in table view (regression).**
- `display/media.tsx`: `MediaDisplay({ branch, value })` — ignores `options` entirely (already correct; `maxLength: 0` is inert for `file` branches).
- `types.ts`: `FieldDisplayProps.options` already includes `maxLength?` and `compact?` (Sprint 1).

**Kanban card (`content-kanban/kanban-card.tsx`):**
- `SlotCell({ slot, maxLength, compact })` → `<FieldDisplay ... options={{ maxLength, compact }} />`.
- Media slot renders `<SlotCell slot={slots.media} maxLength={0} />` (line ~46) → for `file` branches routes to `MediaDisplay` (options ignored, fine); for a non-file branch mis-placed in the media slot routes to `TextDisplay` with `maxLength:0` → renders empty. Header `maxLength:40`, subtitle `60`, metadata `24` + `compact`.

**Trigger location (`content-kanban/content-kanban.tsx` lines 176, 219–240):**
- `const [cardConfigOpen, setCardConfigOpen] = useState(false)`; a bare `<button>` text link `kanban.cardConfig.openConfig` + inline `<CardConfigDialog open config seed onSave={setCardConfig} />`, gated on `setCardConfig` truthy.

**Settings panel (`content-toolbar/toolbar-components/settings-menu.tsx`):**
- `SettingsMenu` renders a kanban Layout group when `activeViewId === "kanban" && kanbanCandidates?.length` (line ~348): "Group by" (axis) and "Visible columns" (hidden values) subs. Driven by props `kanbanCandidates`, `kanbanConfig`, `onKanbanConfigChange`, `kanbanAxisBranch`, `closeSettingsMenu` — **no `content-kanban` import**.

**Orchestration (`pages/content-list.tsx`):**
- Line 172: `const { seed } = useActiveSeed(slug)`.
- Line 228: `const { kanbanConfig, setKanbanConfig, cardConfig, setCardConfig, isSaving } = useKanbanViewConfig(slug)`.
- Line 834: `<ContentToolbar ... onKanbanConfigChange={setKanbanConfig} ...>` wraps children; line 986 `<ContentKanban seed slug cardConfig setCardConfig ... />` is a child. `content-list` already imports both `ContentKanban` (from `@/features/content-kanban`) and `ContentToolbar`.

**Hook under test (`content-kanban/hooks/use-kanban-column-query.ts`):**
- `useKanbanColumnQuery(seedSlug, ..., seed?, cardConfig?)` → `useInfiniteQuery`, maps pages via `buildKanbanCardDisplayModel(item, axisBranch, col.value, seed, cardConfig)` (line 47). **0% coverage.**

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core` — NONE.** (Symbols already exist/exported. No edit, no re-export.)

**`apps/api` (Item 2):**
- `src/features/content/handlers/view-config.ts` — call `validateCardConfigAgainstSeed` on `parsed.data.card` before persisting.
- `src/features/content/handlers/view-config.handler.test.ts` — new case: PUT `card` with nonexistent `branchId` → 200/ok, persisted blob has it stripped.

**`apps/dashboard` (Items 1, 3, 4, 5):**
- `features/fields/display/text.tsx` — honour `options.compact` for array / comma-tag values (≤3 + `+N`). *(Item 1)*
- `features/fields/display/relation.tsx` — destructure `options`; gate the `slice(0,3)` clip behind `options?.compact` (render all otherwise — regression fix). *(Item 1)*
- `features/content-kanban/kanban-card.tsx` — media slot: drop `maxLength` (pass no options). *(Item 4)*
- `features/content-kanban/content-kanban.tsx` — remove the inline trigger `<button>` + `<CardConfigDialog>` block; drop `cardConfigOpen` state. *(Item 3)*
- `features/content-toolbar/toolbar-components/settings-menu.tsx` — add `onOpenCardConfig?: () => void` prop + a "Card layout" row in the kanban Layout group. *(Item 3)*
- `features/content-toolbar/content-toolbar.tsx` + `use-content-toolbar.ts` — thread `onOpenCardConfig` through to `SettingsMenu`. *(Item 3)*
- `pages/content-list.tsx` — own `cardConfigOpen` state; pass `onOpenCardConfig` to `ContentToolbar`; mount `<CardConfigDialog>` (import from `@/features/content-kanban`). *(Item 3)*
- `src/locales/en.json` / `it.json` — key `kanban.cardConfig.openConfig` (relabel row; existing key reused).
- `src/test/card-config-dialog.test.tsx` **(new)** — component test. *(Item 5)*
- `src/test/use-kanban-column-query.test.ts` **(new)** — hook test. *(Item 5)*

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**4.0 Migration — NONE.** Downstream agent MUST NOT author any D1 migration or REST route.

**4.1 API hardening (Item 2) — `apps/api/src/features/content/handlers/view-config.ts`**

Add the import and insert the validation between `safeParse` success and `setViewConfig`. `seed` is already in scope.

```ts
import { seedViewConfigSchema, validateCardConfigAgainstSeed } from '@beechcms/core'
// ...
const parsed = seedViewConfigSchema.safeParse(body)
if (!parsed.success) {
  return publicProblem(context, { type: 'content-invalid-view-config', title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues[0]?.message ?? 'Invalid view config' })
}

// Semantic hardening: strip slot branchIds that no longer exist / are ineligible.
if (parsed.data.card) {
  const { cleaned } = validateCardConfigAgainstSeed(parsed.data.card, seed)
  parsed.data = { ...parsed.data, card: cleaned }
}

const jwtPayload = context.get('jwtPayload')
await context.get('seedLayoutRepository').setViewConfig(slug, parsed.data, jwtPayload.sub)
return context.json({ ok: true })
```

Note: `validateCardConfigAgainstSeed` returns `cleaned` on both `ok:true` and `ok:false` — always persist `cleaned`, never 422 on a dangling branch (auto-cleanup contract, matches `validateLayoutAgainstSeed`).

**4.2 Text renderer compact (Item 1) — `features/fields/display/text.tsx`**

`compact` applies only to array / comma-separated multi-value strings. Single string keeps existing `maxLength` truncation.

```ts
const CARD_TAG_CAP = 3

export function TextDisplay({ value, options }: FieldDisplayProps) {
  if (value == null) return <div className="text-muted-foreground">-</div>

  if (options?.compact) {
    const items = Array.isArray(value)
      ? value.map(String).filter(Boolean)
      : String(value).includes(',')
        ? String(value).split(',').map(s => s.trim()).filter(Boolean)
        : null
    if (items && items.length > 0) {
      const visible = items.slice(0, CARD_TAG_CAP)
      const overflow = items.length - visible.length
      return (
        <div className="flex flex-wrap items-center gap-1">
          {visible.map((it, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs truncate max-w-[8rem]">{it}</span>
          ))}
          {overflow > 0 && <span className="text-muted-foreground text-xs">+{overflow}</span>}
        </div>
      )
    }
  }

  const text = String(value)
  const maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
  return <ExpandableCell content={text} maxLength={maxLength} />
}
```
(Reuse an existing badge/pill component if `content-toolbar`/`ui` already exports one; do not add a dependency. The inline span above is the fallback.)

**4.3 Relation renderer compact + regression fix (Item 1) — `features/fields/display/relation.tsx`**

Destructure `options` and gate the clip. Table view (no `compact`) must show all avatars.

```ts
export function RelationDisplay({ branch, value, options }: FieldDisplayProps) {
  // ...unchanged setup...
  if (isMultiple) {
    const ids = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
    if (ids.length === 0) content = <span className="text-muted-foreground">—</span>
    else {
      const visible = options?.compact ? ids.slice(0, 3) : ids   // clip ONLY in compact/card mode
      const overflow = ids.length - visible.length
      content = (
        <AvatarGroup>
          {visible.map(id => (
            <RelationChip key={id} targetSlug={targetSlug ?? ""} targetId={id} labelAlias={labelAlias} onClick={setSelectedId} />
          ))}
          {overflow > 0 && <AvatarGroupCount className="text-xs">+{overflow}</AvatarGroupCount>}
        </AvatarGroup>
      )
    }
  } else { /* unchanged single path */ }
  // ...unchanged return...
}
```

**4.4 Media slot fix (Item 4) — `features/content-kanban/kanban-card.tsx`**

`file` branches route to `MediaDisplay` (ignores options → `maxLength:0` inert). Bug only bites a non-file branch mis-placed in the media slot (→ `TextDisplay`, `slice(0,0)==''`). Drop the `maxLength` for the media slot.

```tsx
// before: <SlotCell slot={slots.media} maxLength={0} />
{slots.media && (
  <FieldDisplay branch={slots.media.branch} value={slots.media.value} />
)}
```
Rationale: bypass `SlotCell` for media (it forces a numeric `maxLength`); call `FieldDisplay` directly with no `options`, so `MediaDisplay` renders normally and a mis-placed text branch shows real (untruncated-to-zero) content. Leave header/subtitle/metadata `SlotCell` calls unchanged. `SlotCell`'s `maxLength` prop stays required for the remaining callers.

**4.5 Trigger relocation via IoC (Item 3) — VSA-critical**

*(a) `content-kanban/content-kanban.tsx`* — delete lines 219–240 block (the `setCardConfig && (...)` fragment with the `<button>` and inline `<CardConfigDialog>`) and remove `const [cardConfigOpen, setCardConfigOpen] = React.useState(false)` (line 176). `CardConfigDialog` import is removed from this file. `cardConfig`/`setCardConfig` props stay on `ContentKanbanProps` (unchanged) — still threaded to columns; only the *trigger* leaves.

*(b) `content-toolbar/toolbar-components/settings-menu.tsx`* — add prop and a row inside the existing kanban Layout group (after the "Visible columns" sub, still under `activeViewId === "kanban" && kanbanCandidates?.length`). **No `content-kanban` import.**

```ts
// SettingsMenuProps additions:
readonly onOpenCardConfig?: () => void
```
```tsx
{onOpenCardConfig && (
  <DropdownMenuItem
    onSelect={() => { onOpenCardConfig(); closeSettingsMenu() }}
  >
    <LayoutGrid className="size-4" />
    {t('kanban.cardConfig.openConfig', 'Configure card layout')}
  </DropdownMenuItem>
)}
```
(Import `LayoutGrid` from `lucide-react` alongside the existing icons.)

*(c) `content-toolbar/content-toolbar.tsx` + `use-content-toolbar.ts`* — add `onOpenCardConfig?: () => void` to `ContentToolbar` props and pass it straight to `<SettingsMenu onOpenCardConfig={onOpenCardConfig} />`, mirroring how `onKanbanConfigChange` is already threaded.

*(d) `pages/content-list.tsx`* — lift dialog ownership here (page = sanctioned composition point; already imports `ContentKanban` from the slice):

```tsx
const [cardConfigOpen, setCardConfigOpen] = React.useState(false)
// ...
<ContentToolbar
  /* ...existing props... */
  onKanbanConfigChange={setKanbanConfig}
  onOpenCardConfig={() => setCardConfigOpen(true)}
>
  {/* ...children incl. <ContentKanban .../> ... */}
</ContentToolbar>

{seed && slug && activeViewId === 'kanban' && (
  <CardConfigDialog
    open={cardConfigOpen}
    onClose={() => setCardConfigOpen(false)}
    seed={seed}
    config={cardConfig}
    onSave={setCardConfig}
  />
)}
```
Import: `import { CardConfigDialog } from '@/features/content-kanban'` (add to the barrel `content-kanban/index.ts` re-exports if not already exported).

**4.6 Locales** — `kanban.cardConfig.openConfig` already exists (reused verbatim by the row). No new key required unless a distinct tooltip is desired; if so add `kanban.cardConfig.openConfig` to both `en.json` and `it.json` (it: "Configura layout scheda").

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Core unchanged — build + tests stay green (regression guard)
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test

# 2. API type-check + view-config handler test (Item 2)
pnpm --filter ./apps/api exec tsc --noEmit
pnpm --filter ./apps/api run test -- view-config

# 3. Dashboard type-check + kanban + fields tests
pnpm --filter ./apps/dashboard exec tsc --noEmit
pnpm --filter ./apps/dashboard run test -- kanban
pnpm --filter ./apps/dashboard run test -- card-config
pnpm --filter ./apps/dashboard run test -- use-kanban-column-query

# 4. Workspace-wide diff gate
pnpm beech test --diff

# 5. Refresh the AST graph after the diff
graphify update . --force
```

**Required new test cases:**

`apps/api/.../view-config.handler.test.ts`:
- PUT `{ card: { version:1, header:{branchId:'br_DOESNOTEXIST'}, metadata:[] } }` → 200 `{ ok:true }`; assert persisted (via repo spy / GET) blob's `card.header` is `null`/absent (branch stripped).
- PUT with a valid `card` → 200; blob preserved intact (no false stripping).

`apps/dashboard/src/test/card-config-dialog.test.tsx`:
- Renders slot pickers listing only `isCardEligibleBranch` branches; richtext/json/repeater/system branches absent from every picker.
- Metadata multi-select stops adding past `METADATA_SLOT_CAP`.
- `onSave` fired with a `{ version:1, media?, header?, subtitle?, metadata:[...] }` shape (branchIds only).

`apps/dashboard/src/test/use-kanban-column-query.test.ts`:
- With `cardConfig` present: `buildKanbanCardDisplayModel` called with `seed` and `cardConfig` (spy/mock the module); returned cards carry `slots`.
- Without `cardConfig`: legacy path — `slots` undefined on returned cards.

Sprint 1 baseline (must stay green): core 433, api 1030, dashboard 666.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `@beechcms/core` **untouched** in the diff (no file under `packages/core/src` modified).
- [ ] **No new D1 migration; no new REST endpoint** in the diff.
- [ ] `putViewConfigHandler` calls `validateCardConfigAgainstSeed` on `parsed.data.card` and persists `cleaned`; a dangling `branchId` returns 200 (not 422) and is stripped from the stored blob (proven by test).
- [ ] `TextDisplay` with `options.compact` renders ≤3 items + `+N` for array/comma-tag values; single-string path unchanged (`maxLength` truncation intact).
- [ ] `RelationDisplay` clips to 3 avatars **only** when `options.compact`; table view (no compact) renders all — regression fixed.
- [ ] No other renderer (`boolean/date/number/media`) modified.
- [ ] Media slot in `kanban-card.tsx` renders via `MediaDisplay` with no `maxLength:0`; a `file` branch shows its asset, no empty render.
- [ ] Card-config trigger removed from `content-kanban.tsx`; lives as a labelled row in `SettingsMenu`'s kanban Layout group.
- [ ] **`content-toolbar` does NOT import `content-kanban`** — trigger wired purely via `onOpenCardConfig` callback (VSA). `CardConfigDialog` mounted in `content-list.tsx`.
- [ ] `ContentKanbanProps` `cardConfig`/`setCardConfig` unchanged.
- [ ] `FieldDisplayProps.options` change is zero (already typed) — all existing `FieldDisplay` callers compile; `tsc --noEmit` clean in api + dashboard.
- [ ] New tests added for `view-config` handler, `card-config-dialog`, `use-kanban-column-query`; all suites green.
- [ ] `pnpm beech test --diff` green; `graphify update . --force` run.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Any core schema/validator change — `validateCardConfigAgainstSeed`, `isCardEligibleBranch`, `kanbanCardConfigSchema` are frozen; consume only.
- New D1 migration, new `content_{slug}` column, or any change to `seed_layouts`.
- New REST endpoint — reuse `GET/PUT /:slug/view-config`.
- Importing `CardConfigDialog` (or anything from `content-kanban`) into `content-toolbar` — VSA-forbidden; use the callback.
- Changes to `boolean/date/number/media` renderers, or any `FieldDisplay` registry refactor beyond honouring the existing `options.compact`.
- Free-form card builder, per-user card overrides, RichText on card (brief §Out of Scope).
- Drag-and-drop / column behaviour, `resolveKanbanConfig`, kanban-move/position handlers.
- `KanbanCardOverlay` slot rendering during drag (cosmetic, deferred).
- `buildKanbanCardDisplayModel` signature change — its consumers' render *options* change, not the function.
