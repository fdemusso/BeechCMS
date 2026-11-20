# Sprint Plan — BeechPalProviderEngine (BeechPal, sprint 1 of 9)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 1).
Feature brief: `stages/00_ideation/output/feature_brief.md`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30018 nodes, 43780 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Degree | Role in this sprint |
|------|--------|--------|---------------------|
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L60` | 72 | The single UI visibility evaluator (brief rule 3). The engine consumes it; NOT modified. |
| `useSchema()` | `apps/dashboard/src/features/shared/hooks/use-schema.ts:L25` | 53 | Runtime seed list. Replaces the palette's read of the static `SEED_REGISTRY`. NOT modified. |
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 21 | Core evaluator behind `usePermissions().can`. NOT modified. |
| `useSettingsDialog()` | `apps/dashboard/src/features/settings/hooks/use-settings-dialog.ts:L20` | 14 | Settings slice public API, today called from inside the palette slice. Moves to the composition root. |
| `getVisibleSettingsEntries()` | `apps/dashboard/src/features/settings/lib/settings-registry.ts:L149` | 9 | Settings tab visibility (already RBAC-gated). Moves to the composition root. |
| `CommandPalette()` / `useCommandPalette()` | `features/command-palette/command-palette.tsx:L75`, `use-command-palette.ts:L8` | 5 / 5 | Leaf: only `App.tsx`, the slice barrel and two test files depend on them. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none. Consumed only (`Permission`, `Scope`, `GLOBAL_SCOPE`, `isSystemSeedSlug`, `Seed`).
- `apps/api`: none. `GET /api/search` already projects results onto seeds the caller can `content:read`
  (`apps/api/src/features/search/handlers/full-text-search.ts`, `filterSeedsByPermission`); untouched.
- `apps/dashboard`:
  - `src/features/command-palette/` (owner slice): contract, engine, built-in providers, renderer.
  - `src/pages/` (composition root, precedent `src/pages/view-registry.ts:L3`): new providers that need
    the `settings` and `seed-builder` slices.
  - `src/App.tsx:L136` mount point; `src/test/cross-slice/app.test.tsx:L44` mock.
  - `src/config/dashboard-menu.ts`: read-only reuse of the sidebar menu builders.
  - `src/locales/en.json`, `src/locales/it.json`: `commandPalette.*` keys.

**c) `graphify affected` impact analysis**

```
graphify affected "CommandPalette()" --depth 2
- App.tsx [imports]                                    apps/dashboard/src/App.tsx:L1
- index.ts [re_exports]                                features/command-palette/index.ts:L1
- command-palette.test.tsx [imports]                   features/command-palette/test/unit/command-palette.test.tsx:L1
- app.test.tsx [imports_from]                          src/test/cross-slice/app.test.tsx:L1
- main.tsx [imports_from]                              src/main.tsx:L1

graphify affected "RootView()" --depth 2
- command-palette.tsx [imports]; index.ts [re_exports]        (slice-internal only)

graphify affected "useSettingsDialog()" --depth 2   (palette-relevant rows)
- root-view.tsx, RootView(), settings-view.tsx, SettingsItems(), command-palette.tsx
  → the palette is a consumer of the settings slice today (cross-feature import)

graphify affected "getStaticMenu()" --depth 2
- dashboard-menu.test.ts, app-sidebar.tsx, AppSidebar, app-shell.tsx, page-shell-loading.tsx,
  navigation/index.ts, dashboard-page.tsx, analytics.tsx, content-list.tsx, content-trash.tsx, …
  → the builders are shared with the sidebar: this sprint calls them, never changes them.

graphify path "RootView()" "useSettingsDialog()"
  RootView() --calls--> useSettingsDialog()        (1 hop: the VSA breach to remove)
