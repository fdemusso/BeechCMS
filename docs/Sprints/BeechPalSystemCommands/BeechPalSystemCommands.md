# Sprint Plan — BeechPalSystemCommands (BeechPal, roadmap entry 7)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 7; entry 7b split out at this planning).
Feature brief: `stages/00_ideation/output/feature_brief.md`, user stories "eseguire comandi di sistema
dalla palette", "commutare dalla palette le mie preferenze personali", "lista di scorciatoie … come voce
normale", "prefissi facoltativi"; business rules 1 (one execution path), 4 (visibility by permission),
5 (slice boundaries), 7 (prefix set: system commands, calculator, notes, content); §4 "Comandi e
impostazioni" and "Prefissi e tastiera".
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`,
`docs/Sprints/BeechPalContentSearch/`, `docs/Sprints/BeechPalRowActions/`,
`docs/Sprints/BeechPalQuickNotes/`, `docs/Sprints/BeechPalContextActions/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30257 nodes, 44375 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L114` | Engine. Gains `onOpenChange`, the shortcuts page and its provider. |
| `AppCommandPalette()` | `pages/app-command-palette.tsx:L18` | Composition root. Mounts the two new providers and their open-gated queries. |
| `PalettePrefix` / `CommandPage` | `features/command-palette/types.ts:L48`, `L13` | Gain `">"` and `"shortcuts"`. 14 and 17 dependants, all in the slice, the composition root or their tests. |
| `parsePaletteQuery()` | `lib/parse-palette-query.ts:L19` | Unchanged; the prefix table `PALETTE_PREFIXES` (L9) gains `">"`. |
| `createToolsProvider()` | `providers/tools-provider.ts:L10` | Gains the `>` prefix and the shortcuts row; `tools:theme` stays as is. |
| `useNotificationPrefs()` | `features/settings/hooks/use-settings.ts:L119` | Gains `enabled`. Read by the Notifications tab only. |
| `useSystemHealth()` | `features/dashboard/hooks/use-dashboard-stats.ts:L36` | Gains `enabled`. Read by `SystemHealth` and `SiteStatusWidget`. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. Every row reuses an existing route: `GET /api/content/stats/health`
  (`view_analytics` on `*`, `permission.middleware.ts:L128`) and `GET`/`PUT /api/settings/notifications`
  (`AUTHED`, L76–L77). Language and theme are browser-only.
- `apps/dashboard`:
  - `src/features/command-palette/` (engine): `>` prefix, `"shortcuts"` page, shortcut table and its
    provider, the tools row, the `onOpenChange` prop.
  - `src/features/settings/` (owner of preferences): the Language and Notifications tabs' handlers move
    into two exported hooks; the tabs use them; the notification switch list moves to `lib/`.
  - `src/features/dashboard/`: `useSystemHealth` takes `enabled`.
  - `src/pages/` (composition root): two providers in `palette-providers.ts`; wiring in
    `app-command-palette.tsx`; `createSettingsProvider` gains the `>` prefix.
  - `src/locales/en.json`, `it.json`: three new blocks under `commandPalette`, one placeholder.
- `docs/features/command-palette.md`: capabilities and the shortcuts table.

**c) `graphify affected` impact analysis**

```
graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts(+test)
graphify affected "AppCommandPalette()" --depth 2
- App.tsx, app.test.tsx (mocks the module: AppCommandPalette: () => null), main.tsx
graphify affected "createToolsProvider()" --depth 2
- command-palette.tsx, index.ts
graphify affected "PalettePrefix" --depth 2
- parse-palette-query.ts(+test), calculator-provider.test.ts, quick-notes-provider.test.ts,
  use-async-palette-items.test.tsx, App.tsx, app-command-palette.tsx, palette-providers.ts(+test),
  command-palette.tsx(+test)
graphify affected "CommandPage" --depth 2
- palette-footer.tsx, command-palette.tsx, parse-palette-query.ts, use-command-palette.ts,
  collect-palette-items.test.ts, content-provider.test.ts, use-async-palette-items.test.tsx,
  palette-providers.ts(+test), command-palette.test.tsx
graphify affected "useNotificationPrefs()" --depth 2
- notifications-tab.tsx(+structure test), use-settings.ts, settings-dialog.tsx
graphify affected "useSystemHealth()" --depth 2
- system-health.tsx, site-status-widget.tsx, system-health-adapter.tsx, site-status-adapters.tsx,
  builtin-widgets.tsx, widgets.ts, widget-lab.tsx
graphify affected "LanguageTab()" / "NotificationsTab()" --depth 2
- appearance-language.structure.test.tsx / notifications-tab.structure.test.tsx, settings-dialog.tsx(+test),
  settings-dialog-host.tsx, index.ts
graphify path "CommandPalette()" "useNotificationPrefs()"
  CommandPalette() --calls--> useMe() <--imports-- use-settings.ts --contains--> useNotificationPrefs()
  (shared useMe only: no direct edge)
