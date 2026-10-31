# Sprint 3 — DashboardTabAudienceUi

Roadmap: `output/backlog/ROADMAP.md` (entry 3 of 9). Feature brief: `stages/00_ideation/output/feature_brief.md`
§2 rules 4–7, 13, 15, §3 user stories 4, 6, 7, 8, 9, 10, §4 "Stato intermedio e coerenza", "Rimozione del legacy"
(dashboard bullet), "Criteri di accettazione trasversali".
Previous sprints: `docs/Sprints/DashboardDataScopeClosure/` (`30473871`) and `docs/Sprints/DashboardTabAudienceApi/`
(`b64a39d9`). Both review PASS.

### Pre-Computation Analysis

I refreshed the graph with `graphify update . --force` (28 829 nodes, 41 393 edges) before running any query.

**a) God nodes identified via the CLI**

| Node | Source | Why it matters here |
|---|---|---|
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L62` | Degree 50. The dashboard's single source of UI visibility truth. It rehydrates `GET /api/settings/me` and delegates to core `hasPermission`. `canGlobally` (`L71`) is exactly `hasPermission(effective, p, GLOBAL_SCOPE)`, so the new edit gate consumes it. |
| `filterDashboardLayoutForViewer()` | `packages/core/src/dashboard-layout/dashboard-layout-audience.ts:L32` | Server-side only (`refuseIfLocked`, the GET). The UI never re-runs it: the payload is already projected, and the builder of a `manage_roles@*` holder receives every tab with `roles` intact. |
| `useDashboardBuilder()` | `apps/dashboard/src/features/dashboard/builder/use-dashboard-builder.ts:L111` | Degree 11. Every draft mutation goes through it. The new `setPageRoles` op lands here. |
| `DashboardLayoutRenderer()` | `apps/dashboard/src/features/dashboard/renderer/dashboard-layout-renderer.tsx:L19` | Consumers: `dashboard-page.tsx`, `builder-pane.tsx` (preview, `L163`), two unit tests, and the slice barrel. Owns the `pages: []` branch (`L35-36`). |
| `canEditDashboard()` | `packages/core/src/dashboard-layout/dashboard-permissions.ts:L9` | Degree 3. Its only callers are `DashboardPage()` and the core test. It is the last JWT-`role` reader on the dashboard surface. |

**b) Architectural boundaries affected**

- `@beechcms/core`: deletion only. `dashboard-layout/dashboard-permissions.ts` goes, along with its barrel line `index.ts:L90` and its test describe. Nothing is added.
- `apps/api`: **no change.** The sprint consumes the shipped contract as-is:
  - `GET /api/dashboard-layout`, filtered and `no-store`;
  - `GET /api/dashboard-layout/roles` → `Array<{ id; name; icon: string | null }>`, gated `manage_roles@*`;
  - PUT/DELETE gated `manage_roles@*`, with 422 on an unknown role id.
- `apps/dashboard`, inside `features/dashboard/` only:
  - page: the edit gate;
  - hook: layout freshness;
  - renderer: the empty state;
  - builder: a roles API call, a roles query hook, a `setPageRoles` op, a new `PageAudiencePicker` component, wiring in `builder-pane.tsx`, and a role-aware pre-save validation in `dashboard-builder-dialog.tsx`;
  - `locales/{en,it}.json`.
- `apps/dashboard/src/features/shared/`: read-only consumer (`usePermissions`). No edit.

**c) `graphify affected` impact analysis**

```
graphify affected "canEditDashboard()" --depth 2        → DashboardPage(), dashboard-layout.test.ts
graphify affected "useDashboardLayout()" --depth 2      → dashboard-page.tsx, DashboardPage(), use-dashboard-layout.test.ts, index.ts [re_exports]
graphify affected "DashboardLayoutRenderer()" --depth 2 → builder-pane.tsx, dashboard-page.tsx, builtin-widget-config-fallback.test.tsx,
                                                          dashboard-layout-renderer.test.tsx, index.ts [re_exports]
graphify affected "PageTabsManager()" --depth 2         → builder-pane.tsx, page-tabs-manager.test.tsx
graphify affected "useDashboardBuilder()" --depth 2     → builder-pane.tsx, BuilderPaneProps, dashboard-builder-dialog.tsx, BuilderPaneController(),
                                                          builder/index.ts, empty-column-drop.test.tsx, use-dashboard-builder.test.ts
graphify affected "dashboardBuilderApi" --depth 2       → dashboard-builder-dialog.tsx, builder/index.ts, index.ts, builder-pane.test.tsx,
                                                          dashboard-builder-dialog.test.tsx, section-card.test.tsx, use-dashboard-builder.test.ts