```

Breaking-change verdict: the only public symbols touched are the slice barrel exports. `CommandAction`
has zero consumers outside the slice (grep over `apps/dashboard/src`); `CommandPage` and
`CommandPaletteState` keep their shape. `App.tsx` and `app.test.tsx` are the only external edits.
The sidebar's palette trigger (`navigation/components/sidebar-search.tsx:L14`) dispatches a synthetic
Ctrl+K keydown; the listener in `use-command-palette.ts:L30` is unchanged, so it keeps working.

Findings that shape the plan:
1. `_parts/root-view.tsx:L51` navigates to `/media`, a route that does not exist (`App.tsx` route table
   has no `media` path). Dead row.
2. `command-palette.tsx:L82` reads `Object.values(SEED_REGISTRY)` at render. `useSchema()` fills that
   registry as a side effect (`use-schema.ts:L31`), so the palette lists stale or no seeds and misses
   runtime seeds, and it lists seeds without checking `content:read`.
3. `_parts/settings-view.tsx:L13` imports `@/features/settings`; `_parts/schema-view.tsx:L10` imports
   `@/features/seed-builder`. Both are cross-feature imports (`_config/architecture.md` §2).
4. Today's filtering is cmdk's built-in filter; cmdk 1.1.1 exports the same scorer as `defaultFilter`
   (`node_modules/cmdk/dist/index.d.ts:L18`, signature `(value, search, keywords?) => number`).

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** Every new node is needed by this sprint's own deliverables: the provider contract
  removes the VSA breach (finding 3) and gives one place for RBAC projection (brief rules 3–4).
  Things that would be speculative here were cut: no prefix router (sprint 2, first prefix arrives
  there), no async lane (sprint 4), no context-action contract (sprint 6), no per-item score override
  (sprint 2), no submenu (sprint 4). A provider registry class was rejected: an ordered array passed
  as a prop is enough. **No VETO.**
- **Rule 2, Botanical invariant.** No D1 access, no API change, no field names. The palette reads
  seeds through `useSchema()` and permissions through `usePermissions()` (which calls core
  `hasPermission`). No query bypasses `@beechcms/core`. **Respected.**
- **Rule 3, VSA.** Before: `command-palette` imports `settings` and `seed-builder`. After: the slice
  imports only `@/features/shared`, `@/config/dashboard-menu`, `@/components/*`, `@/lib/*`, `@/hooks/*`
  and `@beechcms/core`. The two providers needing other slices live in `src/pages/`, the composition
  root (same rule as `src/pages/view-registry.ts:L3`), and are injected through a prop. Zero
  cross-imports between features after this sprint. **Violation found and fixed by the plan.**
- **Rule 4, Cloudflare purity.** Client-only change; no Worker, D1 or R2 touch. **Respected.**
- **Rule 5, minimal blueprint.** Tier footprint: core 0 files, api 0 files, dashboard 1 slice + 2
  composition-root files + mount. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Every BeechPal capability in the brief (calculator, conversions, notes, search, context actions,
system commands, pins) is "one more provider contributing rows". Today the palette has no providers:
`RootView` hand-writes every row, each with its own ad-hoc permission check, and the slice imports two
sibling slices. Adding nine row families on top of that would multiply the VSA breach and re-implement
the RBAC projection per row, against brief rules 3, 4 and 5.

This sprint builds the minimum engine every later sprint plugs into:
- a typed `PaletteItem` / `PaletteProvider` contract owned by the palette slice;
- one place where `requires` is evaluated against `usePermissions()` (core `hasPermission`), producing
  "disabled, with the missing permission named" (brief rule 4b); hidden surfaces are simply not
  emitted by their provider (rule 4a); no permission payload ⇒ `usePermissions` already returns
  `NO_AUTHORITY` ⇒ nothing gated is shown or enabled (brief §4, "payload non disponibile");
- one ranking function over all providers, so later providers compete on relevance (rule 9);
- stable item ids, which sprint 9 (pins) persists server-side.

VSA: features declare, the palette aggregates (rule 5). Providers that need another slice's API are
assembled in the composition root and injected, so `features/command-palette` stops importing
`settings` and `seed-builder`. Botanical invariant: no data access is added; seeds and permissions come
from the existing `@/features/shared` hooks backed by `@beechcms/core`.

Behaviour for the user stays the same row for row, except three corrections: the dead `/media` row
goes, seeds the caller cannot read stop appearing, and runtime seeds appear.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Mount and state.** `App.tsx:L136` renders `<CommandPalette />` inside `RoutePrefetchProvider`, next
to `<SettingsDialogHost />`, inside the router (so `useNavigate` / `useSearchParams` work).
`useCommandPalette()` (`use-command-palette.ts:L8`) owns `open`, the page stack (`CommandPage[]`,
starts `["root"]`), `search`, and a document keydown listener: Ctrl/Cmd+K toggles (L32), Alt+N opens on
`["root","create"]` using `e.code` for macOS (L41), Backspace on empty search pops a page (L53).
Closing resets search and pages (L67). Escape on a sub-page pops instead of closing
(`command-palette.tsx:L108`). None of this changes.

**Rendering.** `command-palette.tsx:L117` renders cmdk `<Command loop>` with built-in filtering;
`EmptyMessage` (L30) uses `useCommandState`; `BreadcrumbChips` (L47) shows the stack; per-page
placeholder map (L84); per-page view switch (L130–L150); footer back hint on sub-pages (L153).

**Rows today** (`_parts/root-view.tsx`):
- Navigate group (forceMount): Dashboard `/`, Media Library `/media` (dead), "Settings…" → page
  `settings` (idle only).
- Contents group: first 5 seeds "Go to {label}" → `/content/:slug`, keywords `[slug,"contenuto","lista"]`
  (L72); "All content types…" → page `seeds` when more than 5.
- Create group: "New content…" → page `create`, shortcut Alt+N chips (L93–L96).
- Schema group when `canGlobally("manage_seeds")` (L100): `SchemaActions` (`schema-view.tsx:L35`):
  "New content type" → `/schema?seed=new` (keywords L44); idle "Edit content type…" → page
  `edit-schema`; typing → one "Edit schema of {label}" row per non-system seed (keywords L69).
- Tools group: "Search content" → page `search-results`; theme toggle (keywords L116, icon Sun/Moon).
- Typing: `SettingsItems` with bookmark rows (`settings-view.tsx:L23`), headings
  "Settings · {group}", tab row `openSettings(id)`, section rows `openSettings(id, { section })`.
- Sub-pages: `seeds` / `create` (`seeds-view.tsx:L18`, label + slug, `/content/:slug` or
  `/content/:slug/create`), `edit-schema` (`schema-view.tsx:L79`), `settings` (`settings-view.tsx:L79`),
  `search-results` (`search-results-view.tsx:L35`, async `rpc.api.search.$get`, debounced 300 ms,
  `limit: "8"`, min 2 chars).

**Permissions.** `usePermissions()` returns `{ effective, can, canAnywhere, canGlobally,
manageableScopes, isLoading }` (`use-permissions.ts:L39`); no payload ⇒ `NO_AUTHORITY` (L17).
Sidebar gates are derived once in `app-sidebar.tsx:L61` into `MenuGates`
(`config/dashboard-menu.ts:L40`): `viewAnalytics = canGlobally('view_analytics')`,
`readContent = canAnywhere('content:read')`, `createContent = canAnywhere('content:create')`,
`manageSeeds = canGlobally('manage_seeds')`. Builders: `getStaticMenu` (L53), `getContentCategoryMenu`
(L64, marks `notImplemented` on create-new and scheduled), `getStudioMenu` (L88).

**Composition-root precedent.** `src/pages/view-registry.ts` imports three content slices and is
documented as the only module allowed to (L3).

**UI primitives.** `@/components/ui/command`: `CommandItem` already styles `data-[disabled=true]`
(`command.tsx:L170`); cmdk skips disabled items on keyboard selection and never calls their `onSelect`.

**Tests today.** `test/unit/command-palette.test.tsx` (4 keyboard tests; mocks `react-router-dom`,
`@/features/shared` with `usePermissions` only, `@/lib/theme`). `test/unit/search-results-view.test.tsx`
(search view; kept as is). `src/test/cross-slice/app.test.tsx:L44` mocks the palette slice.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create (dashboard):
1. `apps/dashboard/src/features/command-palette/lib/collect-palette-items.ts`
2. `apps/dashboard/src/features/command-palette/lib/rank-palette-items.ts`
3. `apps/dashboard/src/features/command-palette/providers/navigation-provider.ts`
4. `apps/dashboard/src/features/command-palette/providers/content-provider.ts`
5. `apps/dashboard/src/features/command-palette/providers/tools-provider.ts`
6. `apps/dashboard/src/features/command-palette/_parts/palette-list.tsx`
7. `apps/dashboard/src/pages/palette-providers.ts` (composition root: settings + content-types providers)
8. `apps/dashboard/src/pages/app-command-palette.tsx` (composition root: `AppCommandPalette`)
9. Tests: `features/command-palette/test/unit/collect-palette-items.test.ts`,
   `…/rank-palette-items.test.ts`, `…/navigation-provider.test.ts`, `…/content-provider.test.ts`,
   `apps/dashboard/src/pages/palette-providers.test.ts`.

Edit:
10. `features/command-palette/types.ts` — new contract; `CommandAction` removed.
11. `features/command-palette/command-palette.tsx` — engine wiring, `hostProviders` prop.
12. `features/command-palette/index.ts` — barrel.
13. `features/command-palette/test/unit/command-palette.test.tsx` — adapt to the prop and add RBAC rows.
14. `apps/dashboard/src/App.tsx` — mount `AppCommandPalette`.
15. `apps/dashboard/src/test/cross-slice/app.test.tsx` — mock path.
16. `apps/dashboard/src/locales/en.json`, `it.json` — add one key, drop dead ones.

Delete:
17. `features/command-palette/_parts/root-view.tsx`, `_parts/seeds-view.tsx`, `_parts/schema-view.tsx`,
    `_parts/settings-view.tsx`.

Untouched on purpose: `use-command-palette.ts`, `_parts/search-results-view.tsx` and its test,
`config/dashboard-menu.ts`, everything in `packages/core` and `apps/api`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — The provider contract (`types.ts`)

Approach: the palette slice owns the contract; providers are plain objects with a synchronous, pure
`getItems`. Reason: local providers must answer at zero latency (brief rule 10) and pure functions are
unit-testable without React.

Keep `CommandPage` and `CommandPaletteState` exactly as they are (`types.ts:L8`, `L29`). Remove
`CommandAction` (L17), which has no consumer. Add, verbatim:

```ts
import type { Permission, Scope } from "@beechcms/core"
import type { IconComponent } from "@/lib/icon-registry"
import type { PermissionsApi } from "@/features/shared"

/** The three questions a provider may ask; same evaluator as the rest of the dashboard. */
export type PalettePermissions = Pick<PermissionsApi, "can" | "canAnywhere" | "canGlobally">