```

Breaking-change verdict:
- `PalettePrefix` and `CommandPage` only gain members. `PLACEHOLDER: Record<CommandPage, string>`
  (`command-palette.tsx:L130`) and `PALETTE_PREFIXES: Record<PalettePrefix, true>` (`parse-palette-query.ts:L9`)
  fail tsc until the new member is added there. Both are intended, and both are part of this sprint.
- `useNotificationPrefs` and `useSystemHealth` gain an **optional** options object. Every current caller
  compiles unchanged and keeps fetching.
- `notifications-tab.structure.test.tsx:L13–L16` mocks `../hooks/use-settings` with only
  `useNotificationPrefs` and `useUpdateNotificationPrefs`. The extracted toggle hook therefore lives in
  its **own** file and imports those two from `./use-settings`. The mock then still applies, and the
  existing suite proves the tab kept its behaviour. A hook added to `use-settings.ts` itself would be
  `undefined` under that mock.
- `app.test.tsx` mocks `@/pages/app-command-palette`, `@/features/settings` and `@/features/dashboard` with
  fixed objects. The composition root is never rendered there, so its new imports cannot crash.
- `CommandPaletteProps` gains an **optional** `onOpenChange`. `command-palette.test.tsx:L84`
  `renderPalette` compiles unchanged.

Findings that shape the plan:
1. **Three of the four system commands do not exist.** Schema audit, seed export and automation logs
   have no endpoint. The seeds, schema and automations slices expose CRUD, orphans, FTS rebuild and MCP
   plan/apply. `GET /seeds/:slug` returns a definition, but no screen exports it. Brief rule 1 forbids a
   palette-only implementation, so they are out, as duplicate and revision history were in sprint 6. The
   one that exists is `GET /api/content/stats/health` (`stats.handler.ts:L338–L379`). It returns
   `{ storage: { used, limit, percentage }, database: { requests30d, limit, percentage }, status: 'healthy' | 'warning', lastUpdate }`.
   The dashboard reads it through `useSystemHealth`. There is no "Worker" metric, so the row is called
   **System status** and shows what the endpoint measures.
2. **Platform settings already open their page.** `createSettingsProvider` (`palette-providers.ts:L23`)
   lists every visible tab, Site (`manage_users` on `*`) and Storage (`view_analytics` on `*`) included,
   through the registry's own gates. SMTP, Turnstile and backup tabs do not exist
   (`settings-registry.ts:L81–L146`). The only change is that the provider also answers the `>` prefix.
3. **One path for preferences, through the composition root.**
   - Language: the tab's handler is `i18n.changeLanguage` plus a toast (`language-tab.tsx:L22–L25`).
   - Notifications: the tab's handler merges the key, calls `mutateAsync`, then toasts saved or error
     (`notifications-tab.tsx:L21–L30`).

   Both live in `features/settings`, which the palette may not import. Both move into exported hooks
   that the tabs and `AppCommandPalette` call. Theme already runs through `useTheme` inside the slice
   (`command-palette.tsx:L139–L141`) and stays there.
4. **Queries only while the palette is open.** Rows that show current state (notification on/off, the
   status summary) need data. `useCommandPalette()` keeps `open` in local state
   (`use-command-palette.ts:L9`), so the composition root cannot read it. Without a signal it would
   fetch on every page load. Worse, `/stats/health` answers 403 to anyone without `view_analytics`.
   The engine reports open/close through an optional `onOpenChange`. The root enables
   `useNotificationPrefs` while open, and `useSystemHealth` while open and only for `view_analytics` on `*`.
   Both keep their 5-minute `staleTime`, so reopening within it costs no request.
5. **Shortcuts as data, prefixes typed.** The global keys are Mod+K and Alt+N (`use-command-palette.ts:L45–L62`)
   and Mod+B (`components/ui/sidebar.tsx:L30`, `L113`). The palette keys are Enter, Mod+Enter, Shift+Enter
   (`lib/palette-key-binding.ts`), Backspace on an empty input (`use-command-palette.ts:L68`) and Escape.
   The prefix descriptions are a `Record<PalettePrefix, …>`, so tsc rejects a future prefix that has
   no shortcut row.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** Cut:
  - schema audit, seed export and automation logs (no feature exists, finding 1);
  - recent items (moved to roadmap entry 7b: a recording hook and an id resolver this sprint does not need);
  - a palette-level confirm on toggles (none is destructive);
  - rows that apply a prefix or replay a shortcut;
  - a toggle for list density (Appearance › Lists) or for any platform setting (brief §5).

  What stays answers a named user story with existing paths: two hook extractions, two `enabled`
  options, one optional prop, one provider each for preferences, status and shortcuts. **No VETO.**
- **Rule 2, Botanical invariant.** No data access added. Every write goes through the settings slice's
  existing mutation (`useUpdateNotificationPrefs`), and every read through existing queries. **Respected.**
- **Rule 3, VSA.**
  - The palette slice imports neither `features/settings` nor `features/dashboard`.
  - The composition root (`src/pages/`) imports their public `index.ts` only, as it already does for
    settings and seed-builder (`palette-providers.ts:L9–L16`).
  - `graphify path` shows no edge from the palette to the settings hooks.

  **Respected.**
- **Rule 4, Cloudflare purity.** Nothing server side. **Respected.**
- **Rule 5, minimal blueprint.** Core 0, api 0. Dashboard: 3 slices plus the composition root.
  - New: 5 source files, 4 test files.
  - Edited: 11 source files, 3 test files.
  - Also: 2 locale files, 1 doc.

  **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–6 made the palette the place to reach every screen, content entry, computed value, note and
page action. Two parts of the brief remain without a surface: the developer's system commands and the
user's personal preferences. Without them, the "`>`" prefix promised by rule 7 routes nowhere, and the
shortcuts that make the palette keyboard-first are discoverable only by reading the docs.

This sprint adds no new mechanism to the engine except one notification prop and one page. It reuses
the prefix router (sprint 2), `requires` and `unavailableReason` (sprints 1 and 5), and the composition
root (sprint 1). That is why it comes before the per-user features (7b recent items, 8–9 pins). Those
add storage and resolution, which this sprint does not need.

VSA holds because preferences stay owned by the settings slice: the tabs and the palette run the same
exported hooks, so brief rule 1 is met by construction and checked by the tabs' existing suites.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 6 (`BeechPalContextActions`, review PASS) is still uncommitted on
`feature/beechpal-context-actions` (HEAD `1dcf32bc`). The human commits it; the executor branches
`feature/beechpal-system-commands` from that commit. Line numbers below are as of that working tree.

**Palette contract** (`features/command-palette/types.ts`):
- `CommandPage`: `root`, `seeds`, `create`, `settings`, `edit-schema`, `actions` (L13–L19);
- `PalettePrefix = "=" | "/" | "#"` (L48);
- `PalettePerform.page` excludes only `actions` (L53);
- `PaletteItem.shortcut` holds display-only key caps (L78–L79), rendered as `Kbd` in
  `_parts/palette-list.tsx:L52–L60`;
- `PaletteProvider.prefix`: a provider declaring it still answers un-prefixed queries (L112–L116).

**Routing** (`lib/collect-palette-items.ts:L14–L20`): with a prefix typed, only providers declaring it
contribute. Several providers may declare the same prefix. `parsePaletteQuery` strips the prefix and
trims (`lib/parse-palette-query.ts:L19–L30`).

**Engine** (`command-palette.tsx`):
- props `{ hostProviders }` (L61–L64);
- `useCommandPalette()` gives `open` (L118–L120);
- `PLACEHOLDER: Record<CommandPage, string>` (L130–L137);
- theme toggle (L139–L141);
- providers memo, idle order context, navigation, content, host, notes, tools (L157–L177);
- `runPerform` closes after `navigate`, `run`, `copy` and pushes on `page` (L217–L235).

**Tools provider** (`providers/tools-provider.ts:L10–L31`): one row, `tools:theme`, on `root`, idle and
typing, no prefix.

**Composition root**:
- `pages/app-command-palette.tsx:L18–L34`: builds `hostProviders` with `createContentTypesProvider` and
  `createSettingsProvider`;
- `pages/palette-providers.ts:L23–L71`: settings provider, `id: "settings"` (L30), `pages` (L31), returns
  nothing idle on root (L33).

**Settings slice**:
- `components/language-tab.tsx`: `LANG_OPTIONS` (L13–L16); `handleLangChange` = `changeLanguage`, then a
  toast `settings.interface.langChangedIt` / `…En` (L22–L25); value `i18n.resolvedLanguage ?? i18n.language` (L32);
- `components/notifications-tab.tsx`: `handleChange` (L21–L30) toasts `settings.notifications.saved` /
  `.error`; `ITEMS` with `id`, `key`, `fallback`, `text` (L34–L39); `isLoading` skeleton (L48);
- `hooks/use-settings.ts`: `useNotificationPrefs` (L119–L125, `staleTime` 5 min);
  `useUpdateNotificationPrefs` (L127–L133);
- `index.ts:L5–L12`: public API (dialog, registry helpers, `useSettingsDialog`, three settings hooks, query keys);
- `types/settings.types.ts:L11`: `NotificationPrefs`.

**Dashboard slice**: `useSystemHealth` (`hooks/use-dashboard-stats.ts:L36–L42`, `staleTime` 5 min);
`SystemHealth` type (`types/dashboard.types.ts:L14`); both re-exported by `features/dashboard/index.ts`.

**Platform helpers**: `MOD_KEY_LABEL` (`lib/platform.ts`) is `⌘` on Apple devices and `Ctrl` elsewhere.

**Icons** (`@/components/icons` re-exports `reicon-react`): `Keyboard`, `Language`, `Bell`, `Pulse`,
`Sun`, `Moon` exist.

**Locale keys already present**: `common.loading`, `common.copyFailed`, `commandPalette.tools`,
`commandPalette.changeTheme`, `settings.interface.langChangedIt/En`, `settings.notifications.saved/error`,
`settings.notifications.<event>.label`.

**Tests**:
- `features/command-palette/test/unit/command-palette.test.tsx`: barrel mock (L31–L40), `@/lib/theme`
  mock (L47–L51), `renderPalette` (L84);
- `pages/palette-providers.test.ts`: node, `permissionsFor(payload)` (L25–L32), `t` stub (L34–L35),
  `runItem` (L39–L42);
- `features/settings/components/notifications-tab.structure.test.tsx` and
  `appearance-language.structure.test.tsx`: tab behaviour, including the `changeLanguage` spy.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/dashboard/src/features/command-palette/lib/palette-shortcuts.ts`: shortcut table.
