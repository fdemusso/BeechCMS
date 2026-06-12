# Dashboard Composer — Sprint 05: Builder UI (drag-and-drop, admin-only)

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 03](./03-widget-registry-and-renderer.md) (registry +
renderer) and [Sprint 04](./04-builtin-widgets.md) (the catalog worth
arranging). Backend is already complete (Sprint 02) — this sprint is **frontend
only** and ships the visual composer.

The direct precedent is the **entry-editor Layout Builder**
(`apps/dashboard/src/features/entry-editor/builder/`) — same dialog shell, same
dnd-kit approach, same Save/Reset/Preview triad. Reuse its patterns
aggressively; where this spec is silent, do what that builder does.

---

## 0. ROLE & GROUND RULES

You are a senior React/TypeScript engineer working on the **Beech CMS monorepo**.

1. **VSA:** everything under `apps/dashboard/src/features/dashboard/builder/`.
   Cross-feature reuse only via `index.ts` barrels; if you need the
   entry-editor's `ConfirmDialog`, **promote it** to `src/components/ui/` rather
   than deep-importing across features.
2. **`@dnd-kit/core` + `@dnd-kit/sortable`** (installed). No other DnD lib.
3. **Standard Shadcn look.** Real `<Dialog>`, no glassmorphism, no premium
   floating styling (same rule as the entry-editor builder).
4. **RBAC:** gate with `canEditDashboard(user.role)` from `@beechcms/core`;
   `user.role` comes from `useAuth()` (`@/lib/auth-context`).
5. **i18n** for every string.
6. **Docs are English.**

---

## 1. WHAT THIS SPRINT BUILDS

1. **"Customize" button** on the dashboard page (admin-only) opening the
   builder dialog.
2. **Builder dialog** (full-screen) with:
   - **page manager** — tab strip: add / rename / delete / reorder pages
   - **section list** — sortable; per-section controls (label, hide label,
     collapsible, column preset)
   - **column presets** — `[12]`, `[6,6]`, `[8,4]`, `[4,8]`, `[4,4,4]`,
     `[3,3,3,3]`
   - **widget drag-and-drop** — reorder within a column, move across
     columns/sections/pages (cross-page via cut-paste affordance, not drag)
   - **widget picker** — categorized catalog from `listWidgetDefinitions()`
   - **widget config panel** — the definition's `ConfigPanel`, plus shared
     fields (title override, remove)
   - **unavailable-widget badge** for unknown types (delete is the only action)
3. **Save / Reset / Preview**:
   - Save → `PUT /api/dashboard-layout`; surface server `warnings` as toast
   - Reset → confirm dialog → `DELETE /api/dashboard-layout`
   - Preview → renders the draft through the real Sprint 03 renderer
4. **Config panels for every built-in widget** from Sprints 03–04.

Out of scope: role scopes (Sprint 06 adds the scope switcher to this dialog).

---

## 2. CURRENT STATE (verbatim reference)

### 2.1 The template builder — `features/entry-editor/builder/`

| File | What to copy |
|---|---|
| `layout-builder-dialog.tsx` | dialog shell, dirty-state guard on close, footer with Save/Reset/Preview |
| `use-layout-builder.ts` | reducer-style draft state + action creators + dnd-kit `onDragEnd` routing; ids as dnd-kit `id`s |
| `builder-pane.tsx`, `section-card.tsx`, `column-card.tsx` | sortable card composition, drop indicators |
| `confirm-dialog.tsx` | destructive-action confirm (promote to `src/components/ui/confirm-dialog.tsx` and re-export from the old path or update both callers) |
| `api/layout.api.ts` | mutation wrappers + query invalidation pattern |

### 2.2 Hooks/state available