/** Permission an item needs to be ENABLED. Failing it disables the row; it never hides it. */
export interface PaletteRequirement {
  readonly permission: Permission
  /** GLOBAL_SCOPE ('*') or a seed slug. Omitted: held on at least one scope (canAnywhere). */
  readonly scope?: Scope
}

/** What selecting a row does. The engine closes the palette after `navigate` and `run`. */
export type PalettePerform =
  | { readonly kind: "navigate"; readonly to: string }
  | { readonly kind: "page"; readonly page: CommandPage }
  | { readonly kind: "run"; readonly run: () => void }

export interface PaletteItem {
  /** Stable across sessions and languages: `${providerId}:${key}`. Persisted by pins (roadmap 9). */
  readonly id: string
  /** Translated group heading; rows with the same section render together, first appearance wins. */
  readonly section: string
  readonly label: string
  readonly description?: string
  readonly icon: IconComponent
  readonly keywords?: readonly string[]
  /** Key caps rendered on the row, e.g. ["Alt", "N"]. Display only. */
  readonly shortcut?: readonly string[]
  readonly requires?: PaletteRequirement
  readonly perform: PalettePerform
}

export interface PaletteQueryContext {
  readonly page: CommandPage
  /** The text in the input, trimmed. */
  readonly query: string
  readonly permissions: PalettePermissions
}