- `apps/dashboard/src/features/command-palette/providers/shortcuts-provider.ts`
- `apps/dashboard/src/features/settings/hooks/use-dashboard-language.ts`
- `apps/dashboard/src/features/settings/hooks/use-notification-pref-toggle.ts`
- `apps/dashboard/src/features/settings/lib/notification-pref-items.ts`
- `apps/dashboard/src/features/command-palette/test/unit/tools-provider.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/shortcuts-provider.test.ts`
- `apps/dashboard/src/features/settings/hooks/use-notification-pref-toggle.test.tsx`
- `apps/dashboard/src/features/settings/hooks/use-dashboard-language.test.tsx`

Edit:
- `apps/dashboard/src/features/command-palette/types.ts`: `">"`, `"shortcuts"`.
- `apps/dashboard/src/features/command-palette/lib/parse-palette-query.ts`: `">"` in `PALETTE_PREFIXES`.
- `apps/dashboard/src/features/command-palette/providers/tools-provider.ts`
- `apps/dashboard/src/features/command-palette/command-palette.tsx`
- `apps/dashboard/src/features/settings/components/language-tab.tsx`
- `apps/dashboard/src/features/settings/components/notifications-tab.tsx`
- `apps/dashboard/src/features/settings/hooks/use-settings.ts`: `enabled` on `useNotificationPrefs`.
- `apps/dashboard/src/features/settings/index.ts`
- `apps/dashboard/src/features/dashboard/hooks/use-dashboard-stats.ts`: `enabled` on `useSystemHealth`.
- `apps/dashboard/src/pages/palette-providers.ts`
- `apps/dashboard/src/pages/app-command-palette.tsx`
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`
- `apps/dashboard/src/features/command-palette/test/unit/parse-palette-query.test.ts`: cases added.
- `apps/dashboard/src/features/command-palette/test/unit/command-palette.test.tsx`: cases added.
- `apps/dashboard/src/pages/palette-providers.test.ts`: cases added.
- `docs/features/command-palette.md`

Not touched: `apps/api`, `packages/*`, `collect-palette-items.ts`, `rank-palette-items.ts`,
`use-command-palette.ts`, `use-async-palette-items.ts`, `_parts/*`, every other palette provider,
`settings-registry.ts`, `settings-dialog.tsx`, every dashboard widget, `App.tsx`, `lib/theme.tsx`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Contract: `>` prefix and `"shortcuts"` page (`types.ts`, `parse-palette-query.ts`)**

```ts
export type CommandPage =
  | "root"
  | "seeds"
  | "create"
  | "settings"
  | "edit-schema"
  | "shortcuts"
  | "actions" // Engine-owned: reached only through openActions, never declared by a provider

export type PalettePrefix = "=" | "/" | "#" | ">"
```

- `PALETTE_PREFIXES` gains `">": true`. Nothing else in the parser changes: `>` alone yields
  `{ prefix: ">", text: "" }`, `> theme` yields `{ prefix: ">", text: "theme" }`, and a sub-page never
  parses a prefix.
- `"shortcuts"` is reachable through `PalettePerform` `page` (it is not `actions`).

**Task 2 — Shortcut table (`lib/palette-shortcuts.ts`, new)**

```ts
import type { PalettePrefix } from "../types"

/** One key combination the dashboard reacts to. Display data only: nothing here binds a key. */
export interface PaletteShortcut {
  /** Stable; the row id is `shortcuts:<id>`. */
  readonly id: string
  readonly group: "global" | "palette"
  /** Locale key of the description. */
  readonly labelKey: string
  /** Key caps in order; the literal "Mod" stands for the platform modifier (⌘ or Ctrl). */
  readonly keys: readonly string[]
}