graphify explain  "usePermissions()"                    → degree 50, apps/dashboard/src/features/shared/hooks/use-permissions.ts:L62
graphify path "DashboardPage()" "usePermissions()"      → only via app-sidebar.tsx (no direct edge yet; the new import is shared → slice, legal)
graphify path "BuilderPane()" "useRbacRoles()"          → only via the shared components/ui/button.tsx (no dashboard → rbac edge; must stay so)
```

Grep cross-check. The AST graph under-reports cross-package `@beechcms/core` imports.
- `canEditDashboard` / `ROLES_ALLOWED_TO_EDIT_DASHBOARD` source consumers: `dashboard-page.tsx:L8,L22` and `dashboard-layout.test.ts:L19-22,L463-475`. Nothing else outside `docs/`.
- `docs/api/**` is generated. `docs/reference/dashboard-layout.md` is ROADMAP entry 9.

Breaking-change verdict:
- Deleting `canEditDashboard` and `ROLES_ALLOWED_TO_EDIT_DASHBOARD` from the core barrel breaks only the two consumers above, and both are edited here.
- `useDashboardBuilder` gains a member (additive). `PageTabsManagerProps` is unchanged.
- The `DashboardLayoutRenderer` props are unchanged. Only the `pages: []` output changes, from `null` to the empty state.
- `builder-pane.test.tsx:L13-21` still mocks the removed `scopes` / `:scope` RPC shape. It passes today only because the builder query errors and falls back to the default, so it must be corrected when the builder starts reading `roles`.
- No API, migration or flow suite is affected.

### VETO Audit

1. **YAGNI.**
   - One new component (`PageAudiencePicker`), one new hook (`useLayoutRoles`), one new builder op (`setPageRoles`), one new API call (`getRoles`), and one empty-state branch. No new shared primitive and no new query-key family in `features/shared`.
   - The roles query is builder-only, so its key stays local, like `['dashboard-builder-layout']` (`dashboard-builder-dialog.tsx:L37`).
   - The "first visible tab" fallback already exists (`dashboard-layout-renderer.tsx:L22`) and is already tested (`dashboard-layout-renderer.test.tsx:L93`). The server filter makes `pages[0]` the first *visible* tab, so the sprint writes no code for it.
   - The "legacy layout rows in the protected-routes table" were already replaced by sprint 2 (`permission.middleware.ts:L99-106`). There is nothing left to remove.
   - Layout freshness is one query option, not an invalidation fan-out across slices.
2. **Botanical invariant.**
   - No D1, SQL or handler change.
   - A widget's seed reference stays core's opaque `config.seedSlug`.
   - Role data reaches the UI only through `GET /api/dashboard-layout/roles`, and only as `{ id, name, icon }`.
3. **VSA.**
   - Every edit is inside `apps/dashboard/src/features/dashboard/`, plus the locales.
   - The slice imports from `@/features/shared/hooks/use-permissions` (shared, the same import as `content-list.tsx:L10`), `@/lib/icon-registry` (`resolveIcon`, lib-level) and `@/components/ui/*`.
   - It imports nothing from `features/rbac`: no `RoleBadge`, no `useRbacRoles`, no `rbacApi` (brief "Confini invalicabili").
   - Tests stay in `features/dashboard/test/unit/` and `packages/core/src/dashboard-layout/`.
4. **Core as the authorization source.**
   - The edit gate is `usePermissions().canGlobally('manage_roles')`, which is core `hasPermission(…, 'manage_roles', '*')`. It mirrors the `perm('manage_roles','global')` route rows exactly.
   - The pre-save role check calls core `validateDashboardLayout` with `roleIds`, the same function and context the server's PUT uses (sprint 2 T4 step 1). Its error string is core's.
   - The UI re-implements no audience or seed rule. It renders what the server projected.
5. **Cloudflare purity.** One extra GET (`/roles`) per builder open. The layout GET now runs on each dashboard mount and window focus, not once per 5 minutes. It is one indexed read, and the server already marks it `no-store`.
6. **Fail-closed.**
   - While `me` loads, `canGlobally` is false, so the edit button stays hidden (`NO_AUTHORITY`, `use-permissions.ts:L17`).
   - An id the roles list does not contain is shown as "deleted role", never silently dropped (rule 12/13). The client refuses to save it, and the server would 422 anyway.
   - Orphan detection runs only once the roles list has resolved. A loading or failed list never marks an id orphan and never enables edits on it.
   - A stored layout filtered to `pages: []` renders the empty state, never the generated default. Falling back to the default would show widgets the stored layout chose not to show this caller.

No violation found. Plan unchanged.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 2 shipped the server contract: one `default` layout, tabs carrying role ids, a per-caller projection, a `manage_roles@*` write gate and a roles endpoint. The dashboard still has three gaps:
- It decides who may edit from the legacy JWT `role` (`dashboard-page.tsx:L22`, `canEditDashboard(user?.role)`). A legacy admin without `manage_roles@*` sees "Customize" and gets a 403 on save, while a real `manage_roles@*` holder who is not a legacy admin never sees the button (sprint 2 review, "Known limitations").
- It has no way to set or see a tab's audience, so rule 4 cannot be authored from the product.
- It renders `null` for a caller whose filtered layout is empty (sprint 2 T6 interim) and caches the projection for the global 5-minute `staleTime` (`lib/query-client.ts:L10`). An assignment change therefore stays invisible until the cache expires (brief §4 "Le assegnazioni cambiano in sessione").

This sprint must land before:
- ROADMAP entry 4 (`requires`), which filters the renderer and the builder palette that this sprint puts on the tab model;
- entry 6, which adds structural-vs-content controls on top of this builder and its `manage_roles@*` gate.

VSA: all product code stays in `features/dashboard/`. Authorization comes from the shared `usePermissions` (core evaluator) and the server projection, never from the `rbac` slice. Botanical: the sprint touches no data path at all.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Server contract consumed (unchanged, `b64a39d9`).**
- Route rows: `permission.middleware.ts:L99-106`.
- `GET /api/dashboard-layout` → `{ layout: DashboardLayout | null }`.
  - For a `manage_roles@*` caller, every tab keeps its `roles` and only widgets on unreadable seeds are removed.
  - For any other caller, tabs outside the audience are dropped, emptied sections and tabs are pruned, `roles` is omitted, and `pages: []` is possible.
- `GET /api/dashboard-layout/roles` → `Array<{ id: string; name: string; icon: string | null }>`, ordered by name. Gate `manage_roles@*`.
- `PUT /` → 422 `invalid-layout` on an unknown role id. Detail: ``Page '<slug>': unknown role id '<id>'.`` Also 409 `layout-locked` (interim).
- `DELETE /` → 409 `layout-locked` (interim). Gate `manage_roles@*`.

**Core contract** (`packages/core/src/dashboard-layout/dashboard-layout.ts`):
- `DashboardPageLayout.roles?: string[]`.
- `MAX_ROLES_PER_PAGE = 32`.
- `DashboardLayoutContext.roleIds?: ReadonlySet<string>`. When present, `validateDashboardLayout` errors on unknown ids and never strips them.

**Dashboard slice today:**

| File | Line | Fact |
|---|---|---|
| `pages/dashboard-page.tsx` | `L8`, `L19`, `L22` | Imports `canEditDashboard`. `useAuth()` provides `user`; `user?.role` feeds the gate. `user?.name` (`L31`) is the greeting. |
| `pages/dashboard-page.tsx` | `L60-65`, `L74-76` | The "Customize" button and the `DashboardBuilderDialog` mount, both behind `canEdit`. |
| `hooks/use-dashboard-layout.ts` | `L23-26` | `useQuery({ queryKey: DASHBOARD_QUERY_KEYS.layout(), queryFn })`. It inherits the global `staleTime: 5 * 60 * 1000` (`lib/query-client.ts:L10`). |
| `hooks/use-dashboard-layout.ts` | `L33-36` | `stored ?? generatedDefault`. A stored `{ pages: [] }` is not null, so it is served as-is. This invariant must be kept. |
| `renderer/dashboard-layout-renderer.tsx` | `L22` | `find(slug) ?? pages[0]`. This is the existing first-visible-tab fallback. |
| `renderer/dashboard-layout-renderer.tsx` | `L35-36` | `if (!activePage) return null` (the sprint 2 interim). |
| `builder/dashboard-builder-dialog.tsx` | `L36-42` | One builder query, `['dashboard-builder-layout']`. |
| `builder/dashboard-builder-dialog.tsx` | `L80-86` | `handleSave` runs `validateDashboardLayout(ops.draft, { seedSlugs, knownWidgetTypes })` with no `roleIds`, and toasts `errors[0]`. |
| `builder/builder-pane.tsx` | `L152-160` | `PageTabsManager` inside the page `SortableContext`. |
| `builder/builder-pane.tsx` | `L162-163` | Preview branch: renders `DashboardLayoutRenderer` with `{ version: 1, pages: [activePage] }`. |
| `builder/use-dashboard-builder.ts` | `L132-134` | The `renamePage` pattern (`mutate` + map by id). |
| `builder/use-dashboard-builder.ts` | `L26-75`, `L413` | The result interface and the returned object. |
| `builder/api/dashboard-layout.api.ts` | `L9-24` | `getLayout` / `saveLayout` / `resetLayout` via `rpc.api['dashboard-layout']`. |

**Shared visibility source.**
- `usePermissions()` (`features/shared/hooks/use-permissions.ts:L62-77`) exposes `can`, `canAnywhere` and `canGlobally`, all delegating to core.
- It reads `useMe()` (`ME_QUERY_KEY = ["settings","profile"]`, `staleTime` 5 min).
- The rbac slice already invalidates `ME_QUERY_KEY` after assignment create/delete (`features/rbac/hooks/use-rbac.ts:L52-75`).
- `/api/settings/me` carries `permissions` but no role ids (`settings.handler.ts:L207-230`). The client therefore cannot detect a change to a zero-permission role assignment. The layout must instead be re-fetched from the server, which recomputes the projection on every request.

**Reusable UI pieces** (no cross-slice import needed):
- `resolveIcon(name?)` in `@/lib/icon-registry` (`L85`) falls back to `Folder`. The rbac slice's convention for a null role icon is `"Users"` (`features/rbac/components/role-badge.tsx:L26`). Copy the convention, not the component.
- The Popover + Command multi-select pattern: `components/fields/edit/relation/relation-multi.tsx:L322-375` (toggle-on-select with a `Check` mark).
- The empty-state visual pattern: `features/automations/components/automation-panel/automation-empty-state.tsx:L20-27` (muted round icon, `font-heading` title, muted description).

**Locales.** `dashboard` keys: `greeting`, `recentActivity`, `contentPulse`, `widgets`, `widgetRegistry`, `setupChecklist`, `builder`. There is no `dashboard.empty` and no `dashboard.builder.audience`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Core:
1. `packages/core/src/dashboard-layout/dashboard-permissions.ts`: DELETE (T1).
2. `packages/core/src/index.ts`: EDIT (T1). Removes the `dashboard-permissions.js` line (`L90`).

Dashboard (`apps/dashboard/src/features/dashboard/`):
3. `pages/dashboard-page.tsx`: EDIT (T2). RBAC edit gate.
4. `hooks/use-dashboard-layout.ts`: EDIT (T3). Freshness.
5. `renderer/dashboard-layout-renderer.tsx`: EDIT (T4). Empty state.
6. `builder/api/dashboard-layout.api.ts`: EDIT (T5). Adds `getRoles`.
7. `builder/use-layout-roles.ts`: NEW (T5).
8. `builder/use-dashboard-builder.ts`: EDIT (T6). Adds `setPageRoles`.
9. `builder/page-audience-picker.tsx`: NEW (T7).
10. `builder/builder-pane.tsx`: EDIT (T7). Mounts the picker.
11. `builder/dashboard-builder-dialog.tsx`: EDIT (T8). Role-aware pre-save validation.
12. `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`: EDIT (T9).

Tests (T10):
13. `packages/core/src/dashboard-layout/dashboard-layout.test.ts`: EDIT. Drops the `canEditDashboard` describe and its import.
14. `features/dashboard/test/unit/dashboard-page.test.tsx`: NEW.
15. `features/dashboard/test/unit/page-audience-picker.test.tsx`: NEW.
16. EDIT:
    - `use-dashboard-layout.test.ts`
    - `dashboard-layout-renderer.test.tsx`
    - `use-dashboard-builder.test.ts`
    - `dashboard-builder-dialog.test.tsx`
    - `builder-pane.test.tsx`

No API change, no migration, no `docs/` edit (entry 9). Do not hand-edit generated `docs/api/**`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Delete the JWT-role edit check from core

- Delete `packages/core/src/dashboard-layout/dashboard-permissions.ts`. It exports `ROLES_ALLOWED_TO_EDIT_DASHBOARD` and `canEditDashboard`.
- `packages/core/src/index.ts:L90`: delete `export * from './dashboard-layout/dashboard-permissions.js'`.
- Why delete instead of rewriting it on RBAC: the dashboard already has the core-backed `canGlobally`, and a second named wrapper would be a parallel authorization helper (brief "Nessuna logica di autorizzazione viene reimplementata nella UI").
- Do **not** touch `dashboard-layout/layout-permissions.ts` (`canEditLayout`, the entry-editor gate, brief §5).

### T2 — RBAC edit gate (`pages/dashboard-page.tsx`)

- Remove the `canEditDashboard` import (`L8`).
- Import `usePermissions` from `"@/features/shared/hooks/use-permissions"`. That direct path is the idiom (`pages/content-list.tsx:L10`), and every existing test mocks it.
- `canEdit` becomes `usePermissions().canGlobally("manage_roles")`.
- Add a one-line comment above it: the gate mirrors the `perm('manage_roles','global')` rows on `PUT`/`DELETE /api/dashboard-layout`, and the server stays the enforcement point.
- `useAuth()` stays, for `user?.name` only. `user?.role` is no longer read anywhere in `features/dashboard/`.
- Rules:
  - While `me` is loading, `canGlobally` is false (zero-trust default), so the button and the dialog stay unmounted.
  - A seed-scoped `manage_roles` never shows the button (core asymmetry).
  - A legacy `role: 'admin'` JWT with no `manage_roles@*` never shows it.

### T3 — Layout freshness (`hooks/use-dashboard-layout.ts`)

- In the `useQuery` call (`L23-26`), add `staleTime: 0`. Put a one-line comment above it: the payload is a per-caller authorization projection served `no-store`, and the global 5-minute cache would outlive an assignment change.
- Why this and not an invalidation hook:
  - `/me` carries no role ids, so the client cannot observe a change to a zero-permission role assignment.
  - Another administrator can change the caller's assignments, and nothing in this browser would fire.
  - With `staleTime: 0`, TanStack re-fetches on every mount of the dashboard and on window focus (`refetchOnWindowFocus` default). The server recomputes the filter on every request (brief §4).
  - The rbac slice's existing `ME_QUERY_KEY` invalidation (`use-rbac.ts:L52-75`) keeps the edit button current, because `usePermissions` reads `me`. No change there.
- Keep `stored ?? generatedDefault` exactly. A stored layout with `pages: []` is returned as-is, never replaced by the generated default.
- `UseDashboardLayoutResult` is unchanged.

### T4 — Empty state (`renderer/dashboard-layout-renderer.tsx`)

- Replace `if (!activePage) return null` (`L35-36`) with an explicit empty state. Hooks stay above the branch, as today.
- Markup follows `automation-empty-state.tsx:L20-27`:
  - a muted round icon: `Category as LayoutDashboard` from `@/components/icons` (the alias already used in `features/navigation`);
  - the title `t("dashboard.empty.title")`;
  - the description `t("dashboard.empty.description")`.
  - No button.
- The renderer gains `useTranslation()`. Its props are unchanged.
- Rules:
  - The empty state renders only when `layout.pages.length === 0`.
  - A page with zero sections (possible in the builder preview) still renders the page with no sections, as today.
  - The copy never says that hidden tabs exist. It states that nothing is available for the caller.
- Update the docblock (`L16-18`): an invalid, absent or *hidden* `?page=` slug falls back to the first served page, which is the first page the caller may see. The URL is not rewritten.

### T5 — Roles source for the builder

**`builder/api/dashboard-layout.api.ts`**: add `getRoles`, in the same shape as `getLayout` (`L11-14`):
- it calls `rpc.api["dashboard-layout"].roles.$get()` and returns `response.json()`;
- docblock: "Every role as `{ id, name, icon }`, ordered by name. Needs `manage_roles@*`."
- The response type is inferred from the route. Do not hand-write a DTO (file comment `L8`).

**`builder/use-layout-roles.ts`** (NEW). SPDX header as in `use-dashboard-builder.ts:L1-3`. Exports, verbatim:

```ts
/** One role as `GET /api/dashboard-layout/roles` serves it. Inferred from the route. */
export type LayoutRole = InferResponseType<typeof rpc.api["dashboard-layout"]["roles"]["$get"]>[number]