export interface PaletteProvider {
  /** Unique among the providers passed to the palette; first segment of every item id it emits. */
  readonly id: string
  readonly pages: readonly CommandPage[]
  /** Synchronous, side-effect free. A surface the caller may not see is simply not returned. */
  readonly getItems: (context: PaletteQueryContext) => readonly PaletteItem[]
}

export interface ResolvedPaletteItem extends PaletteItem {
  /** null: enabled. Otherwise the user-facing text naming the missing permission. */
  readonly disabledReason: string | null
}
```

Rules:
- Item id format is `${provider.id}:${key}`; `key` never contains translated text (ids survive a
  language switch, pins depend on it).
- Hidden vs disabled is never mixed for the same surface (same rule as `NavItem`,
  `dashboard-menu.ts:L17`): a provider decides visibility by emitting or not; `requires` only disables.

### Task 2 — `collectPaletteItems` (`lib/collect-palette-items.ts`)

```ts
export function collectPaletteItems(
  providers: readonly PaletteProvider[],
  context: PaletteQueryContext,
  describeMissing: (requirement: PaletteRequirement) => string,
): ResolvedPaletteItem[]
```

Behaviour:
- Calls `getItems` only on providers whose `pages` includes `context.page`, in array order; output keeps
  provider order then item order.
- `requires` evaluation: `scope` undefined ⇒ `permissions.canAnywhere(permission)`; otherwise
  `permissions.can(permission, scope)`. Failing ⇒ `disabledReason = describeMissing(requirement)`;
  passing or no `requires` ⇒ `null`.
- Duplicate `id`: the first occurrence wins, later ones are dropped (cmdk needs unique values; pins
  need one row per id).
- A provider that throws contributes nothing; the others are still returned. Log with `console.error`
  including the provider id. Never throws.

### Task 3 — `rankPaletteItems` (`lib/rank-palette-items.ts`)

```ts
export function rankPaletteItems(
  items: readonly ResolvedPaletteItem[],
  query: string,
): ResolvedPaletteItem[]
```

Approach: score with cmdk's exported `defaultFilter(label, query, [...keywords, section])`. Reason: it
is the scorer the palette uses today, so matching quality is unchanged while the ordering becomes ours.

Behaviour:
- Empty (after trim) query ⇒ returns the items in input order, nothing dropped.
- Otherwise drops items scoring `0`, sorts by score descending, stable (ties keep input order, i.e.
  provider order).
- Disabled items are scored and kept like any other (brief rule 4b: never hidden).
- Pure: same input ⇒ same output; does not mutate the input array.

### Task 4 — Built-in providers (palette slice)

Each file exports one factory returning a `PaletteProvider`. Factories take their dependencies as an
argument object (closures), so `getItems` stays pure. Type `t` as `TFunction` from `i18next`.
Carry the keyword arrays over from the files being deleted (pointers below) before deleting them.

**4a. `providers/navigation-provider.ts`**

```ts
export function createNavigationProvider(deps: { t: TFunction }): PaletteProvider   // id: "nav", pages: ["root"]
```

- Builds `MenuGates` from `context.permissions` exactly as `app-sidebar.tsx:L61` does, then calls
  `getStaticMenu`, `getStudioMenu`, `getContentCategoryMenu` from `@/config/dashboard-menu`, in that
  order. Reason: one source for "which screens exist for this role", sidebar parity for free.
- Maps each `NavItem` to `{ id: "nav:" + url, section: t("commandPalette.navigate"), label: title,
  icon, perform: { kind: "navigate", to: url } }`.
- Skips `notImplemented` items (they navigate to placeholder pages; the sidebar shows a toast instead).
  As a consequence no `disabled` NavItem reaches the palette today; if one ever arrives without
  `notImplemented`, skip it too and leave a one-line comment that `NavItem.disabled` carries no
  permission name to show.
- Adds one more row after the menu items, only when the query is empty: "Settings…" →
  `{ kind: "page", page: "settings" }`, id `nav:settings`, icon `Settings`
  (today's `root-view.tsx:L55`). While typing, the settings provider lists the tabs directly.
- No `/media` row (finding 1).

**4b. `providers/content-provider.ts`**

```ts
export function createContentProvider(deps: { t: TFunction; seeds: readonly Seed[] }): PaletteProvider
// id: "content", pages: ["root", "seeds", "create"]
```

- Readable seeds = `seeds` without `dashboard?.hidden`, kept only if
  `permissions.can("content:read", seed.slug)`; sorted like `buildContentMenu`
  (`dashboard-menu.ts:L122`, `dashboard.order ?? 99`).
- Page `root`:
  - Section `t("commandPalette.contents")`. Empty query: first 5 readable seeds as
    "Go to {label}" (`commandPalette.goTo`), id `content:open:<slug>`, navigate `/content/<slug>`,
    keywords from `root-view.tsx:L72`; plus "All content types…" (`commandPalette.allSeeds`) → page
    `seeds`, id `content:all`, only when more than 5 readable. Non-empty query: one "Go to" row per
    readable seed (no cap; ranking does the cutting).
  - Section `t("commandPalette.create")`: "New content…" (`commandPalette.newContent`) → page `create`,
    id `content:new`, shortcut `["Alt", "N"]`, emitted only when at least one seed is readable,
    `requires: { permission: "content:create" }` (anywhere).
- Page `seeds`: section `t("commandPalette.chooseSeed")`, one row per readable seed, label `seed.label`,
  description `seed.slug`, id `content:open:<slug>`, navigate `/content/<slug>`.
- Page `create`: section `t("commandPalette.chooseType")`, one row per readable seed, id
  `content:create:<slug>`, navigate `/content/<slug>/create`,
  `requires: { permission: "content:create", scope: seed.slug }`.
- Icons via `resolveIcon(seed.dashboard?.icon)` (`@/lib/icon-registry`).

**4c. `providers/tools-provider.ts`**

```ts
export function createToolsProvider(deps: {
  t: TFunction
  theme: string | undefined
  toggleTheme: () => void
}): PaletteProvider   // id: "tools", pages: ["root"]
```

- Section `t("commandPalette.tools")`.
- "Search content" → page `search-results`, id `tools:search`, emitted only when
  `canAnywhere("content:read")` (nothing to search otherwise; the API would return an empty list).
- Theme toggle → `{ kind: "run", run: toggleTheme }`, id `tools:theme`, icon `Sun` when
  `theme === "dark"` else `Moon`, keywords from `root-view.tsx:L116`.

### Task 5 — Composition-root providers (`src/pages/palette-providers.ts`)

Approach: the two providers that need another slice's public API live here and are injected. Reason:
VSA forbids the palette importing `settings` / `seed-builder`; `src/pages/` is the existing
composition root.

```ts
import type { PaletteProvider } from "@/features/command-palette"