export const MOD_KEY = "Mod"

export const PALETTE_SHORTCUTS: readonly PaletteShortcut[]

/** One description per routing prefix, in display order. `Record` makes tsc reject a prefix without one. */
export const PREFIX_LABEL_KEYS: Readonly<Record<PalettePrefix, string>>
```

`PALETTE_SHORTCUTS`, in this order (each verified in Pre-Computation finding 5):

| id | group | keys | labelKey |
|----|-------|------|----------|
| `toggle-palette` | global | `Mod`, `K` | `commandPalette.shortcuts.togglePalette` |
| `quick-create` | global | `Alt`, `N` | `commandPalette.shortcuts.quickCreate` |
| `toggle-sidebar` | global | `Mod`, `B` | `commandPalette.shortcuts.toggleSidebar` |
| `run` | palette | `↵` | `commandPalette.shortcuts.run` |
| `first-action` | palette | `Mod`, `↵` | `commandPalette.shortcuts.firstAction` |
| `row-actions` | palette | `⇧`, `↵` | `commandPalette.shortcuts.rowActions` |
| `back` | palette | `⌫` | `commandPalette.shortcuts.back` |
| `close` | palette | `Esc` | `commandPalette.shortcuts.close` |

`PREFIX_LABEL_KEYS`, written in this key order:
- `">"` → `commandPalette.shortcuts.prefixSystem`
- `"="` → `commandPalette.shortcuts.prefixCalculator`
- `"#"` → `commandPalette.shortcuts.prefixNotes`
- `"/"` → `commandPalette.shortcuts.prefixContent`

`Alt` is the literal the content provider already shows for Alt+N (`content-provider.ts`, `content:new`).

**Task 3 — Shortcuts provider (`providers/shortcuts-provider.ts`, new)**

```ts
/** The keyboard reference page: global keys, palette keys and every prefix. Enter on a row closes the palette. */
export function createShortcutsProvider(deps: { t: TFunction }): PaletteProvider
```

- `id: "shortcuts"`, `pages: ["shortcuts"]`, no `prefix`. The query is ignored (the engine ranks lexically).
- One row per `PALETTE_SHORTCUTS` entry, in table order:
  - `id: shortcuts:<id>`;
  - `section`: `commandPalette.shortcuts.global` or `commandPalette.shortcuts.palette`;
  - `label`: `t(labelKey)`, `icon: Keyboard`;
  - `shortcut`: `keys` with each `MOD_KEY` replaced by `MOD_KEY_LABEL` from `@/lib/platform`.
- Then one row per `PREFIX_LABEL_KEYS` entry, in key order:
  - `id: shortcuts:prefix:<prefix>`;
  - `section`: `commandPalette.shortcuts.prefixes`;
  - `label`: `t(labelKey)`, `icon: Keyboard`, `shortcut: [prefix]`.
- `perform` on every row: `{ kind: "run", run: closePalette }`, with `closePalette` a module-level
  no-op. The engine's `run` branch closes the palette, so the user lands where the shortcut applies.
- No `requires`, no `actions`, no `score`. The provider is pure.

**Task 4 — Tools provider (`providers/tools-provider.ts`)**

- Add `prefix: ">"`, so theme and shortcuts answer `>`.
- After `tools:theme` (unchanged: id, label, icon, keywords, perform), add:
  - `id: "tools:shortcuts"`, `section` the same tools section;
  - `label: t("commandPalette.shortcuts.title")`, `icon: Keyboard`;
  - `keywords: ["shortcuts", "scorciatoie", "keyboard", "tastiera", "tasti", "keys", "hotkeys", "prefix", "prefissi"]`;
  - `perform: { kind: "page", page: "shortcuts" }`.
- Both rows show idle and while typing, as the theme row does today. The brief asks that shortcuts are
  "consultabile come voce normale".
- Update the doc comment to "The theme toggle and the keyboard shortcuts page."

**Task 5 — Engine (`command-palette.tsx`)**

```ts
export interface CommandPaletteProps {
  /** Providers assembled outside the slice (composition root); rendered after the built-ins. */
  readonly hostProviders: readonly PaletteProvider[]
  /** Told after the palette opens or closes, so the composition root can fetch only while it is open. The palette stays uncontrolled. */
  readonly onOpenChange?: (open: boolean) => void
}
```

- An effect calls `onOpenChange?.(open)` whenever `open` changes (and once on mount with `false`).
  The callback is in the dependencies; a parent passing a state setter keeps it stable.
- `PLACEHOLDER` gains `shortcuts: t("commandPalette.placeholderShortcuts")`.
- Providers memo: append `createShortcutsProvider({ t })` after `createToolsProvider`. It serves only the
  `shortcuts` page, so its position changes no other order. Update the L157 comment to mention it.
- Nothing else changes: `>` routing, Backspace and Escape on the shortcuts page, and the back hint in
  the footer (`palette-footer.tsx`, any page other than root) already work.

**Task 6 — Settings: language hook (`hooks/use-dashboard-language.ts`, new; `language-tab.tsx`)**

```ts
/** Dashboard UI languages, each named in itself. */
export const DASHBOARD_LANGUAGES = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
] as const

