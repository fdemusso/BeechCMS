# Runtime Seeds — Sprint 08: Repeater Field Renderer

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 07** (the shared `SchemaFormShell` + view-model). Read
> [`00-overview.md`](./00-overview.md) and
> [`seed-creation-modal-analysis.md`](./seed-creation-modal-analysis.md) first.

## 0. Why this sprint exists

After sprint 07 the universal modal is fully registry-driven: `SchemaFormShell` →
`LayoutRenderer` → `<FieldEdit branch={b} />`, and `FieldEdit` resolves a renderer by
`branch.type` from the field registry (`apps/dashboard/src/features/fields/registry.ts`).
Today the registry knows `text`, `richtext`, `number`, `boolean`, `date`, `json`, `tags`,
`file`, `relation`. There is **no renderer for "an array of structured objects"** — so a
field of that kind falls back to `DefaultEdit`.

That array-of-objects is the **one** thing the modal cannot draw yet, and it is exactly
what the Seed editor needs for its `branches` list (sprint 09). This sprint builds that
missing renderer — **`FieldEditRepeater`** — and registers it under the new field type
`repeater`. This is **dashboard-only**: it touches the field registry, not the Botanical
Engine. No DDL, no serialization, no validation in `@beechcms/core`. (Promoting
`repeater` to a real persisted content field type is the optional sprint 10.)

The analysis (`create-entry-form.tsx`) named the pattern: `react-hook-form`'s
`useFieldArray` for add/remove/reorder of dynamic rows. We use the same idea, but as a
self-contained `FieldEdit` component driven by `value`/`onChange` (the registry contract),
not by a parent `useFormContext`.

## 1. Role & ground rules

Senior front-end engineer, `apps/dashboard`: React 19 + Tailwind 4 + shadcn/radix +
react-hook-form (available) + i18next. **VSA**: the renderer lives inside the existing
`fields` slice (`apps/dashboard/src/features/fields/`). All text via `t()` with keys in
both locales. Docs English.

## 2. The registry contract (must match exactly)

`apps/dashboard/src/features/fields/types.ts`:

```ts
export interface FieldEditProps {
  readonly branch: Branch
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}
```

`apps/dashboard/src/features/fields/registry.ts` registers built-ins on a module-level
`fieldRegistry` singleton and exposes `getEditComponent(type)`. A new type is one
`fieldRegistry.registerEdit('repeater', FieldEditRepeater)` line.

`Branch` (from `@beechcms/core`, see `00-overview.md` §"Seed / Branch model") carries the
field metadata. For a repeater we need to describe **the shape of each item**. Two item
shapes exist in this series:

- **Branch-item** (sprint 09, available now): each item *is* a `Branch` (alias, label,
  type, policies, type-conditional options). The per-item editor is the **existing**
  `BranchEditor` row UI.
- **Generic sub-field item** (sprint 10, scaffolded but inert): each item is a record of
  values keyed by a small list of *sub-branches*, each rendered recursively via
  `FieldEdit`. This is what real content types will use for FAQ/timeline/gallery lists.

`FieldEditRepeater` is the **generic list container** (add/remove/reorder/collapse). The
**item body** is selected from the branch definition so the same container serves both
shapes — the branch-item path ships and works now; the generic path is wired behind a
clearly marked `SPRINT 10` guard.

## 3. The value shape

`value` is an **array**. `onChange(nextArray)` replaces it. For the branch-item config the
elements are `Branch` objects; for the generic config they are `Record<string, unknown>`.
Always treat `value` defensively: `const items = Array.isArray(value) ? value : []`.

## 4. How the item shape is declared on the branch

Extend the branch metadata the renderer reads (no core type change needed yet — read it
loosely and document the intended core fields for sprint 10):

```ts
// Read from `branch` at runtime. In sprint 10 these become typed fields on the
// core `Branch` interface; for now the Seed hook (sprint 09) supplies them on the
// in-memory *virtual* branch, so no @beechcms/core change is required.
interface RepeaterMeta {
  /** 'branch'  → each item is a Branch, edited by the BranchEditor row (ships now).
   *  'fields'  → each item is a record edited by sub-branches (SPRINT 10).        */
  itemKind?: "branch" | "fields"
  /** Only for itemKind:'fields' — the sub-schema of each item. SPRINT 10.         */
  fields?: Branch[]
  /** Optional UI label for the add button / empty state.                         */
  itemLabel?: string
  /** Context the branch-item editor needs (active seeds for relation targets).    */
  branchItemContext?: { activeSeedsForRelation: Seed[] }
}
```