export function createSettingsProvider(deps: {
  t: TFunction
  openSettings: ReturnType<typeof useSettingsDialog>["openSettings"]
}): PaletteProvider   // id: "settings", pages: ["root", "settings"]

export function createContentTypesProvider(deps: {
  t: TFunction
  seeds: readonly Seed[]
  openBuilder: (intent: string) => void
}): PaletteProvider   // id: "schema", pages: ["root", "edit-schema"]
```

`openSettings` is `(nextTab?: SettingsTab, extraParams?: Readonly<Record<string, string>>) => void`
(`features/settings/hooks/use-settings-dialog.ts:L27`); bookmark rows pass `{ section: sectionId }`
exactly as today. Do not change the settings slice.

Settings provider (port of `_parts/settings-view.tsx:L23`):
- Gates object `{ canGlobally, canAnywhere }` from `context.permissions`, passed to
  `getVisibleSettingsEntries` / `getVisibleSections` (`@/features/settings`). Visibility stays the
  settings registry's job.
- Section per settings group in `SETTINGS_GROUP_ORDER`, heading
  `` `${t("commandPalette.settings")} · ${t(group.key, group.defaultLabel)}` `` (L37).
- Page `root`: emits rows only when the query is non-empty: one tab row per visible entry (id
  `settings:<entryId>`, keywords L45) plus one bookmark row per visible section (id
  `settings:<entryId>:<sectionId>`, label `"{tab} › {section}"`, L53–L66). Idle: nothing (the
  navigation provider's "Settings…" row covers it).
- Page `settings`: tab rows only, any query.
- Perform: `run` → `openSettings(entry.id)` or `openSettings(entry.id, { section: sectionItem.id })`.

Content types provider (port of `_parts/schema-view.tsx`):
- Emits nothing unless `canGlobally("manage_seeds")` (whole surface hidden, brief rule 4a; today's
  `root-view.tsx:L100`).
- Editable seeds = `seeds` without `isSystemSeedSlug(slug)` (`@beechcms/core`).
- Page `root`, section `t("commandPalette.schema")`: "New content type" → `run: openBuilder(SEED_INTENT_NEW)`,
  id `schema:new`, keywords L44; idle: "Edit content type…" → page `edit-schema`, id `schema:edit`;
  typing: one "Edit schema of {label}" row per editable seed, id `schema:edit:<slug>`, keywords L69.
- Page `edit-schema`, section `t("commandPalette.chooseContentType")`: one row per editable seed,
  label `seed.label`, description `seed.slug`, id `schema:edit:<slug>`.
- `SEED_INTENT_NEW` comes from `@/features/seed-builder`.

### Task 6 — `AppCommandPalette` (`src/pages/app-command-palette.tsx`)

```ts
export function AppCommandPalette(): JSX.Element
```

- Calls `useTranslation()`, `useSettingsDialog()`, `useSchema()` (`@/features/shared`, default `[]`),
  `useNavigate()`.
- `openBuilder(intent)` navigates to `/schema?${SEED_INTENT_PARAM}=${encodeURIComponent(intent)}`
  (today's `schema-view.tsx:L20`). It does not close the palette: closing after `run` is the engine's job.
- Memoises `[createSettingsProvider(...), createContentTypesProvider(...)]` on `[t, openSettings, seeds,
  navigate]` and renders `<CommandPalette hostProviders={…} />`.
- `App.tsx`: replace the import at L30 and the element at L136 with `AppCommandPalette` from
  `./pages/app-command-palette`.
- `src/test/cross-slice/app.test.tsx:L44`: mock `@/pages/app-command-palette` with
  `{ AppCommandPalette: () => null }` instead of the palette slice.

### Task 7 — Engine wiring (`command-palette.tsx`) and renderer (`_parts/palette-list.tsx`)

`CommandPalette` props, verbatim:

```ts
export interface CommandPaletteProps {
  /** Providers assembled outside the slice (composition root); rendered after the built-ins. */
  readonly hostProviders: readonly PaletteProvider[]
}
```

Data flow in `CommandPalette`:
- Seeds from `useSchema()` (replaces `SEED_REGISTRY`, finding 2); permissions from `usePermissions()`.
- Built-in providers memoised from their deps. Order, which is also the idle group order:
  navigation, content (its "Contents" then "Create" sections), host providers (content types, then
  settings, in the order `AppCommandPalette` passes them), tools.
  To get the root idle order of today (Navigate, Contents, Create, Schema, Tools) pass
  `[contentTypes, settings]` from the composition root and put `tools` last.
- `items = rankPaletteItems(collectPaletteItems(providers, { page: currentPage, query: search.trim(),
  permissions }, describeMissing), search)`, memoised; `describeMissing` returns
  `t("commandPalette.requiresPermission", { permission })`.
- `<Command loop shouldFilter={false}>`: cmdk must not re-filter or re-sort.
- `search-results` page keeps rendering `<SearchResultsView>` unchanged instead of the list (no
  provider serves it this sprint).
- `perform`: `navigate` ⇒ `navigate(to)` then `setOpen(false)`; `page` ⇒ `pushPage(page)`;
  `run` ⇒ `run()` then `setOpen(false)`.
- Delete the `theme` / `toggleTheme` props plumbing into `RootView`; `toggleTheme` (L93) stays here
  and feeds the tools provider.
- Breadcrumbs, placeholders, Escape handling, footer, `EmptyMessage`: unchanged.

`PaletteList` props, verbatim:

```ts
interface PaletteListProps {
  readonly items: readonly ResolvedPaletteItem[]
  /** true while the user is typing: one ranked list, section label on each row. */
  readonly ranked: boolean
  readonly onPerform: (item: ResolvedPaletteItem) => void
}
```

Rendering rules (design system `#rules` / `#lookup`):
- Idle (`ranked` false): one `CommandGroup` per section, in first-appearance order, `heading` = section,
  `CommandSeparator` between groups.