export type DashboardLanguage = (typeof DASHBOARD_LANGUAGES)[number]['value']

export interface DashboardLanguageControl {
  /** `i18n.resolvedLanguage`, else `i18n.language`. */
  readonly language: string
  /** The Language tab's path: switches i18next, then shows the tab's confirmation toast. */
  readonly setLanguage: (language: DashboardLanguage) => void
}

export function useDashboardLanguage(): DashboardLanguageControl
```

- `setLanguage` holds exactly the body of `handleLangChange` (`language-tab.tsx:L22–L25`), stable across
  renders (`useCallback` over `i18n` and `t`).
- `LanguageTab` drops `LANG_OPTIONS` and `handleLangChange`. It maps `DASHBOARD_LANGUAGES` and passes the
  RadioGroup value to `setLanguage` after finding it in `DASHBOARD_LANGUAGES`; an unknown value is ignored.
  The tab's markup, ids and `lang` attributes are unchanged.
- Single quotes, as the rest of `features/settings`.

**Task 7 — Settings: notification toggle (`lib/notification-pref-items.ts`, `hooks/use-notification-pref-toggle.ts`, new; `use-settings.ts`; `notifications-tab.tsx`)**

```ts
// lib/notification-pref-items.ts
import type { NotificationPrefs } from '../types/settings.types'

/** One notification switch: shared by the Notifications tab and the command palette. */
export interface NotificationPrefItem {
  /** DOM id of the tab's switch. */
  readonly id: string
  readonly key: keyof NotificationPrefs
  /** The value shown while the server holds none for the key. */
  readonly fallback: boolean
  /** Locale stem under `settings.notifications`, e.g. "contentCreate". */
  readonly text: string
}

export const NOTIFICATION_PREF_ITEMS: readonly NotificationPrefItem[]
```

The values are the four rows of `notifications-tab.tsx:L34–L39`, same order.

```ts
// hooks/use-notification-pref-toggle.ts
export interface NotificationPrefToggle {
  /** undefined until loaded, and after a failed load. */
  readonly prefs: NotificationPrefs | undefined
  readonly isLoading: boolean
  readonly isError: boolean
  /** A save is in flight. */
  readonly isSaving: boolean
  /** The tab's path: merges `key` into the loaded prefs, saves, toasts saved or error. Does nothing before the prefs load. */
  readonly setPref: (key: keyof NotificationPrefs, value: boolean) => Promise<void>
}

/** `enabled: false` keeps the query idle (default true). */
export function useNotificationPrefToggle(options?: { readonly enabled?: boolean }): NotificationPrefToggle
```

- Imports `useNotificationPrefs` and `useUpdateNotificationPrefs` from `./use-settings`. Keep this hook out
  of `use-settings.ts` (Pre-Computation, breaking-change verdict).
- `setPref` holds exactly the body of `handleChange` (`notifications-tab.tsx:L21–L30`): it reads the
  current `prefs`, merges, awaits `mutateAsync`, then toasts `settings.notifications.saved` or `.error`.
  It never rethrows.
- The returned object is memoised over `prefs`, the three flags and `setPref`, so the composition root's
  providers memo does not recompute on unrelated renders.
- `useNotificationPrefs(options?: { readonly enabled?: boolean })` passes `enabled: options?.enabled ?? true`
  to `useQuery`. Nothing else in it changes.
- `NotificationsTab` uses `useNotificationPrefToggle()` and `NOTIFICATION_PREF_ITEMS`. It reads `prefs`,
  `isLoading` and `isSaving` (in place of `updatePrefs.isPending`), and each switch calls `setPref`. The
  markup, ids, skeleton and `aria-busy` are unchanged.

**Task 8 — Settings public API (`features/settings/index.ts`)**

Add:
- `export { DASHBOARD_LANGUAGES, useDashboardLanguage } from './hooks/use-dashboard-language'`
- `export type { DashboardLanguage, DashboardLanguageControl } from './hooks/use-dashboard-language'`
- `export { useNotificationPrefToggle } from './hooks/use-notification-pref-toggle'`
- `export type { NotificationPrefToggle } from './hooks/use-notification-pref-toggle'`
- `export { NOTIFICATION_PREF_ITEMS } from './lib/notification-pref-items'`

**Task 9 — Dashboard slice (`hooks/use-dashboard-stats.ts`)**

`useSystemHealth(options?: { readonly enabled?: boolean })` passes `enabled: options?.enabled ?? true`.
`SystemHealth`, `SiteStatusWidget` and the adapters keep calling it without arguments.

**Task 10 — Composition-root providers (`pages/palette-providers.ts`)**

```ts
/** Personal preferences toggled in place (dashboard language, notification switches), through the settings tabs' own paths. */
export function createPreferencesProvider(deps: {
  t: TFunction
  /** The resolved dashboard language, e.g. "it". */
  language: string
  setLanguage: (language: DashboardLanguage) => void
  notifications: NotificationPrefToggle
}): PaletteProvider