- `useDashboardLayout()` (Sprint 03) — `layout`, `isStored`.
- Query key to invalidate after Save/Reset: `['dashboard-layout']`.
- `knownWidgetTypes()` + `validateDashboardLayout(draft, { seedSlugs, knownWidgetTypes })`
  give client-side pre-validation — run it before `PUT` and render errors
  inline (same UX as the entry-editor builder's pre-submit warnings).
- `useSchema()` for seed slugs (seed pickers in config panels).

### 2.3 Where the button goes

`features/dashboard/pages/dashboard-page.tsx` — header area next to the
greeting. Hidden entirely (not disabled) for non-admins, mirroring the
entry-editor "Edit Layout" button.

---

## 3. BUILDER STATE MODEL

`features/dashboard/builder/use-dashboard-builder.ts`:

- Draft = deep-cloned `DashboardLayout` (`structuredClone`), held in a
  `useReducer`. Never mutate the query cache.
- Actions (exhaustive list — implement all):
  `addPage`, `renamePage`, `removePage` (guard: ≥1 page), `movePage`,
  `addSection`, `updateSection` (label/flags), `removeSection`, `moveSection`,
  `setColumnPreset` (see widget-overflow rule below), `addWidget` (from picker,
  with `defaultConfig`), `updateWidgetConfig`, `updateWidgetTitle`,
  `moveWidget` (within/between columns), `removeWidget`, `replaceWidget`
  (swap type, keep position; config resets to the new type's default),
  `reset` (reload from props).
- **Column-preset shrink rule:** when a preset reduces the column count,
  widgets from removed columns append to the last surviving column (never drop
  silently).
- `isDirty` = deep-compare draft vs source (or action-count heuristic — match
  whatever `use-layout-builder.ts` does).
- New ids via `crypto.randomUUID()`.

DnD wiring: one `DndContext` per page view; `SortableContext` per
sections-list and per column (widgets). Section drag handle on the card
header; widget drag handle on the widget chip. Builder renders **widget chips**
(icon + label + seed badge), not live widgets — live rendering belongs to
Preview. This keeps DnD cheap and avoids fetching data for every config tweak.

---

## 4. WIDGET PICKER & CONFIG PANELS

### 4.1 Picker — `builder/widget-picker-dialog.tsx`

Grid of cards grouped by `category` (`stats`, `charts`, `content`, `system`,
`custom`), each showing icon + label + description from the definition.
Selecting a widget calls `addWidget(target, type)`.

### 4.2 Config panels

Each built-in `WidgetDefinition` gains a `ConfigPanel` (Sprint 03 left them
absent). Shared field primitives in `builder/config-fields.tsx`:

- `SeedSelect` (from `useSchema()`)
- `BranchAliasSelect` (branches of the selected seed, filtered by a predicate
  prop — e.g. numeric-only for `sum/avg` formula columns)
- `WindowSelect` (`week/month/year/all`)
- `FormulaEditor` (op select + conditional column/value inputs for
  `AggregateFormula`)
- text/number/switch wrappers over Shadcn inputs

Panels per widget (≤ ~40 lines each, composed from primitives):
`core/stat` (preset-vs-formula toggle), the three timeseries charts (shared
panel), `core/pie-chart`, `core/data-table` (multi-select of branch aliases),
`core/text` (textarea), `core/recent-content` / `core/pending-drafts` /
`core/media-gallery` / `core/activity-feed` (SeedSelect + variant),
remaining system widgets (variant only or "no options").

Selecting a widget chip opens the panel in a right-hand sheet within the
dialog; changes dispatch `updateWidgetConfig` live (draft only).

---

## 5. SAVE / RESET / PREVIEW

- **Save:** client pre-validate → on errors, inline list and abort; on ok,
  `PUT` cleaned draft; on 200, toast success (+ each server `warning` as an
  info toast), invalidate `['dashboard-layout']`, close.
- **Reset:** `ConfirmDialog` ("revert to the generated default — stored layout
  is deleted") → `DELETE` → invalidate → close.
- **Preview:** toggle inside the dialog swapping the editing pane for
  `<DashboardLayoutRenderer layout={draft} />`. Real data, real widgets —
  the renderer is already pure w.r.t. its `layout` prop.
- **Close with dirty draft:** ConfirmDialog discard guard (copy the
  entry-editor behavior).

---

## 6. FILES TO TOUCH (checklist)

New (`features/dashboard/builder/`):
- `dashboard-builder-dialog.tsx`
- `use-dashboard-builder.ts`
- `builder-pane.tsx`, `page-tabs-manager.tsx`, `section-card.tsx`,
  `column-stack.tsx`, `widget-chip.tsx`
- `widget-picker-dialog.tsx`
- `widget-config-sheet.tsx`, `config-fields.tsx`
- `api/dashboard-layout.api.ts` (PUT/DELETE mutations)
- tests: `src/test/dashboard/builder/use-dashboard-builder.test.ts` (reducer —
  every action incl. shrink rule), `dashboard-builder-dialog.test.tsx` (RBAC,
  save flow with mocked API)

Modified:
- `features/dashboard/pages/dashboard-page.tsx` — Customize button
- `features/dashboard/registry/builtin-widgets.tsx` — attach `ConfigPanel`s
- `features/dashboard/index.ts`
- `src/components/ui/confirm-dialog.tsx` (promoted) + entry-editor import update
- locale files — `dashboard.builder.*`
- `docs/frontend-guide.md` — builder section

---

## 7. ACCEPTANCE

1. Build, lint, tests green in `apps/dashboard`.
2. Editor-role user: no Customize button; direct `PUT` still impossible (403,
   already covered by API tests).
3. Full manual loop on `npm run dev:full`: open builder → add page → add
   section `[8,4]` → add `core/line-chart` + configure seed → drag it to the
   other column → preview shows live chart → save → reload page → layout
   persists → reset → default returns.
4. Reducer tests cover: page CRUD + reorder, section move, column shrink
   keeps widgets, widget move across sections, replaceWidget resets config,
   remove guards (last page undeletable).
5. Unknown-type chip shows the unavailable badge and survives a save
   (pass-through per D3) unless explicitly removed.
6. Pre-validation blocks duplicate-free invariants client-side (e.g. span sum)
   with inline messages — server 422 is the backstop, not the UX.
7. No console errors during DnD; keyboard sensors enabled (dnd-kit
   `KeyboardSensor`) as in the entry-editor builder.

---

## 8. OPEN QUESTIONS (defaults inline)

- **Cross-page widget move via drag?** Dragging across a tab switch is fiddly.
  *Default: per-widget "Move to page…" menu action; drag stays within a page.*
- **Section duplicate action?** *Default: yes if ≤15 lines in the reducer
  (clone with fresh ids); otherwise skip.*
- **Sidebar entries per dashboard page?** Deferred from Sprint 03. *Default:
  still out of scope; file a follow-up.*