- Typing (`ranked` true): a single `CommandGroup` without heading, rows in the given order; each row
  shows its section at the end, `ml-auto text-xs text-muted-foreground`.
- Row: `CommandItem` with `value={item.id}` (unique; cmdk uses it for selection) and
  `disabled={item.disabledReason !== null}`. Icon `size-4 shrink-0 text-muted-foreground`. Label
  `text-sm` (inherited). Second line, when `disabledReason` or `description` is set, in `text-xs
  text-muted-foreground`; `disabledReason` wins over `description`. The disabled look comes from
  `CommandItem`'s own `data-[disabled=true]` styles; add no colour, no opacity class.
- `shortcut` renders in `CommandShortcut` with one `kbd` per key, same classes as today's
  `root-view.tsx:L94`.
- No raw colours, no `font-semibold`, no off-scale size. Icons only from `@/components/icons`.
- Run `node scripts/check-design-tokens.mjs --format agent <file>` on every edited `.tsx`.

`index.ts` barrel exports: `CommandPalette`, `useCommandPalette`, and types `CommandPage`,
`CommandPaletteState`, `CommandPaletteProps`, `PaletteItem`, `PaletteProvider`, `PaletteQueryContext`,
`PaletteRequirement`, `PalettePerform`, `PalettePermissions`. Keep the "DO NOT export internal parts"
comment; `lib/` and `providers/` stay internal.