/** The system status, for people who may read infrastructure stats (`view_analytics` on `*`); absent for everyone else. */
export function createSystemStatusProvider(deps: {
  t: TFunction
  health: { readonly data: SystemHealth | undefined; readonly isError: boolean }
}): PaletteProvider
```

Common rules for both: `pages: ["root"]`, `prefix: ">"`. On the root page they emit nothing unless the
query is non-empty or the prefix is `>`. The brief's idle root is pins, recents and navigation, and these
rows are found by typing or by `>`.

`createPreferencesProvider` (`id: "prefs"`, section `commandPalette.preferences.section`):
- Language: one row per `DASHBOARD_LANGUAGES` entry whose `value` is not `language`, in list order.
  - `id: prefs:language:<value>`, `icon: Language`;
  - `label: t("commandPalette.preferences.switchLanguage", { language: entry.label })`;
  - `keywords: ["lingua", "language", entry.value, entry.label]`;
  - `perform: run → setLanguage(entry.value)`.
- Notifications: one row per `NOTIFICATION_PREF_ITEMS` entry, in list order.
  - `id: prefs:notify:<key>`, `icon: Bell`;
  - `label: t("commandPalette.preferences.notify", { event: t("settings.notifications.<text>.label") })`;
  - `keywords: ["notifiche", "notifications", "avvisi", "alerts"]`.
  - `current = prefs[key] ?? fallback`. Once `prefs` is loaded, `description` is
    `commandPalette.preferences.on` / `.off` for `current`, and `perform: run → void setPref(key, !current)`.
  - `unavailableReason`, first that applies:
    - `prefs === undefined && isError` → `commandPalette.preferences.notifyUnavailable`;
    - `prefs === undefined` → `common.loading` (this covers the window before the query starts);
    - `isSaving` → `commandPalette.preferences.saving`.

    While unavailable, `perform` is `run` with a no-op; the row is disabled, so it never runs.
- No `requires`: every user owns their own preferences (`AUTHED`, `permission.middleware.ts:L76–L77`).

`createSystemStatusProvider` (`id: "system"`, section `commandPalette.system.section`):
- `!permissions.canGlobally("view_analytics")` → no row (brief §4: diagnostics appear only for the
  relevant role; same gate as the Storage tab and the route table L128).
- One row:
  - `id: "system:status"`, `label: t("commandPalette.system.status")`, `icon: Pulse`;
  - `keywords: ["status", "stato", "health", "salute", "worker", "quota", "storage", "database", "d1", "r2"]`.
- With `data`:
  - `description: t(data.status === "healthy" ? "commandPalette.system.statusHealthy" : "commandPalette.system.statusWarning", { storage: data.storage.percentage, database: data.database.percentage })`;
  - `perform: { kind: "copy", value: <that description> }`. Enter copies it, like a computed row.
  - The verdict is prose, not a badge. `StatusBadge` is for content and job statuses (design rule 3),
    and this row uses no colour.
- Without `data`: `unavailableReason` is `commandPalette.system.statusUnavailable` when `isError`, else
  `common.loading`, and `perform` is `copy` of `""` (never run: the row is disabled).

`createSettingsProvider`: add `prefix: ">"` (finding 2). Its rows and gates are unchanged; idle on root it
still emits nothing (L33), so `>` alone lists preferences, status, theme and shortcuts, and `> stor` adds
the Storage tab.

**Task 11 — Wiring (`pages/app-command-palette.tsx`)**

- `const [paletteOpen, setPaletteOpen] = React.useState(false)`.
- `const { canGlobally } = usePermissions()` from `@/features/shared`.
- `const { language, setLanguage } = useDashboardLanguage()`.
- `const notifications = useNotificationPrefToggle({ enabled: paletteOpen })`.
- `const health = useSystemHealth({ enabled: paletteOpen && canGlobally("view_analytics") })`. Pass
  `{ data: health.data, isError: health.isError }` memoised over those two values.
- `hostProviders` memo, in this order: content types, settings, preferences, system status. Add the new
  values to its dependencies.
- Render `<CommandPalette hostProviders={hostProviders} onOpenChange={setPaletteOpen} />`.
- Update the file's doc comment: "wired to the settings, dashboard and content type builder slices."

**Task 12 — Locale keys (`en.json` / `it.json`)**

New flat key `commandPalette.placeholderShortcuts`, and three new nested blocks `commandPalette.preferences`,
`commandPalette.system`, `commandPalette.shortcuts`, next to `commandPalette.context`.

| Key | en | it |
|-----|----|----|
| `placeholderShortcuts` | `Filter shortcuts…` | `Filtra le scorciatoie…` |
| `preferences.section` | `Preferences` | `Preferenze` |
| `preferences.switchLanguage` | `Switch the dashboard to {{language}}` | `Passa la dashboard a {{language}}` |
| `preferences.notify` | `Notifications: {{event}}` | `Notifiche: {{event}}` |
| `preferences.on` | `On` | `Attive` |
| `preferences.off` | `Off` | `Disattivate` |
| `preferences.notifyUnavailable` | `Your notification preferences could not be loaded` | `Impossibile caricare le preferenze di notifica` |
| `preferences.saving` | `Saving your preferences…` | `Salvataggio delle preferenze…` |
| `system.section` | `System` | `Sistema` |
| `system.status` | `System status` | `Stato del sistema` |
| `system.statusHealthy` | `Within quotas · Storage {{storage}}% · Database {{database}}%` | `Entro le quote · Storage {{storage}}% · Database {{database}}%` |
| `system.statusWarning` | `Close to a quota · Storage {{storage}}% · Database {{database}}%` | `Vicino a una quota · Storage {{storage}}% · Database {{database}}%` |
| `system.statusUnavailable` | `The system status could not be read` | `Impossibile leggere lo stato del sistema` |
| `shortcuts.title` | `Keyboard shortcuts` | `Scorciatoie da tastiera` |
| `shortcuts.global` | `Anywhere` | `Ovunque` |
| `shortcuts.palette` | `In the palette` | `Nella palette` |
| `shortcuts.prefixes` | `Prefixes` | `Prefissi` |
| `shortcuts.togglePalette` | `Open or close the palette` | `Apri o chiudi la palette` |
| `shortcuts.quickCreate` | `Create content` | `Crea un contenuto` |
| `shortcuts.toggleSidebar` | `Show or hide the sidebar` | `Mostra o nascondi la barra laterale` |
| `shortcuts.run` | `Run the selected row` | `Esegui la riga selezionata` |
| `shortcuts.firstAction` | `Run the row's first action` | `Esegui la prima azione della riga` |
| `shortcuts.rowActions` | `Show the row's actions` | `Mostra le azioni della riga` |
| `shortcuts.back` | `Go back (empty input)` | `Torna indietro (campo vuoto)` |
| `shortcuts.close` | `Go back or close` | `Torna indietro o chiudi` |
| `shortcuts.prefixSystem` | `System commands and preferences` | `Comandi di sistema e preferenze` |
| `shortcuts.prefixCalculator` | `Calculator` | `Calcolatrice` |
| `shortcuts.prefixNotes` | `Quick notes` | `Note rapide` |
| `shortcuts.prefixContent` | `Search content only` | `Cerca solo nei contenuti` |

