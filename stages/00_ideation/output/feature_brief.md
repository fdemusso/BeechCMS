# Feature Brief — Kanban Card Customization: Sprint 2 (Hardening & Polish)

> **Prior art:** Sprint 1 plan and deliverables → `docs/Sprints/KanbanCardCustomization.md`
> **Do not re-implement anything listed under "Completed in Sprint 1".** Read that file and the current codebase state before planning.

---

## What was built in Sprint 1 (DO NOT TOUCH)

All of the following is already implemented, tested, and graph-synced:

| Layer | Symbol / File | Status |
|-------|---------------|--------|
| `@beechcms/core` | `cardSlotFieldSchema`, `KanbanCardConfig`, `kanbanCardConfigSchema`, `CardSlotField` | ✅ done |
| `@beechcms/core` | `isCardEligibleBranch`, `validateCardConfigAgainstSeed`, `METADATA_SLOT_CAP` | ✅ done |
| `@beechcms/core` | `seedViewConfigSchema` extended with optional `card` key | ✅ done |
| `apps/api` | Zero changes — `putViewConfigHandler` pass-through via Zod shape only | ✅ intentional |
| `content-kanban/types.ts` | `ResolvedSlotField`, `KanbanCardSlots`, `slots?` on `KanbanCardDisplayModel`, `KanbanCardBoardConfig` | ✅ done |
| `content-kanban/kanban-card-display.ts` | Slot resolution path + legacy heuristic fallback | ✅ done |
| `content-kanban/kanban-card.tsx` | Header / Subtitle / Metadata slots via `FieldDisplay`; legacy fallback when `slots` undefined | ✅ done |
| `content-kanban/hooks/use-kanban-view-config.ts` | `cardConfig`, `setCardConfig` exposed | ✅ done |
| `content-kanban/card-config/card-config-dialog.tsx` | Slot editor dialog (branch picker per slot) | ✅ done |
| `features/fields/types.ts` | `options.compact?: boolean` added additively | ✅ done |
| `content-kanban/content-kanban.tsx` | `CardConfigDialog` mounted; trigger button; `seed`/`cardConfig` threaded to columns | ✅ done |
| `use-kanban-column-query.ts` | `seed?` / `cardConfig?` params; passed to `buildKanbanCardDisplayModel` | ✅ done |
| `pages/content-list.tsx` | `cardConfig`/`setCardConfig` from hook wired into `<ContentKanban>` | ✅ done |
| Locale keys | `kanban.cardConfig.*` in `en.json` / `it.json` | ✅ done |

**Core invariants that must not change:**
- Slot fields stored as `{ branchId: 'br_XX' }` only — no aliases.
- No new D1 migration (card config lives in `seed_layouts.view_config TEXT` blob).
- No new REST endpoint (reuses `GET/PUT /:slug/view-config`).
- RichText / json / repeater / system aliases are forbidden from all slots — enforced by `isCardEligibleBranch`.

---

## Sprint 2 Scope

### Item 1 — P0: `compact` flag not read by any renderer (blocks feature correctness)

**Problem:** `FieldDisplayProps.options.compact` is typed but ignored everywhere. The kanban card passes `compact: true` to metadata slot cells. Without renderer support, array-like fields (tags, multi-relations) display all items — breaking card height.

**Required changes:**

`features/fields/display/text.tsx`
- When `options?.compact === true` AND value is an array or comma-separated tag string: render ≤3 items + `+N` badge instead of joined text.
- Single string value: `maxLength` truncation already works, no change.

`features/fields/display/relation.tsx`
- `RelationDisplay` (multiple path) already hardcodes 3 visible avatars — this is the **correct compact behaviour**.
- When `options?.compact !== true` (i.e. table view): show **all** items, not just 3. Currently always clips to 3 — this is a regression introduced by the existing hardcoding.
- Fix: move the `visible = ids.slice(0, 3)` clip inside `if (options?.compact)` block; otherwise render all.

No changes to `boolean.tsx`, `date.tsx`, `number.tsx`, `media.tsx` — they have no array/overflow case.

---