export const LAYOUT_ROLES_QUERY_KEY = ["dashboard-builder-roles"] as const

/** The role list the builder targets tabs with. Builder-only: mounted inside the open dialog. */
export function useLayoutRoles(): UseQueryResult<LayoutRole[]>
```

- `InferResponseType` comes from `"hono/client"`, the same idiom as `features/shared/hooks/use-me.ts:L6,L18`.
- `queryFn` is `dashboardBuilderApi.getRoles`. Set `staleTime: 0`: a role created or deleted in another tab must be seen when the builder opens, because the pre-save check (T8) relies on this list.
- `retry` stays at the default.
- Callers are the picker (T7) and the dialog controller (T8). They share one cache entry, deduplicated by TanStack.

### T6 — Builder op (`builder/use-dashboard-builder.ts`)

Add to `UseDashboardBuilderResult`, after `movePage` (`L35`), verbatim:

```ts
  /** Replaces the page's target role ids. An empty list removes the `roles` key: the tab is visible to every caller. */
  setPageRoles(pageId: string, roleIds: string[]): void
```

- Implement it with `useCallback` + `mutate`, copying the shape of `renamePage` (`L132-134`). Add it to the returned object (`L413`), next to `renamePage`.
- Rules:
  - Only the page with `pageId` changes.
  - Order is preserved as given, and duplicates are removed (first occurrence wins).
  - `roleIds.length === 0` deletes the `roles` key instead of writing `[]`. A cleared audience then round-trips to the same JSON as a never-targeted page, and `isDirty` stays accurate.
  - An unknown `pageId` is a no-op.
  - The op never validates ids against the role list. That is the save-time check (T8). An orphan must stay in the draft until the author removes it (rule 13).
- `makePage` (`L101-109`) is unchanged: a new page has no `roles` (visible to all).

### T7 — Audience picker (`builder/page-audience-picker.tsx`, NEW; `builder/builder-pane.tsx`, EDIT)

Props, verbatim:

```ts
export interface PageAudiencePickerProps {
  /** The active page's target role ids (`page.roles ?? []`). */
  readonly roleIds: readonly string[]
  /** Receives the full next list; the caller forwards it to `setPageRoles`. */
  readonly onChange: (roleIds: string[]) => void
}