(All keys above are under `commandPalette.`)

**Task 13 — Docs (`docs/features/command-palette.md`)**

- Key Capabilities: replace the stale "Quick Administration" bullet (it names automations, which the
  palette does not offer) with:
  - **System commands (`>`)**: type `>` to list your preferences and system commands: switch the
    dashboard language, turn each notification on or off, change theme, open the keyboard shortcuts.
    People who may read infrastructure stats also see the system status (storage and database quota
    use); Enter copies it. Typing a settings tab name after `>` opens that tab.
  - **Keyboard shortcuts**: a normal row (also idle) that lists the global keys, the palette keys and the
    four prefixes.
- Keyboard Shortcuts table: add Alt+N (open the palette on *Create content*) and ⌘/Ctrl+B (show or hide
  the sidebar), and one row per prefix (`>`, `=`, `#`, `/`) with its description from Task 12.

**Task 14 — Tests**

Fixtures:
- permissions through `permissionsFor` (`palette-providers.test.ts:L25–L32`) for composition-root
  cases, or literal `PalettePermissions` stubs in slice node suites, as `navigation-provider.test.ts`
  does;
- health data typed as `SystemHealth` with the response shape of finding 1;
- notification prefs literal `{ contentCreate: true, contentUpdate: true, contentDelete: false }`, with
  `mediaUpload` deliberately missing to exercise its fallback (comment the omission, Rule 6.2.3);
- `t`: the identity-with-params stub already used by the file being edited, or by `quick-notes-provider.test.ts`
  for new node files;
- handlers are `vi.fn()`.

`features/command-palette/test/unit/tools-provider.test.ts`, unit, `// @vitest-environment node`.
`describe("createToolsProvider")`:
- `it` keeps the theme row as tools:theme and runs toggleTheme on it. Regression guard: the id is a pin
  key (roadmap 9).
- `it` lists a keyboard shortcuts row that opens the shortcuts page.
- `it` answers the > prefix.

`features/command-palette/test/unit/shortcuts-provider.test.ts`, unit, `// @vitest-environment node`.
`describe("createShortcutsProvider")`:
- `it` serves only the shortcuts page.
- `it` lists the global keys, then the palette keys, then the prefixes, each under its own section.
- `it` has one row for every routing prefix (array-driven over `Object.keys(PALETTE_PREFIXES)`).
  Regression guard: a new prefix must be documented on this page.
- `it` renders Mod as the platform modifier label and never as the literal "Mod".
- `it` gives every row a run perform and no requirement, so Enter only closes the palette.

`features/command-palette/test/unit/parse-palette-query.test.ts`, edit. Add:
- `it` routes > to the system prefix with the rest trimmed.
- `it` > alone yields the system prefix and empty text.

`features/settings/hooks/use-notification-pref-toggle.test.tsx`, unit (happy-dom, `renderHook` inside a
fresh `QueryClientProvider` per test).
- Mocks at the top: `../api/settings.api`, with `settingsApi.getNotifications` and
  `updateNotifications` as `vi.fn()`, and `sonner`.

`describe("useNotificationPrefToggle")`:
- `it` setPref saves the loaded prefs with only that key changed.
- `it` a successful save shows the saved toast.
- `it` a failed save shows the error toast and does not throw.
- `it` setPref before the prefs load saves nothing.
- `it` with enabled false never requests the prefs.

`features/settings/hooks/use-dashboard-language.test.tsx`, unit (happy-dom, `renderHook`, real
`@/lib/i18n` with `changeLanguage` spied, as `appearance-language.structure.test.tsx:L73` does; `sonner`
mocked). `describe("useDashboardLanguage")`:
- `it` setLanguage switches i18next to the given language and shows the matching toast.
- `it` reports the resolved language.

`pages/palette-providers.test.ts`, edit. `describe("createPreferencesProvider")`:
- `it` emits nothing on the idle root without a prefix.
- `it` with the > prefix lists one row per other language, then one row per notification switch.
- `it` the language row switches through setLanguage to its language.
- `it` a notification row shows its current value and saves the opposite (array-driven over the four items).
- `it` a key the server has not stored shows its fallback.
- `it` while the prefs are not loaded every notification row is disabled with the loading reason.
- `it` after a failed load every notification row is disabled with the unavailable reason.
- `it` while a save is in flight every notification row is disabled with the saving reason.

`describe("createSystemStatusProvider")`:
- `it` emits nothing without view_analytics on *, even when it is granted on a seed.
- `it` emits nothing on the idle root without a prefix.
- `it` describes the quotas and copies that description on Enter (array-driven: healthy, warning → key).
- `it` is disabled with the loading reason before data and with the unavailable reason after an error.