### Item 2 — P1: API hardening — `validateCardConfigAgainstSeed` on PUT

**Problem:** `putViewConfigHandler` validates shape via Zod but does not call `validateCardConfigAgainstSeed`. A `branchId` referencing a deleted branch passes through and persists in the blob. Dashboard strips it only on next dialog open.

**Required change (`apps/api/src/features/content/handlers/view-config.ts`):**

After `seedViewConfigSchema.safeParse(body)` succeeds and `parsed.data.card` is present:

```ts
import { validateCardConfigAgainstSeed } from '@beechcms/core'

if (parsed.data.card) {
  const { cleaned } = validateCardConfigAgainstSeed(parsed.data.card, seed)
  parsed.data = { ...parsed.data, card: cleaned }
}
```

Then persist `parsed.data` (already the case). No new endpoint, no migration.

Add test case to `view-config.handler.test.ts`: PUT with a `card` containing a nonexistent `branchId` → 200, persisted blob has that branchId stripped.

---

### Item 3 — P2: Trigger UX — move config button into existing settings panel

**Problem:** "Configure card layout" is a standalone text link above the board. It should live inside the existing view-settings panel (the gear icon / `settings` section in `content-toolbar`) alongside axis/sort/hidden-column controls.

**Required change:**
- Remove the inline `<button>` + `<CardConfigDialog>` block currently at the top of `ContentKanban`'s return (added in Sprint 1).
- Lift `cardConfigOpen` state + `CardConfigDialog` mounting to wherever the kanban settings panel lives. Identify the exact component via `graphify query "kanban settings panel"` before touching anything.
- The trigger should be a labelled button/row consistent with existing settings rows (not a bare text link).
- `ContentKanbanProps.setCardConfig` and `cardConfig` remain unchanged — only the trigger location moves.

---

### Item 4 — P2: Media slot rendering fix

**Problem:** `kanban-card.tsx` passes `options={{ maxLength: 0 }}` to `FieldDisplay` for the media slot. `TextDisplay` with `maxLength: 0` renders empty string (since `content.slice(0, 0) === ''`). File/image branches need to render via `MediaDisplay`, not `TextDisplay`.

**Diagnosis first:** confirm via graphify which branch types reach `MediaDisplay` vs `TextDisplay` (registry routing in `features/fields/registry.ts`). If `file` branches correctly route to `MediaDisplay`, the `maxLength: 0` is harmless for them and the bug only affects edge cases where a non-file branch is placed in the media slot.

**Required change (if confirmed):**
- Remove `maxLength` from the media slot `SlotCell` call in `kanban-card.tsx` (pass no options, or `options={undefined}`).
- `MediaDisplay` already renders correctly without options.

---

### Item 5 — P3: Test coverage

**`card-config/card-config-dialog.tsx`** — no test. Add component test:
- Renders slot pickers for all eligible branches.
- Disabling ineligible branch types (richtext slot picker should not show richtext branches).
- Metadata toggle respects `METADATA_SLOT_CAP`.
- onSave called with correct `KanbanCardConfig` shape.

**`use-kanban-column-query.ts`** — 0% coverage. Add hook test:
- With `cardConfig` present: `buildKanbanCardDisplayModel` called with `seed` and `cardConfig`.
- Without `cardConfig`: legacy path (slots undefined on returned cards).

---

## Out of Scope (confirmed, do not propose)

- Free-form card builder (discarded in ideation).
- Per-user card layout overrides.
- RichText on card.
- Drag-and-drop / column behaviour changes.
- `KanbanCardOverlay` slot rendering during drag (cosmetic, deferred).

---

## Validation gate (same as Sprint 1)

```bash
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core run test
pnpm --filter ./apps/api exec tsc --noEmit
pnpm --filter ./apps/api run test -- view-config
pnpm --filter ./apps/dashboard exec tsc --noEmit
pnpm --filter ./apps/dashboard run test -- kanban
pnpm beech test --diff
graphify update .
```

Sprint 1 baseline: core 433 tests, api 1030 tests, dashboard 666 tests — all must stay green.