### Task 8 — i18n (`locales/en.json`, `locales/it.json`)

- Add `commandPalette.requiresPermission`: en `"Requires the {{permission}} permission"`,
  it `"Richiede il permesso {{permission}}"`.
- Remove `commandPalette.mediaLibrary` (only consumer was the dead row) and
  `commandPalette.settingsAll` only if it is no longer read (the navigation provider's "Settings…"
  row reuses it: keep it in that case). Remove no other key; every other `commandPalette.*` key keeps
  a reader in the new providers.

### Task 9 — Tests

All unit tier, `// @vitest-environment node` where no DOM is needed, SPDX header, double quotes,
`describe` = exported symbol. Permissions in pure tests are built with the real evaluator: wrap
`hydrateEffectivePermissions(payload)` (exported for tests, `use-permissions.ts:L24`) with core
`hasPermission` / `hasPermissionAnywhere` / `GLOBAL_SCOPE` in a local helper `permissionsFor(payload)`
declared inside the file (Rule 3.10: never mock a pure function). Seeds: `CANONICAL_SEEDS` from
`@beechcms/testing` (`posts`, `categories`), as `src/lib/tags-utils.test.ts:L12` does. `t` is a local
identity-like stub returning the key (with interpolated values appended), declared in the file.
Providers in the engine tests are small inline objects implementing `PaletteProvider` (test doubles of
the contract, not domain fixtures).

`features/command-palette/test/unit/collect-palette-items.test.ts` — `describe("collectPaletteItems")`
- only providers listing the current page contribute, in provider order then item order
- an item whose requirement fails is returned with the `describeMissing` text as `disabledReason`
- a requirement without scope is satisfied by the permission held on any one seed
- a requirement with `GLOBAL_SCOPE` is not satisfied by the same permission held on one seed only
- the second item with an already-seen id is dropped and the first is kept
- a provider that throws contributes no rows while the other providers' rows are returned
- with an empty permissions payload every item carrying a requirement is disabled

`…/rank-palette-items.test.ts` — `describe("rankPaletteItems")`
- a blank query returns every item in input order
- items the query does not match are dropped
- a keyword match ranks the item even when the label does not contain the query
- an exact label match ranks above a partial match
- equal scores keep input order
- a disabled item that matches is kept

`…/navigation-provider.test.ts` — `describe("createNavigationProvider")`
- with no authority only the Dashboard row and the "Settings…" row are emitted
- `view_analytics` on `*` adds the Analytics row and `manage_seeds` on `*` adds the Content Types row
- `content:read` on one seed adds Drafts and never emits a not-implemented page (create-new, scheduled)
- the "Settings…" row is absent while the query is non-empty
- no row navigates to `/media` (regression guard for the dead route)

`…/content-provider.test.ts` — `describe("createContentProvider")`
- a seed the caller cannot `content:read` emits no row on any page
- the idle root page caps "Go to" rows at five and adds "All content types…" only above five readable
  seeds (build the six-plus list by mapping `CANONICAL_SEEDS` to distinct slugs; comment why)