`branch.type === "repeater"` selects the renderer; `branch.repeater` (a `RepeaterMeta`)
selects the item body. Default `itemKind` to `"branch"`.

## 5. The renderer — `edit/repeater.tsx` (new)

Create `apps/dashboard/src/features/fields/edit/repeater.tsx`.

```tsx
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import type { Branch, Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import type { FieldEditProps } from "../types"
import { BranchItemRow } from "./repeater-branch-item"
// import { GenericItemRow } from "./repeater-generic-item" // SPRINT 10

interface RepeaterMeta {
  itemKind?: "branch" | "fields"
  fields?: Branch[]
  itemLabel?: string
  branchItemContext?: { activeSeedsForRelation: Seed[] }
}

export function FieldEditRepeater({ branch, value, onChange }: FieldEditProps) {
  const { t } = useTranslation()
  const meta = ((branch as unknown as { repeater?: RepeaterMeta }).repeater) ?? {}
  const itemKind = meta.itemKind ?? "branch"
  const items: unknown[] = Array.isArray(value) ? value : []

  function update(index: number, next: unknown) {
    const copy = items.slice()
    copy[index] = next
    onChange(copy)
  }
  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return
    const copy = items.slice()
    const [m] = copy.splice(from, 1)
    copy.splice(to, 0, m)
    onChange(copy)
  }
  function add() {
    if (itemKind === "branch") {
      const blank: Branch = { id: `br_new_${Date.now()}`, alias: "", label: "", type: "text" }
      onChange([...items, blank])
      return
    }
    // SPRINT 10: generic item — seed a record with empty values per sub-branch.
    const blank: Record<string, unknown> = {}
    for (const f of meta.fields ?? []) blank[f.alias] = f.type === "boolean" ? false : ""
    onChange([...items, blank])
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        itemKind === "branch" ? (
          <BranchItemRow
            key={(item as Branch).id ?? idx}
            branch={item as Branch}
            activeSeedsForRelation={meta.branchItemContext?.activeSeedsForRelation ?? []}
            onChange={(b) => update(idx, b)}
            onRemove={() => remove(idx)}
            onMoveUp={() => move(idx, idx - 1)}
            onMoveDown={() => move(idx, idx + 1)}
          />
        ) : (
          // SPRINT 10: <GenericItemRow subBranches={meta.fields ?? []} value={item …} />
          null
        )
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        <Plus className="mr-1 size-4" />
        {meta.itemLabel ?? t("fields.repeater.addItem")}
      </Button>
    </div>
  )
}
```

> **Why two files for the item body.** Keeping `BranchItemRow` and (future)
> `GenericItemRow` separate means sprint 10 adds a file and flips one `null` branch — it
> never edits the working branch-item path. Leave the `// SPRINT 10` comments verbatim.

## 6. The branch-item body — `edit/repeater-branch-item.tsx` (new)

This is the per-row editor for **one Branch**. **Reuse the existing logic** from
`apps/dashboard/src/features/seed-builder/components/BranchEditor.tsx` (`BranchRow`): the
collapsible row with alias/type/label + type-conditional sub-forms (relation/number/file/
tags/json) + policies. **Do not import it across the slice boundary.** Instead, promote
the row to the shared field slice:

1. Move the `BranchRow` component (and its tiny `AUTOMATION_RESERVED` / `BRANCH_TYPES`
   constants) from `seed-builder/components/BranchEditor.tsx` into
   `fields/edit/repeater-branch-item.tsx`, renamed `BranchItemRow`, adapting its props to
   `{ branch, activeSeedsForRelation, onChange, onRemove, onMoveUp, onMoveDown }`.
2. Add up/down move buttons next to the existing trash button (reorder support the
   current `BranchEditor` lacks).
3. Keep the `isExisting` read-only behaviour for `alias`/`type` — but **drive it from the
   branch**, not a parent set: a branch is "existing" when its `id` does not start with
   `br_new_`. (The Seed hook in sprint 09 preserves real ids; new rows get `br_new_*`.)