`describe("createSettingsProvider")`, add:
- `it` answers the > prefix.

`features/command-palette/test/unit/command-palette.test.tsx`, edit. Existing cases untouched. Add:
- `it` tells onOpenChange true when the palette opens and false when it closes.
- `it` Enter on the keyboard shortcuts row opens the shortcuts page with the prefix rows.
- `it` Enter on a shortcut row closes the palette.
- `it` with the > prefix the tools rows are listed and the navigation rows are not.

The existing `notifications-tab.structure.test.tsx`, `appearance-language.structure.test.tsx` and
`settings-dialog.test.tsx` must pass **unedited**: they are the proof that the tabs kept their path
(brief rule 1).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`:
  `npx vitest run src/features/command-palette src/features/settings src/features/dashboard src/features/shared src/pages src/test/cross-slice`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx apps/dashboard/src/features/settings/components/language-tab.tsx apps/dashboard/src/features/settings/components/notifications-tab.tsx apps/dashboard/src/pages/app-command-palette.tsx`
- `pnpm --filter @beechcms/dashboard build`
- `pnpm beech test --diff`. This sprint touches no `packages/` or `apps/api` file. A `packages/core`
  "no tests were run" failure from earlier stacked sprints is known (sprint 6 review) and not caused here.
- `graphify update . --force`. Then:
  - `graphify path "CommandPalette()" "useNotificationPrefs()"` must show no direct edge from the
    palette slice (only shared or composition-root hops);
  - grep `apps/dashboard/src/features/command-palette` for `@/features/settings` and
    `@/features/dashboard`: zero matches.
- Manual gate (human, dev stack):
  - type `>`: Preferences (language, four notification switches with On/Off), Tools (theme, keyboard
    shortcuts) and, as admin, System status with the quota summary;
  - Enter on a notification row: the palette closes and the "Notification preferences saved" toast
    appears. Reopening shows the flipped value, and Settings › Notifications agrees;
  - Enter on "Switch the dashboard to English": the UI language changes with the same toast as the tab;
  - Enter on System status copies the summary; as an editor without `view_analytics`, `>` shows no
    System status row, and the network panel shows no `/stats/health` request;
  - with the palette closed, no `/settings/notifications` request is made on page load;
  - Keyboard shortcuts lists the three groups; Backspace on the empty input returns to root;
  - `> stor` lists the Storage settings tab for an admin.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `CommandPage` includes `"shortcuts"`; `PalettePrefix` includes `">"`; `PALETTE_PREFIXES` lists it.
- [ ] `PaletteShortcut`, `MOD_KEY`, `PALETTE_SHORTCUTS` and `PREFIX_LABEL_KEYS` match Section 4; the
      table matches Task 2.
- [ ] `createShortcutsProvider` matches its signature, serves only the shortcuts page, and is pure.
- [ ] `tools:theme` is unchanged; `tools:shortcuts` opens the shortcuts page; the tools provider answers `>`.
- [ ] `CommandPaletteProps.onOpenChange` matches Section 4 and is called on every open/close change.
- [ ] `DASHBOARD_LANGUAGES`, `DashboardLanguage`, `DashboardLanguageControl`, `useDashboardLanguage`,
      `NotificationPrefItem`, `NOTIFICATION_PREF_ITEMS`, `NotificationPrefToggle` and
      `useNotificationPrefToggle` match Section 4 and are exported by `@/features/settings`.
- [ ] `LanguageTab` and `NotificationsTab` call the extracted hooks; their markup is unchanged and their
      existing suites pass unedited.
- [ ] `useNotificationPrefs` and `useSystemHealth` accept `enabled`; every existing caller is unchanged.
- [ ] `createPreferencesProvider` and `createSystemStatusProvider` match their signatures and the rules
      of Task 10; both are silent on the idle root without a prefix.
- [ ] The system status row exists only for `view_analytics` on `*`, and the health query runs only
      while the palette is open for such a user.
- [ ] The notification prefs query runs only while the palette is open (or the tab is shown).
- [ ] `createSettingsProvider` answers `>`; its rows and gates are unchanged.
- [ ] `features/command-palette` imports neither `@/features/settings` nor `@/features/dashboard`.
- [ ] No new request, mutation, endpoint or permission. Every write goes through `useUpdateNotificationPrefs`.
- [ ] Every new string exists in `en.json` and `it.json`.
- [ ] tsc, lint, design-token check, the scoped vitest run and the dashboard build pass; existing test
      cases pass unedited.
- [ ] `docs/features/command-palette.md` describes system commands, the shortcuts row and the prefixes.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Schema audit, seed (schema) export and automation logs: no endpoint or screen exists. Each needs its
  own brief; once built, it adds one row to `createSystemStatusProvider`'s sibling in the composition root.
- Recent items (recording, browser storage, idle "Recent" section) → roadmap entry 7b `BeechPalRecentItems`.
- Pins and the UI preferences container → roadmap entries 8 `UiPreferencesApi` and 9 `BeechPalPins`.
- Toggling any platform setting (site, storage, users) or list density from the palette (brief §5).
- New settings tabs (SMTP, Turnstile, backup).
- Rows that insert a prefix into the input or replay a shortcut; binding any new key.
- A confirmation on preference toggles; keeping the palette open after a toggle.
- A "Worker" metric beyond what `GET /api/content/stats/health` returns; any change to its handler.
- Any change to `collect-palette-items.ts`, `rank-palette-items.ts`, `use-command-palette.ts`,
  `use-async-palette-items.ts`, `_parts/*`, `settings-registry.ts`, `settings-dialog.tsx`, dashboard
  widgets, `App.tsx`.
- Media actions → roadmap entry 6b (blocked on a media library page).
- Any change in `apps/api` or `packages/*`.