- a create-page row for a seed without `content:create` on that slug carries the requirement
- a seed with `dashboard.hidden` emits no row
- "New content…" is not emitted when no seed is readable
- item ids contain the slug and no translated text

`apps/dashboard/src/pages/palette-providers.test.ts` — two `describe`s:
- `createContentTypesProvider`: emits nothing without `manage_seeds` on `*`; never lists a system
  seed (`isSystemSeedSlug`); selecting "New content type" calls `openBuilder` with `SEED_INTENT_NEW`
- `createSettingsProvider`: the idle root page emits no rows; typing emits tab and section rows only
  for entries `getVisibleSettingsEntries` returns for those permissions; a section row's `run` calls
  `openSettings` with the section id

`features/command-palette/test/unit/command-palette.test.tsx` (jsdom, existing file):
- Render `<CommandPalette hostProviders={[]} />`. Extend the `@/features/shared` mock with `can`,
  `useSchema: () => ({ data: CANONICAL_SEEDS })`; keep the four existing tests unchanged in intent.
- add: with no authority the palette lists no content rows and no "New content…" row
- add: with `content:read` but not `content:create` on `posts`, the create page shows the posts row
  with `aria-disabled="true"` and the requirement text, and pressing Enter on it does not navigate
- add: a host provider's row appears on the root page and selecting it runs its `run` and closes the
  dialog

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

From the repo root unless stated:

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` (TypeScript 7 compiler; no output = pass)
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx apps/dashboard/src/features/command-palette/_parts/palette-list.tsx apps/dashboard/src/pages/app-command-palette.tsx`
- `pnpm beech test --diff` (exit 0 required; exit 2 means changed-line coverage below threshold)
- `pnpm --filter @beechcms/dashboard build`
- Graph re-check after the change: `graphify update . --force`, then
  `graphify path "CommandPalette()" "useSettingsDialog()"` must not return a path through
  `features/command-palette` files.
- Grep check: `grep -rn "@/features/\(settings\|seed-builder\)" apps/dashboard/src/features/command-palette`
  returns nothing.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `features/command-palette` imports no other feature slice except `@/features/shared`.
- [ ] `PaletteItem`, `PaletteProvider`, `PaletteQueryContext`, `PaletteRequirement`, `PalettePerform`,
      `PalettePermissions`, `ResolvedPaletteItem`, `CommandPaletteProps` match Section 4 verbatim.
- [ ] `CommandAction` no longer exists; `CommandPage` and `CommandPaletteState` are unchanged.
- [ ] Every item id follows `${providerId}:${key}` with no translated text.
- [ ] cmdk runs with `shouldFilter={false}`; ordering comes only from `rankPaletteItems`.
- [ ] Permission checks go through `usePermissions()` only; no new evaluator, no string compare on roles.
- [ ] A row failing its `requires` is visible, disabled, names the permission, and is not executable
      with Enter or click.
- [ ] No permission payload ⇒ no content, create, schema, analytics or search row.
- [ ] Seeds come from `useSchema()`; `SEED_REGISTRY` is no longer read by the palette.
- [ ] No row navigates to `/media`.
- [ ] Ctrl/Cmd+K, Alt+N (incl. macOS `e.code`), Backspace-on-empty and Escape-on-sub-page behave as before.
- [ ] Settings rows, bookmark rows and content-type rows behave as before for an account holding the
      permissions.
- [ ] Every user-visible string is a `t()` key present in both `en.json` and `it.json`.
- [ ] Design-token check clean on every edited `.tsx`.
- [ ] `tsc`, lint, `pnpm beech test --diff` and the dashboard build pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:
- Prefix routing, per-item score override, calculator, conversions, clipboard copy on Enter
  → roadmap entry 2 `BeechPalLocalTools`.
- Any change to `GET /api/search` or `SearchResultItem` → entry 3 `SearchResultMetadataApi`.
- Search as a root-page provider, async lane, request cancellation, row secondary actions, submenu,
  removal of the `search-results` page → entry 4 `BeechPalContentSearch`.
- Quick Notes → entry 5 `BeechPalQuickNotes`.
- Context actions, declaration contract in `features/shared`, confirm dialogs, media actions
  → entry 6 `BeechPalContextActions`.
- `>` system commands, language / notification toggles, keyboard-shortcuts row, recent items
  → entry 7 `BeechPalSystemCommands`.
- `users.ui_prefs`, any migration, `UserRepository` changes, preferences endpoints
  → entry 8 `UiPreferencesApi`.
- Pins → entry 9 `BeechPalPins`.
- Changes to `config/dashboard-menu.ts`, the sidebar, the settings registry, `use-command-palette.ts`
  or `_parts/search-results-view.tsx`.
- Any file in `packages/core` or `apps/api`.