export function PageAudiencePicker({ roleIds, onChange }: PageAudiencePickerProps): React.JSX.Element
```

Data: `useLayoutRoles()` (T5). Resolve each id against `roles` by `id`, never by name.

Layout, in one row:
- the label `t("dashboard.builder.audience.label")`;
- then the chips;
- then the add trigger.

The chips:
- **No ids:** a muted text `t("dashboard.builder.audience.everyone")`.
- **Known id:**
  - a chip with the role icon and name;
  - the icon is `resolveIcon(role.icon ?? "Users")`, copying the convention at `role-badge.tsx:L26`, not the component;
  - a remove button whose `aria-label` is `t("dashboard.builder.audience.remove", { name })`.
- **Orphan id:**
  - an orphan is an id absent from a *successfully loaded* list;
  - the chip has destructive styling and the text `t("dashboard.builder.audience.deletedRole")`;
  - it has the same remove button, with `name` = the deleted-role label;
  - the raw id is never displayed.
- **Loading list:** chips render as one muted skeleton (`@/components/ui/skeleton`) and the trigger is disabled. No id is marked orphan.
- **Failed list:**
  - show the muted text `t("dashboard.builder.audience.loadError")`;
  - the trigger is disabled;
  - existing ids are not rendered as orphans and stay in the draft untouched.

The add trigger:
- It is a `Popover` + `Command`, copying `relation-multi.tsx:L322-375` (`CommandInput` filter by name, `CommandEmpty` = `t("dashboard.builder.audience.empty")`, one `CommandItem` per role with a `Check` when selected). The trigger is an outline button labelled `t("dashboard.builder.audience.add")`.
- Selecting a role toggles it:
  - unselected → `onChange([...roleIds, id])`;
  - selected → `onChange(roleIds without id)`.
- The popover stays open for multiple picks.
- When `roleIds.length >= MAX_ROLES_PER_PAGE` (import the constant from `@beechcms/core`), unselected items are disabled.

**`builder-pane.tsx` wiring:**
- Render `<PageAudiencePicker roleIds={activePage.roles ?? []} onChange={(ids) => ops.setPageRoles(activePage.id, ids)} />` directly below the page `SortableContext` (after `L160`).
- Render it only when `!showPreview && activePage`. Preview shows the page as readers see it.
- Why outside `PageTabPill`: the pill is a dnd-kit sortable `role="button"` that already nests a dropdown (`page-tabs-manager.tsx:L123-126`). A popover with a text input inside it would fight the drag listeners and keyboard handlers.
- `PageTabsManager` is not edited.

### T8 — Role-aware pre-save check (`builder/dashboard-builder-dialog.tsx`)

- In `BuilderPaneController` (`L72`), call `useLayoutRoles()`.
- In `handleSave` (`L80-86`), when the roles query has data, add `roleIds: new Set(roles.map((r) => r.id))` to the `validateDashboardLayout` context. When it has no data (loading or error), omit `roleIds` and let the server decide (422).
- The existing `!result.ok` branch toasts `result.errors[0]` and returns before any request. Keep it unchanged.
- Why: it is the same core function and context the server's PUT uses. An orphan left in the draft fails here with core's message instead of a 422 round-trip. The author removes it with the "deleted role" chip.
- `DashboardBuilderDialog` (`L30-64`) is unchanged. The dialog's GET already returns every tab with `roles` to a `manage_roles@*` caller, and only such callers mount it (T2).
- The interim 409 `layout-locked` toast path (`L95-97`, `detail ?? title`) is unchanged (entry 5).

### T9 — Locales (`apps/dashboard/src/locales/en.json`, `it.json`)

Keep both files in key parity. Add `dashboard.empty` as a sibling of `dashboard.builder`. Add `dashboard.builder.audience` after `dashboard.builder.page`. Verbatim:

```json
"empty": {
  "title": "Nothing to show yet",
  "description": "No dashboard tab is available for your roles and permissions."
}
```
```json
"audience": {
  "label": "Visible to",
  "everyone": "Everyone",
  "add": "Add role",
  "search": "Search roles…",
  "empty": "No roles found.",
  "deletedRole": "Deleted role",
  "remove": "Remove {{name}}",
  "loadError": "Could not load roles."
}
```

Italian:

```json
"empty": {
  "title": "Niente da mostrare",
  "description": "Nessuna scheda della dashboard è disponibile per i tuoi ruoli e permessi."
}
```
```json
"audience": {
  "label": "Visibile a",
  "everyone": "Tutti",
  "add": "Aggiungi ruolo",
  "search": "Cerca ruoli…",
  "empty": "Nessun ruolo trovato.",
  "deletedRole": "Ruolo eliminato",
  "remove": "Rimuovi {{name}}",
  "loadError": "Impossibile caricare i ruoli."
}
```

`search` is the `CommandInput` placeholder.

### T10 — Tests

All dashboard tests:
- live in the unit tier under `features/dashboard/test/unit/`;
- use double quotes;
- put `vi.mock` factories at the top, above the consuming imports;
- reset mocks with `beforeEach(() => vi.clearAllMocks())`;
- use the SPDX header.

Shared fixture rules:
- Role ids are UUIDv4 literals, declared once per file as named constants (`ROLE_EDITOR_ID`, `ROLE_MERCHANT_ID`, `ORPHAN_ROLE_ID`).
- Seeds are the canonical `posts` / `authors`.
- Permission payloads use the `GET /api/settings/me` JSON shape (`{ global: [...], byScope: { posts: [...] } }`). They are never hand-built `Set`s: the real `hydrateEffectivePermissions` + core `hasPermission` must run (Rule 3.10).

**10a. Core — `packages/core/src/dashboard-layout/dashboard-layout.test.ts` (EDIT)**
- Delete the import (`L19-22`), the `dashboard-permissions` banner and `describe('canEditDashboard')` (`L462-475`). No other change.

**10b. NEW — `features/dashboard/test/unit/dashboard-page.test.tsx`**

Setup:
- Mock `@/lib/rpc`, the I/O boundary:
  - `settings.me.$get` resolves the `me` body under test;
  - `schema.$get` resolves `[]`;
  - `"dashboard-layout".$get` resolves `{ layout: null }`.
- Mock `@/features/navigation` with stub `AppSidebar` / `SiteHeader`. They are chrome, not under test.
- Mock `@/lib/auth-context` with `useAuth` returning `{ user: { email, name: "Ada", role: "admin" } }`. Comment: a legacy admin JWT is used on purpose, so a regression back to the role-based gate fails these tests.
- Render inside `QueryClientProvider` (`retry: false`, as `use-dashboard-layout.test.ts:L19-23`) and `MemoryRouter`.

`describe("DashboardPage")`:
- Shows the "Customize" button once `me` reports `manage_roles` in `global`.
- Never shows the "Customize" button when `me` reports no `manage_roles`, even though the JWT `role` is `admin`. Assert after `me` has resolved: wait for the greeting name, then `queryByRole` returns null. This is the regression guard comment.
- Never shows the "Customize" button when `me` reports `manage_roles` only under `byScope.posts`.

**10c. NEW — `features/dashboard/test/unit/page-audience-picker.test.tsx`**

Setup:
- Mock `@/lib/rpc` with `"dashboard-layout": { roles: { $get } }`. Two roles: `Editor` (`icon: "Store"`, a key of `ICON_MAP` in `lib/icon-registry.ts`) and `Merchant` (`icon: null`).
- `QueryClientProvider` with `retry: false`.
- `onChange` is a `vi.fn()`.

`describe("PageAudiencePicker")`:
- Renders "Everyone" and no chip when `roleIds` is empty.
- Renders one chip per targeted role, showing the role name resolved by id.
- Renders an id absent from the loaded list as a "Deleted role" chip and never prints the raw id.
- Clicking the remove button of the "Deleted role" chip calls `onChange` with the list minus that id.
- Choosing an unselected role in the popover calls `onChange` with that id appended.
- Choosing an already-selected role in the popover calls `onChange` with that id removed.
- While the roles request is pending, a targeted id is not labelled "Deleted role", and the add trigger is disabled. Regression guard comment: an unresolved list must never mark ids orphan.
- When the roles request rejects, shows "Could not load roles.", disables the add trigger, and calls `onChange` zero times.
- With `MAX_ROLES_PER_PAGE` ids selected, an unselected role's item is disabled.
  - Comment: the fixture for this case builds 32 roles with UUIDv4 ids.
  - Generate them from a fixed list or a deterministic pattern. Never `crypto.randomUUID()`/`Math.random()` (§7.7).

**10d. EDIT — `use-dashboard-builder.test.ts`**
- `setPageRoles` writes the ids on the target page only, and the other pages keep no `roles` key.
- `setPageRoles` with a duplicated id keeps one occurrence in first-seen order.
- `setPageRoles(pageId, [])` removes the `roles` key, so `isDirty` returns to false for a layout that had none.
- `setPageRoles` on an unknown page id leaves the draft deep-equal to the previous draft.

**10e. EDIT — `use-dashboard-layout.test.ts`**
- New `it()`: "re-requests the layout on remount even inside the app-wide staleTime".
  - Build a client with `staleTime: 5 * 60 * 1000` and the default `gcTime`. The magic-value comment says it mirrors `lib/query-client.ts`, the production default the hook must override.
  - Render, wait for success, unmount, render again.
  - Expect the layout `$get` to have been called twice.
- New `it()`: "returns a stored layout with no pages as-is instead of the generated default". The mock serves `{ layout: { version: 1, pages: [] } }`, and the schema serves the canonical `posts` seed. Assert `layout.pages` has length 0 and `isStored` is true.

**10f. EDIT — `dashboard-layout-renderer.test.tsx`**
- Rewrite `L163` ("renders no tab list and no section for a layout with no pages"). It now asserts that the empty-state title "Nothing to show yet" is shown, that no `tablist` role exists, and that no section renders.
- The existing fallback test (`L93`) is unchanged. It is the first-visible-tab contract.

**10g. EDIT — `dashboard-builder-dialog.test.tsx`**
- The rpc mock (`L18-24`) gains `roles: { $get: mocked.getRoles }`. In `beforeEach`, `getRoles` resolves the two-role fixture.
- New `it()`: refuses to save when a page targets an id absent from `GET /roles`.
  - The orphan is an `initialLayout` page with `roles: [ORPHAN_ROLE_ID]`, served through `$get`.
  - Outcome: `toast.error` is called once and `$put` is never called.
- New `it()`: saves a page whose `roles` are all known. `$put` is called with `{ json: objectContaining({ pages: [objectContaining({ roles: [ROLE_EDITOR_ID] })] }) }`.
- The three existing `it()`s keep their names and outcomes.

**10h. EDIT — `builder-pane.test.tsx`**
- Replace the stale mock (`L13-21`, `scopes` / `:scope`) with `"dashboard-layout": { $get, $put, $delete, roles: { $get } }`. `$get` resolves `{ layout: null }` and `roles.$get` resolves `[]`. Update the `L12` comment.
- New `it()`: the "Visible to" picker is shown in edit mode and is absent after toggling preview.
- The existing `it()`s keep their names and outcomes.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# core barrel compiles without dashboard-permissions
cd packages/core && pnpm run build

# dashboard typecheck (RPC inference of /roles, removed core export)
cd apps/dashboard && npx tsc --noEmit
# api typecheck: no new error vs the 51-error baseline (sprint 1 review note 2)
cd apps/api && npx tsc --noEmit

pnpm beech test --diff
pnpm beech test
pnpm beech lint

# legacy edit axis gone from the dashboard surface (expect no output)
rg -n "canEditDashboard|ROLES_ALLOWED_TO_EDIT_DASHBOARD" apps packages -g '!**/dist/**' -g '!**/node_modules/**' -g '!apps/api/assets/**' -g '!packages/mcp/resources/**' -g '!**/graphify-out/**'
rg -n "\.role\b" apps/dashboard/src/features/dashboard
# VSA: no import from the rbac slice (expect no output)
rg -n "features/rbac" apps/dashboard/src/features/dashboard

graphify update . --force
```