4. `seed-builder/components/BranchEditor.tsx` is then **deleted in sprint 09** (its job is
   subsumed by the repeater). For sprint 08, leave `BranchEditor.tsx` in place and have it
   re-export / delegate to `BranchItemRow` so nothing breaks mid-series:
   ```ts
   // seed-builder/components/BranchEditor.tsx — temporary shim until sprint 09
   // keeps the existing SeedEditorDialog working while the row lives in the fields slice
   ```
   (Simplest: keep `BranchEditor` rendering its own list but each row is now
   `<BranchItemRow/>` imported from the fields slice barrel.)

> **Reserved-alias + slug rules** already exist in `BranchRow`
> (`^[a-z0-9_]+$`, `AUTOMATION_RESERVED`). Preserve them — they mirror the server check.

## 7. Register the type — `fields/registry.ts`

```ts
import { FieldEditRepeater } from "./edit/repeater"
// …
fieldRegistry.registerEdit("repeater", FieldEditRepeater)
// Display side: a repeater rarely shows in tables; register a compact summary
// (e.g. "N items") or fall through to DefaultDisplay. A dedicated RepeaterDisplay
// is only needed once repeater is a real content field (SPRINT 10).
```

`getEditComponent("repeater")` now returns `FieldEditRepeater`. Because
`BranchType` in `@beechcms/core` does **not** yet include `"repeater"`, cast at the single
registration call site, or widen the registry key to `string` for non-core types — pick
the lighter touch and comment it:

```ts
// 'repeater' is a dashboard-only field type until sprint 10 promotes it to a core
// BranchType. Registering by string keeps @beechcms/core untouched for now.
fieldRegistry.registerEdit("repeater" as BranchType, FieldEditRepeater)
```

## 8. i18n

Add a `fields.repeater.*` group to **both** `it.json` and `en.json`: `addItem`,
`removeItem`, `moveUp`, `moveDown`, `emptyState`, plus reuse existing
`seedBuilder.branchEditor.*` / `seedBuilder.fieldTypes.*` / `seedBuilder.policies.*` keys
for the branch-item row (move them to a shared namespace if the row no longer lives under
`seed-builder`, or keep the keys and reference them — be consistent).

## 9. Tests

Testing Library + vitest:
- `repeater.test.tsx`: given a branch with `repeater.itemKind:'branch'` and a 2-item
  value, renders 2 rows; "add" appends a `br_new_*` branch via `onChange`; "remove"
  drops one; move-up/down reorders the array passed to `onChange`.
- Branch-item row: editing `label` calls `onChange` with the updated branch; for an
  `isExisting` row (`id` not `br_new_*`) the `alias`/`type` inputs are read-only.
- Registry: `getEditComponent('repeater')` returns `FieldEditRepeater`.
- Regression: the existing `SeedEditorDialog` + `BranchEditor` flow still works (it now
  renders `BranchItemRow` internally).

## 10. Acceptance criteria

- [ ] `repeater` registered in the field registry; `getEditComponent('repeater')` resolves.
- [ ] `FieldEditRepeater` renders a list with add/remove/reorder, driven by `value`/`onChange`.
- [ ] Branch-item body reuses the existing `BranchRow` logic (alias/type/label +
      type-conditional sub-forms + policies), promoted into the `fields` slice as
      `BranchItemRow`; `seed-builder` consumes it via the barrel, no internal import.
- [ ] No change to `@beechcms/core` (no DDL/validation/serialization).
- [ ] Generic-item path is scaffolded behind `// SPRINT 10` guards and is inert.
- [ ] `npm run lint`, `npm run build`, `npm run test` pass in `apps/dashboard`.

## 11. Do NOT

- Do **not** add `'repeater'` to `BranchType` in `@beechcms/core` or touch `engine.ts` /
  `validation.ts` — that is sprint 10.
- Do **not** wire the Seed editor here — that is sprint 09. This sprint only makes the
  renderer exist and be registered.
- Do **not** implement the generic sub-field item body now — leave it stubbed/commented.
- Do **not** duplicate the BranchEditor row logic; move it once and re-use it.