Manual check (`pnpm beech dev`; recommended because this is a UI sprint):
- As SuperAdmin:
  - "Customize" is visible.
  - In the builder, set a tab's audience to one role. The chip shows its icon and name. Save succeeds.
  - Delete that role from Settings → Roles and reopen the builder. The chip reads "Deleted role". Save is refused with a toast until the chip is removed, then succeeds.
- As an account with only `content:read@posts`:
  - "Customize" is absent.
  - The targeted tab is absent.
  - `?page=<that tab's slug>` shows the first visible tab.
  - With every tab targeted elsewhere, the empty state appears.
- Assign that account the targeted role (as SuperAdmin, in another browser), then refocus the first window. The tab appears without a reload.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `canEditDashboard`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD` and `dashboard-permissions.ts` exist nowhere in source. The SECTION 5 `rg` prints nothing. Core gains no export or dependency.
- [ ] `DashboardPage` gates both the "Customize" button and the builder mount on `usePermissions().canGlobally("manage_roles")`. Nothing in `features/dashboard/` reads `user.role` or the JWT `role` claim.
- [ ] `useDashboardLayout` re-fetches on every mount despite the app-wide 5-minute `staleTime`, and still returns a stored `pages: []` layout instead of the generated default.
- [ ] `DashboardLayoutRenderer` renders the explicit empty state (`dashboard.empty.*`) for `pages: []`, and keeps the `?page=` fallback to the first served tab.
- [ ] `dashboardBuilderApi.getRoles`, `LayoutRole`, `LAYOUT_ROLES_QUERY_KEY`, `useLayoutRoles`, `setPageRoles` and `PageAudiencePickerProps` exist with the exact T5–T7 shapes. `LayoutRole` is inferred from the route, not hand-written.
- [ ] The builder shows, for the active tab in edit mode:
  - an audience picker listing roles by name and icon;
  - "Everyone" when no role is targeted;
  - a removable "Deleted role" chip for an id missing from a loaded list;
  - no orphan marking while the list is loading or has failed.
- [ ] Clearing the audience removes the `roles` key from the draft (no `roles: []` in the PUT body).
- [ ] Saving a draft with an orphan id is refused client-side through core `validateDashboardLayout(…, { roleIds })`, with no PUT sent.
- [ ] `features/dashboard/` imports nothing from `features/rbac`. Role data comes only from `GET /api/dashboard-layout/roles`.
- [ ] `en.json` and `it.json` gain the same `dashboard.empty` and `dashboard.builder.audience` keys (parity kept).
- [ ] Every new or edited test follows `testing_conventions.md`:
  - SPDX header;
  - four zones;
  - one act;
  - named act result;
  - typed values;
  - no `any`;
  - no `Date.now()` / `Math.random()` / `crypto.randomUUID()` in fixtures;
  - no `it.only`/`skip`;
  - the §6.2 comments named in T10.
- [ ] `pnpm run build` (core), `npx tsc --noEmit` (dashboard: zero errors; api: no new error), `pnpm beech test` and `pnpm beech lint` pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:

- Any API file: handlers, the route table, repositories or API tests. The sprint 2 contract is consumed as shipped. In particular, do not add role ids to `/api/settings/me`; T3 makes that unnecessary.
- `requires` on widget definitions, renderer/palette filtering by permission, and default-generator exclusion of media/setup/health widgets. These are ROADMAP entry 4. `generateDefaultDashboardLayout` stays as it is.
- `manage_layout`, structure-vs-content controls in the builder, opaque locked-widget placeholders, compare-and-swap, and the 409 reload-and-reapply flow. These are ROADMAP entries 5–6. The interim 409 `layout-locked` toast stays as it is.
- Restricting tab create/delete/reorder by permission inside the builder. Today only `manage_roles@*` holders open it, so every builder user is structural (entry 6 splits it).
- An audience indicator on the tab pills, or any edit to `page-tabs-manager.tsx`.
- Rewriting the `?page=` URL when it names a hidden tab. Falling back without a rewrite discloses nothing and is the shipped behaviour.
- Clearing the TanStack cache on logout or user switch. That gap is app-wide (`lib/auth-context.tsx` has no `queryClient` call), not part of this roadmap. T3 shrinks it for the layout.
- `isDeveloper` in `usePermissions` / `/api/settings/me`, `users.role` in `lib/auth-context.tsx`, the entry-editor `canEditLayout(user?.role)` (`use-entry-editor-dialog.tsx:L242`), and `manage_seeds`. These are ROADMAP entries 7–8 and brief §5.
- Any edit to `features/rbac/*`, including its `ME_QUERY_KEY` invalidations.
- New shared query keys in `features/shared/query-keys.ts`. The roles key is builder-local.
- Docs under `docs/` (ROADMAP entry 9). Generated `docs/api/**` must not be hand-edited.
