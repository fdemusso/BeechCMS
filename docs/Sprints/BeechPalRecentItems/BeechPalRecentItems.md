# Sprint Plan — BeechPalRecentItems (BeechPal, roadmap entry 7b)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 7b, split out of entry 7 at its planning).
Feature brief: `stages/00_ideation/output/feature_brief.md`, user story "vedere tra le voci iniziali quelle
usate di recente"; business rules 4 (visibility by permission), 5 (slice boundaries), 10 (local rows with
no latency), 12 (recent items: browser only); §4 "Ricerca" ("Con query vuota … compaiono pin, recenti e
navigazione") and "Pin e preferenze utente" ("Le voci recenti restano locali al browser e si possono
perdere senza danno").
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`,
`docs/Sprints/BeechPalContentSearch/`, `docs/Sprints/BeechPalRowActions/`,
`docs/Sprints/BeechPalQuickNotes/`, `docs/Sprints/BeechPalContextActions/`,
`docs/Sprints/BeechPalSystemCommands/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30291 nodes, 44486 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `PaletteProvider` | `features/command-palette/types.ts:L109` | Gains the optional `getStableItems`. 27 dependants: every provider, the engine, the composition root and their tests. |
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L117` | Engine. Mounts the recent provider after the context provider; records on `perform`. |
| `collectPaletteItems()` | `lib/collect-palette-items.ts:L28` | Unchanged. It resolves the recent rows' `requires` like any other row. |
| `useQuickNotes()` | `use-quick-notes.ts:L57` | The pattern `useRecentItems` copies (per-user key, re-read on open, user-switch guard). Its storage probe moves to a shared file. |
| `probeQuickNotesStorage()` | `lib/quick-notes-storage.ts:L37` | Degree 2 (its file and `use-quick-notes.ts`). Moves to `lib/palette-storage.ts` as `probePaletteStorage`. |
| `createNavigationProvider()`, `createContentProvider()`, `createToolsProvider()` | `providers/*.ts` | Built-in sources of stable rows. Each gains `getStableItems`. |
| `createSettingsProvider()`, `createPreferencesProvider()`, `createSystemStatusProvider()`, `createContentTypesProvider()` | `pages/palette-providers.ts:L28`, `L80`, `L139`, `L182` | Composition-root sources of stable rows. Each gains `getStableItems`. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. Recent items are browser-only (brief rule 12); no request, no endpoint, no migration.
- `apps/dashboard`:
  - `src/features/command-palette/` (engine): `getStableItems` on the contract, `collectStableItems`,
    the shared storage probe, the recent-items store, hook and provider, recording in `perform`,
    `getStableItems` on the navigation, content and tools providers.
  - `src/pages/` (composition root): `getStableItems` on the four providers in `palette-providers.ts`.
    `app-command-palette.tsx` is unchanged.
  - `src/locales/en.json`, `it.json`: two flat keys under `commandPalette`.
- `docs/features/command-palette.md`: one capability bullet.

**c) `graphify affected` impact analysis**

```
graphify affected "PaletteProvider" --depth 2
- command-palette.tsx, CommandPaletteProps, index.ts, collect-palette-items.ts, use-async-palette-items.ts
  (AsyncPaletteItems), every provider in providers/ (calculator, content, context-actions, conversions,
  navigation, quick-notes, shortcuts, tools), palette-providers.ts(+test), app-command-palette.tsx, App.tsx,
  collect-palette-items.test.ts, command-palette.test.tsx, and the provider suites (calculator, content,
  context-actions, conversions, navigation, quick-notes, shortcuts)
graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts(+test)
graphify affected "collectPaletteItems()" --depth 2
- command-palette.tsx, collect-palette-items.test.ts, index.ts
graphify affected "createNavigationProvider()" / "createContentProvider()" / "createToolsProvider()" --depth 2
- command-palette.tsx, index.ts, and the provider's own suite (itemsFor() helpers at
  navigation-provider.test.ts:L27, content-provider.test.ts:L40)
graphify affected "createSettingsProvider()" / "createContentTypesProvider()" --depth 2
- app-command-palette.tsx, palette-providers.test.ts (itemsFor() at L60), App.tsx
graphify affected "useQuickNotes()" --depth 2
- command-palette.tsx (CommandPalette() calls it), use-quick-notes.test.tsx, index.ts, App.tsx,
  app-command-palette.tsx, command-palette.test.tsx
graphify explain "probeQuickNotesStorage()"
- degree 2: contained by quick-notes-storage.ts, imported by use-quick-notes.ts (no test imports it)
graphify path "AppCommandPalette()" "collectPaletteItems()"
  AppCommandPalette() --calls--> useSchema() <--imports-- command-palette.tsx --imports--> collectPaletteItems()
  (the composition root reaches the engine only through the slice's public component)
```

Breaking-change verdict:
- `getStableItems` is **optional** on `PaletteProvider`. Every provider and every test stub compiles
  unchanged. `PaletteAsyncProvider` picks only `id | pages | prefix` (`types.ts:L126`), so it never
  inherits it.
- `probeQuickNotesStorage` and `QuickNotesStorage` have no consumer outside `quick-notes-storage.ts` and
  `use-quick-notes.ts`. No suite imports either symbol (grep: zero matches in `test/`), so moving them
  breaks no test.
- `src/test/setup.ts:L45–L47` clears `localStorage` after every test. Recents recorded by one
  `command-palette.test.tsx` case therefore never leak into the next. The existing cases see an
  unchanged idle root, because nothing is recorded until a row is performed.
- `app.test.tsx` mocks `@/pages/app-command-palette`, so the engine's new hook never runs there.

Findings that shape the plan:
1. **Stable rows are not all on screen at once.** The idle root is not the full set:
   - content shows five seeds (`content-provider.ts:L11`, `L54`);
   - settings, preferences and system emit nothing idle (`palette-providers.ts:L39`, `L103`, `L151`);
   - `schema:edit:<slug>` appears only while typing (L232–L241);
   - `content:create:<slug>` lives on the create page (L41–L51).

   Resolving stored ids against `getItems` output would lose most recents. A stored id must resolve
   **whatever the page or the query**. So each provider of stable rows declares its catalogue through
   `getStableItems`. The same lookup serves pins in entry 9.
2. **"Stable" is defined by declaration, not by an id allow-list.** These providers declare no catalogue:
   - calculator and conversions: computed rows;
   - notes: browser records;
   - context: page actions bound to a record;
   - shortcuts: reference rows whose Enter only closes the palette;
   - search: async, and `PaletteAsyncProvider` cannot declare one.

   This matches the roadmap's exclusions exactly, and a future provider opts in explicitly.
3. **Duplicate ids on the idle root break cmdk.** `PaletteRow` uses `item.id` as the cmdk `value`
   (`_parts/palette-list.tsx:L35`). `handleKeyDown` and the footer look the selected row up by that value
   (`command-palette.tsx:L276–L279`, `_parts/palette-footer.tsx:L28`). A recent `nav:/` next to the
   navigation `nav:/` would select both. Recent rows therefore carry `recent:<sourceId>`, and the engine
   maps that back to the source id when it records.
4. **Permissions follow the source.** `collectPaletteItems` resolves a row's own `requires`
   (`collect-palette-items.ts:L50–L56`), so a recent row that copies its source's `requires` and
   `unavailableReason` is disabled exactly when the source is. A source that the provider hides by
   permission (navigation menu gates, unreadable seeds, settings tabs, `manage_seeds`, `view_analytics`)
   is absent from the catalogue, so its recent row is omitted. This is brief rule 4 applied to recents.
   The rows that turn **disabled** are those with `requires`: `content:create:<slug>` and `content:new`.
5. **Recent comes after page actions.** The brief places page actions "in cima" (user story 3), and
   recents only "tra le voci iniziali". The roadmap's "Recent first" wording is amended in the roadmap:
   the idle order becomes context actions, recent, navigation, and so on.
6. **One storage probe.** `probeQuickNotesStorage` (`quick-notes-storage.ts:L37–L46`) is generic
   apart from its name and key. A second browser store would copy it, so it moves to
   `lib/palette-storage.ts`.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** Cut:
  - server persistence (brief §5);
  - a "clear recents" command (no user story; the list replaces itself);
  - recording page rows (`kind: "page"` only opens a sub-page, and the row the user lands on is recorded instead);
  - frequency weighting (the user story asks for the most recent first);
  - Recent rows while typing (they would duplicate the ranked hits);
  - `content:all` in the catalogue (an overflow affordance of the idle list, not a destination).

  `getStableItems` stays because both 7b and 9 need a query-independent lookup (finding 1). **No VETO.**
- **Rule 2, Botanical invariant.** No data access. **Respected.**
- **Rule 3, VSA.**
  - Everything new lives in the palette slice.
  - The composition root adds methods to providers it already owns, using only imports it already has.
  - No slice imports another slice.

  **Respected.**
- **Rule 4, Cloudflare purity.** Nothing server side. **Respected.**
- **Rule 5, minimal blueprint.** Core 0, api 0. Dashboard: 1 slice plus the composition root.
  - New: 5 source files, 5 test files.
  - Edited: 7 source files, 5 test files.
  - Also: 2 locale files, 1 doc.

  **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–7 made every screen, seed, setting and preference reachable by typing. But each open starts
from the same idle list, so the place the user just worked is as far away as any other. This sprint gives
the idle root a short "Recent" section: the stable rows the user last performed, on this browser only.

It lands before pins (entries 8–9) because pins need the same two things this sprint builds:
- a query-independent lookup of stable rows (`getStableItems` and `collectStableItems`);
- the rule that a stored id resolves against current provider output (missing ⇒ omitted, disabled
  source ⇒ disabled).

Entry 9 then adds only storage on the server and the pin/unpin actions.

VSA holds because the lookup is part of the palette's own provider contract. Every provider stays the
only author of its rows, and the composition root's providers declare their catalogue as they already
declare `getItems`. Nothing touches `@beechcms/core` or the API (brief rule 12: recents are browser-only).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 7 (`BeechPalSystemCommands`, review PASS) is committed as `2d045527` on
`feature/beechpal-system-commands`. The executor branches `feature/beechpal-recent-items` from that
commit. Line numbers below are as of that commit.

**Palette contract** (`features/command-palette/types.ts`):
- `PaletteItem.id` is "Stable across sessions and languages: `${providerId}:${key}`" (L69).
- `PaletteProvider` has `id`, `pages`, `prefix?` and `getItems` (L109–L120).
- `PaletteQueryContext` has `page`, `query` (trimmed), `prefix?` and `permissions` (L100–L107).
- `PaletteAsyncProvider` picks `id | pages | prefix` (L126).

**Engine** (`command-palette.tsx`):
- `useQuickNotes(me?.id, open)` (L128);
- providers memo, in order: calculator, conversions, context, navigation, content, `...hostProviders`,
  notes, tools, shortcuts (L164–L185);
- items memo (L204–L212): on `actions`, the frozen target's rows; elsewhere, ranked local rows plus
  async rows;
- `runPerform` (L225–L243); `perform(item)` is the only path for Enter and click on a row (L245, used
  by `PaletteList` at L318);
- the `handleKeyDown` secondary action (L282) and `confirmPendingAction` (L254) call `runPerform`
  directly, not `perform`.

**Ranking and rendering:**
- `rankPaletteItems` keeps input order on a blank query (`rank-palette-items.ts:L20`).
- `PaletteList` groups by section in first-appearance order when idle (`_parts/palette-list.tsx:L77–L96`)
  and shows `disabledReason ?? description` as the second line (L31).

**Browser storage pattern** (sprint 5):
- `lib/quick-notes-storage.ts`:
  - `QuickNotesStorage` type (L15);
  - key prefix `beech:quick-notes:v1:` (L21);
  - `probeQuickNotesStorage` (L37–L46);
  - reads never throw (L66–L76);
  - read-modify-write from storage, not from a stale list (L89–L98).
- `use-quick-notes.ts`:
  - storage probed once in `useState` (L59);
  - `OwnedNotes` user-switch guard (L23–L27, L62);
  - re-read when `open` turns true (L64–L66).

**Stable-row sources and their ids:**

| Provider | File | Ids | Hidden when | Disabled when |
|----------|------|-----|-------------|---------------|
| `nav` | `navigation-provider.ts:L20–L64` | `nav:<url>`, `nav:settings` | menu gates (L28–L33), `notImplemented`/`disabled` (L43) | never |
| `content` | `content-provider.ts:L17–L88` | `content:open:<slug>`, `content:create:<slug>`, `content:new`, `content:all` | `dashboard.hidden` or no `content:read` on the slug (L25) | `content:create` on slug (L48) / anywhere (L81) |
| `tools` | `tools-provider.ts:L10–L41` | `tools:theme`, `tools:shortcuts` | never | never |
| `settings` | `pages/palette-providers.ts:L28–L77` | `settings:<tab>`, `settings:<tab>:<section>` | registry gates (L41–L42, L62) | never |
| `prefs` | `pages/palette-providers.ts:L80–L136` | `prefs:language:<value>`, `prefs:notify:<key>` | the current language's own row (L105) | `unavailableReason` while loading, failed or saving (L91–L96) |
| `system` | `pages/palette-providers.ts:L139–L179` | `system:status` | no `view_analytics` on `*` (L150) | `unavailableReason` without data (L161–L168) |
| `schema` | `pages/palette-providers.ts:L182–L245` | `schema:new`, `schema:edit`, `schema:edit:<slug>` | no `manage_seeds` on `*` (L193); system seeds (L195) | never |

**Locale keys already present:** `commandPalette.create` ("Create" / "Crea"), `commandPalette.goTo`,
`commandPalette.editSchemaOf`, `commandPalette.chooseType` ("Create in…" / "Crea in…").

**Tests:**
- `src/test/setup.ts:L45–L47` clears `localStorage` after each test.
- `quick-notes-storage.test.ts:L40–L48`: the `refuseWrites` spy pattern (happy-dom proxy, restored by hand).
- `content-provider.test.ts:L31–L33`: `paddedSeeds(count)`, because canonical seeds are only three.
- `navigation-provider.test.ts:L15–L29` and `palette-providers.test.ts:L37–L48`: `permissionsFor(payload)`
  and identity `t`.
- `command-palette.test.tsx`: `renderPalette` (L84); `useMe` mocked to `CANONICAL_USERS.editor` (L43);
  permissions from the hoisted `grantedPermissions` set (L19–L22).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/dashboard/src/features/command-palette/lib/palette-storage.ts`
- `apps/dashboard/src/features/command-palette/lib/stable-items.ts`
- `apps/dashboard/src/features/command-palette/lib/recent-items-storage.ts`
- `apps/dashboard/src/features/command-palette/use-recent-items.ts`
- `apps/dashboard/src/features/command-palette/providers/recent-items-provider.ts`
- `apps/dashboard/src/features/command-palette/test/unit/palette-storage.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/stable-items.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/recent-items-storage.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/recent-items-provider.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/use-recent-items.test.tsx`

Edit:
- `apps/dashboard/src/features/command-palette/types.ts`: `PaletteStableContext`, `getStableItems`.
- `apps/dashboard/src/features/command-palette/lib/quick-notes-storage.ts`: probe and storage type move out.
- `apps/dashboard/src/features/command-palette/use-quick-notes.ts`: imports `probePaletteStorage`.
- `apps/dashboard/src/features/command-palette/providers/navigation-provider.ts`
- `apps/dashboard/src/features/command-palette/providers/content-provider.ts`
- `apps/dashboard/src/features/command-palette/providers/tools-provider.ts`
- `apps/dashboard/src/features/command-palette/command-palette.tsx`
- `apps/dashboard/src/pages/palette-providers.ts`
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`
- Tests, cases added: `navigation-provider.test.ts`, `content-provider.test.ts`, `tools-provider.test.ts`,
  `pages/palette-providers.test.ts`, `command-palette.test.tsx`.
- `docs/features/command-palette.md`

Not touched: `apps/api`, `packages/*`, `collect-palette-items.ts`, `rank-palette-items.ts`,
`parse-palette-query.ts`, `use-command-palette.ts`, `use-async-palette-items.ts`, `_parts/*`,
`index.ts`, the calculator, conversions, context-actions, quick-notes, shortcuts and content-search
providers, `pages/app-command-palette.tsx`, `App.tsx`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Contract (`types.ts`)**

```ts
/** What a provider's stable rows may depend on: never the page or the query. */
export type PaletteStableContext = Pick<PaletteQueryContext, "permissions">

export interface PaletteProvider {
  // id, pages, prefix, getItems unchanged
  /**
   * Every row with a stable id this provider can emit, on any page and for any query, each in its root-page form.
   * Stored ids (recent items; pins, roadmap 9) resolve against it. Same purity and hiding rules as `getItems`.
   * Omitted: none of this provider's rows is ever recorded.
   */
  readonly getStableItems?: (context: PaletteStableContext) => readonly PaletteItem[]
}
```

- Update the `PaletteItem.id` doc (L69): "Persisted by recent items and pins (roadmap 9)."
- `index.ts` is unchanged: no consumer outside the slice needs to name `PaletteStableContext`. The
  composition root's providers get the parameter type by inference from `PaletteProvider`.

**Task 2 — Shared storage probe (`lib/palette-storage.ts`, new; `quick-notes-storage.ts`; `use-quick-notes.ts`)**

```ts
/** The subset of Web Storage the palette's browser-only stores use; `window.localStorage` in production. */
export type PaletteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** `localStorage` when a probe write and remove succeed; null when storage is missing, blocked or full. */
export function probePaletteStorage(): PaletteStorage | null
```

- The body moves unchanged from `probeQuickNotesStorage` (`quick-notes-storage.ts:L37–L46`). The probe
  key becomes `beech:palette:probe`, so the key no longer belongs to one store.
- `quick-notes-storage.ts`: delete `QuickNotesStorage`, `PROBE_KEY` and `probeQuickNotesStorage`. Its
  functions take `PaletteStorage`. `KEY_PREFIX` and every other export are unchanged.
- `use-quick-notes.ts:L59`: `React.useState(probePaletteStorage)`.

**Task 3 — Stable lookup (`lib/stable-items.ts`, new)**

```ts
/**
 * The stable rows of `providers`, by id. The first row with a given id wins; a provider that throws contributes
 * nothing. Rows are returned unresolved: `collectPaletteItems` resolves `requires` where they are listed.
 */
export function collectStableItems(
  providers: readonly PaletteProvider[],
  context: PaletteStableContext,
): ReadonlyMap<string, PaletteItem>
```

- Providers without `getStableItems` are skipped.
- A throwing provider is logged with `console.error` and the provider id, in the same format as
  `collect-palette-items.ts:L43`.
- Map insertion order is provider order, then row order.

**Task 4 — Store (`lib/recent-items-storage.ts`, new)**

```ts
/** Few enough that the section stays a shortcut under the context actions. */
export const RECENT_ITEMS_MAX = 5

/** One storage key per user: another account on the same browser never reads these ids. */
export function recentItemsKey(userId: string): string

/** The user's recent ids, newest first, at most RECENT_ITEMS_MAX, without duplicates. Never throws. */
export function readRecentIds(storage: PaletteStorage, userId: string): string[]

/** Read-modify-write: `id` first, any earlier copy removed, capped. null when the write fails (storage unchanged). Never throws. */
export function recordRecentId(storage: PaletteStorage, userId: string, id: string): string[] | null
```

- Key: `beech:palette-recent:v1:<userId>`. The value is a JSON array of strings, newest first.
- `readRecentIds`:
  - a missing key, corrupt JSON, a non-array value or a throwing `getItem` yields `[]`;
  - non-string and empty-string entries are dropped;
  - duplicates keep their first position;
  - the result is truncated to `RECENT_ITEMS_MAX`.
- `recordRecentId` reads from storage, not from a list held in memory, as `insertNote` does
  (`quick-notes-storage.ts:L93`), so another tab's write survives.
- Ids are opaque here. Whether they still resolve is the provider's concern (Task 6), so the store never
  prunes a missing id. Such an id ages out under the cap.

**Task 5 — Hook (`use-recent-items.ts`, new)**

```ts
export type RecentItemsState =
  | { readonly status: "ready"; readonly ids: readonly string[] }
  | { readonly status: "unavailable" }

export interface RecentItemsApi {
  readonly state: RecentItemsState
  /** Records `id` as the most recent. A failed write is dropped silently: recents may be lost without harm (brief §4). */
  readonly record: (id: string) => void
}

/** Browser-only recent ids of `userId`, re-read from storage each time `open` turns true. */
export function useRecentItems(userId: string | undefined, open: boolean): RecentItemsApi
```

- Copy the shape of `useQuickNotes` (`use-quick-notes.ts:L57–L71`):
  - probe once with `React.useState(probePaletteStorage)`;
  - hold ids together with the user they were read for, so another user's ids never render, even
    for one frame;
  - re-read when `open` turns true;
  - with no storage or no user id, the state is `unavailable`.
- `record` (`useCallback` over storage and user id) does nothing when unavailable. On success it replaces
  the held ids with the returned list. On `null` it changes nothing and shows no toast.
- The returned object is memoised over `state` and `record`, so the engine's providers memo recomputes
  only when the ids change.

**Task 6 — Recent provider (`providers/recent-items-provider.ts`, new)**

```ts
export const RECENT_PROVIDER_ID = "recent"

/** Row id of the recent copy of the stable row `sourceId`: `recent:<sourceId>`. */
export function toRecentRowId(sourceId: string): string

/** The stable id behind a recent row id; null for any other id. */
export function recentSourceId(rowId: string): string | null

/**
 * The id to record when `item` is performed: its stable id (unwrapped from a recent row), or null when that id is
 * not in `stable` or the row only opens a sub-page.
 */
export function recentIdToRecord(item: PaletteItem, stable: ReadonlyMap<string, PaletteItem>): string | null

/** The rows the user performed most recently, newest first, on the idle root only; each one resolves against `sources`. */
export function createRecentItemsProvider(deps: {
  t: TFunction
  recent: RecentItemsState
  /** Every other local provider; their stable rows are what stored ids resolve against. */
  sources: readonly PaletteProvider[]
}): PaletteProvider
```

Provider rules:
- `id: RECENT_PROVIDER_ID`, `pages: ["root"]`, no `prefix`, no `getStableItems` (a recent row is never
  itself a source).
- `getItems` returns `[]` unless `page === "root"`, `query === ""` and there is no `prefix`. While
  typing, the source rows are already ranked hits.
- It returns `[]` when `recent.status === "unavailable"`, so the section is absent and nothing else changes.
- Otherwise it calls `collectStableItems(sources, { permissions })` once. For each stored id, in order:
  - an id with no stable row is skipped (missing ⇒ omitted, finding 4);
  - otherwise the row is the source row with these overrides:
    - `id: toRecentRowId(sourceId)`;
    - `section: t("commandPalette.recentSection")`;
    - `description: source.description ?? source.section`. On the idle root the section heading is
      "Recent", so the source's own section is what tells "Users" the screen from "Settings ·
      Users";
    - `score` dropped.

    Everything else is kept from the source: `label`, `icon`, `status`, `shortcut`, `requires`,
    `unavailableReason`, `perform`, `actions`. `collectPaletteItems` then disables the row exactly
    when it would disable the source.
- Pure: no storage access, no clock.

`recentIdToRecord` rules:
- `sourceId = recentSourceId(item.id) ?? item.id`.
- `null` when `item.perform.kind === "page"`: the row only opens a sub-page, and the row performed there
  is recorded instead.
- `null` when `stable` has no `sourceId`: search hits, notes, computed, context, shortcut and actions-page
  rows are never in the catalogue.
- Otherwise `sourceId`.

`recentSourceId` returns `null` for ids that do not start with `recent:`. It never returns an empty
string: `recent:` alone yields `null`.

**Task 7 — Engine wiring (`command-palette.tsx`)**

- `const recentItems = useRecentItems(me?.id, open)`, next to `useQuickNotes` (L128).
- Providers memo (L164–L185):
  - build the existing list unchanged;
  - insert `createRecentItemsProvider({ t, recent: recentItems.state, sources: <the other providers> })`
    directly after `createContextActionsProvider`, with `sources` being every other provider in the
    list;
  - add `recentItems.state` to the dependencies;
  - update the L164 comment to "idle order: context, recent, navigation, content, host, notes, tools".
  - Nothing else changes order.
- `perform(item)` (L245):
  - compute `collectStableItems(providers, { permissions: { can, canAnywhere, canGlobally } })`;
  - pass it to `recentIdToRecord(item, …)`;
  - when that returns an id, call `recentItems.record(id)`;
  - then call `runPerform(item.perform)`.

  Recording comes first because `runPerform` closes the palette. Computing the lookup only on perform
  keeps typing free of the extra pass.
- The secondary action (`handleKeyDown`, L282) and `confirmPendingAction` (L254) stay as they are. Neither
  goes through `perform`, so a row action or a confirmed page action is never recorded.
- No change to `items`, `PaletteList`, the footer or `useCommandPalette`.

**Task 8 — Built-in sources (`navigation-provider.ts`, `content-provider.ts`, `tools-provider.ts`)**

Rule for all providers in Tasks 8 and 9:
- the catalogue is built by the **same local row builders** as `getItems`;
- never call `getItems` with a made-up page or query to obtain it;
- an id that `getItems` can emit must have the same `perform`, `requires` and `icon` in the catalogue.

| Provider | `getStableItems` returns |
|----------|--------------------------|
| `nav` | Exactly its idle-root output: the gated menu rows, then `nav:settings` (a page row: listed, never recorded). |
| `content` | For every readable seed in the provider's sort order (L24–L26), with no `IDLE_SEED_LIMIT`: <ul><li>first the root form of `content:open:<slug>` (label `commandPalette.goTo`, keywords as L60, section `commandPalette.contents`);</li><li>then, for every readable seed, `content:create:<slug>`: `label: t("commandPalette.createIn", { label: seed.label })`, `section: t("commandPalette.create")`, `description: seed.slug`, `icon` as L47, `requires` and `perform` as L48–L49;</li><li>then `content:new` (as L75–L83) when any seed is readable.</li></ul>`content:all` is not listed (VETO Audit). |
| `tools` | Its `getItems` rows (`tools:theme`, `tools:shortcuts`). They depend on nothing but `deps`, so a shared builder suffices. |

**Task 9 — Composition-root sources (`pages/palette-providers.ts`)**

Same rule as Task 8.

| Provider | `getStableItems` returns |
|----------|--------------------------|
| `settings` | What the root page emits while typing: every visible tab, each followed by its visible bookmarks (L45–L73), same gates. |
| `prefs` | What it emits under `>`: the language rows for the other languages, then the four notification rows with their current `description` and `unavailableReason` (L105–L133). |
| `system` | `[]` without `view_analytics` on `*`; otherwise the one `system:status` row exactly as under `>` (L153–L176). |
| `schema` | `[]` without `manage_seeds` on `*`; otherwise `schema:new` and `schema:edit` (page row) as on the idle root, then `schema:edit:<slug>` per editable seed in its root typing form (label `commandPalette.editSchemaOf`, L232–L241). |

Shortcuts, calculator, conversions, notes, context actions and search declare no catalogue (finding 2).

**Task 10 — Locale keys (`en.json` / `it.json`)**

Two flat keys under `commandPalette`, next to `chooseType`:

| Key | en | it |
|-----|----|----|
| `recentSection` | `Recent` | `Recenti` |
| `createIn` | `Create in {{label}}` | `Crea in {{label}}` |

**Task 11 — Docs (`docs/features/command-palette.md`)**

In Key Capabilities, after "Global Hotkey", add:
- **Recent**: opening the palette lists, under *Recent*, the last five screens, seeds, settings and
  commands you used on this browser (separate per user, never sent to the server). A row you can no
  longer use is shown disabled, and one that no longer exists is left out. Typing hides the section.

**Task 12 — Design (UI contract)**

- No new component and no new token. The section is a `CommandGroup` with a heading, rendered by the
  existing `PaletteList` grouping.
- The icons are the source rows' own icons, and the second line uses the existing `text-xs
  text-muted-foreground` slot (`palette-list.tsx:L48`).
- No colour, badge or button is added, so the design-token check covers only the touched `.tsx` file.

**Task 13 — Tests**

Fixtures:
- permissions through `permissionsFor(payload)` (as `navigation-provider.test.ts:L17–L24`), or literal
  `PalettePermissions` stubs in the new node suites;
- user ids from `CANONICAL_USERS` (editor, admin), as in `quick-notes-storage.test.ts:L17–L18`;
- seeds from `CANONICAL_SEEDS`, padded with `paddedSeeds` where more than `IDLE_SEED_LIMIT` are needed;
- `t`: the identity stub of the file being edited, or `(key) => key` in new node suites;
- source rows in the provider and lookup suites: hand-rolled `PaletteItem` literals built through a
  local `row(id, overrides)` helper. This is a palette contract, not a domain entity, so no canonical
  set exists (Rule 3.5);
- refused writes through the `refuseWrites` spy pattern of `quick-notes-storage.test.ts:L40–L48`, restored
  by hand (comment the happy-dom reason, Rule 6.2.1).

`test/unit/palette-storage.test.ts`, unit (happy-dom). `describe("probePaletteStorage")`:
- `it` returns localStorage and leaves no probe key behind.
- `it` returns null when setItem throws.

`test/unit/recent-items-storage.test.ts`, unit (happy-dom). `describe("recent items storage")`, nested by
function:
- `readRecentIds`:
  - `it` a missing key yields an empty list.
  - `it` corrupt JSON or a non-array value yields an empty list without throwing (array-driven).
  - `it` non-string and empty entries are dropped, duplicates keep their first position, and the list
    is capped at RECENT_ITEMS_MAX.
- `recordRecentId`:
  - `it` puts the id first under the user's key and leaves another user's key untouched.
  - `it` an id already stored moves to the front without a duplicate.
  - `it` at RECENT_ITEMS_MAX the oldest id is dropped.
  - `it` a throwing setItem returns null and the stored list is unchanged.
  - `it` works from storage, not from a stale list: an id written by another tab between two records
    survives.

`test/unit/stable-items.test.ts`, unit, `// @vitest-environment node`. `describe("collectStableItems")`:
- `it` returns the rows of providers declaring getStableItems, by id, and skips the others.
- `it` the first row with a given id wins.
- `it` a throwing provider contributes nothing and the others still do.
- `it` passes the caller's permissions to every provider.

`test/unit/recent-items-provider.test.ts`, unit, `// @vitest-environment node`.

`describe("createRecentItemsProvider")`:
- `it` on the idle root lists the stored ids in order under the Recent section, each with its source's
  label, icon and perform.
- `it` gives each row the recent: id, so it never collides with its source on the same list.
- `it` uses the source's description, else the source's section, as the second line.
- `it` emits nothing while typing, with a prefix, or on a sub-page (array-driven).
- `it` emits nothing when storage is unavailable.
- `it` skips a stored id no source lists any more.
- `it` a source requiring a permission the caller lacks is listed disabled with that permission. Resolve
  through `collectPaletteItems` with a `describeMissing` stub. Regression guard: a recent row must never
  run what its source cannot.

`describe("recentIdToRecord")`:
- `it` returns the id of a stable row that navigates, runs or copies (array-driven over the three kinds).
- `it` unwraps a recent row to its source id.
- `it` returns null for a row that opens a sub-page.
- `it` returns null for a row whose id is not in the stable lookup (for example a search hit).

`describe("recentSourceId")`:
- `it` round-trips toRecentRowId and returns null for any other id, "recent:" alone included.

`test/unit/use-recent-items.test.tsx`, unit (happy-dom, `renderHook`, real `localStorage`).
`describe("useRecentItems")`:
- `it` without a user id the state is unavailable.
- `it` when storage refuses writes the state is unavailable.
- `it` record stores the id first and the state lists it.
- `it` a failed record leaves the state unchanged.
- `it` after the signed-in user changes no render exposes the previous user's ids.
- `it` ids written to storage while the palette was closed are listed after open turns true.

`navigation-provider.test.ts`, edit. Add:
- `it` getStableItems lists the same rows as the idle root for the same authority.

`content-provider.test.ts`, edit. Add:
- `it` getStableItems lists an open row for every readable seed, beyond the idle limit.
- `it` getStableItems lists a create row per readable seed that requires content:create on that seed.
- `it` getStableItems never lists a seed the caller cannot read.

`tools-provider.test.ts`, edit. Add:
- `it` getStableItems lists the theme and shortcuts rows with the ids getItems uses.

`pages/palette-providers.test.ts`, edit. Add:
- `createSettingsProvider`: `it` getStableItems lists the same tabs and bookmarks as a typed root query
  for the same authority.
- `createPreferencesProvider`: `it` getStableItems lists the same rows as the > prefix.
- `createSystemStatusProvider`: `it` getStableItems is empty without view_analytics on * and lists
  system:status with it.
- `createContentTypesProvider`:
  - `it` getStableItems is empty without manage_seeds on *.
  - `it` getStableItems lists schema:new, schema:edit and one edit row per editable seed, and never a
    system seed.

`command-palette.test.tsx`, edit. Existing cases stay untouched. Add:
- `it` the idle root shows no Recent section before anything was performed.
- `it` Enter on a navigation row, then reopening, lists that row first under Recent.
- `it` Enter on a recent row navigates to its destination and keeps a single recent entry for it.
- `it` typing hides the Recent section.
- `it` a recorded create row is listed disabled with the missing permission once content:create on its
  seed is revoked. Arrange by recording through the store for `EDITOR_ID`, not by hand-writing the key.
- `it` Enter on a search row records nothing. Regression guard: search hits are never recents
  (roadmap 7b).

The existing `quick-notes-storage.test.ts`, `use-quick-notes.test.tsx` and `quick-notes-provider.test.ts`
must pass **unedited**. They are the proof that moving the probe changed nothing for notes.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`: `npx vitest run src/features/command-palette src/pages src/test/cross-slice`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx`
- `pnpm --filter @beechcms/dashboard build`
- `pnpm beech test --diff`. This sprint touches no `packages/` or `apps/api` file. A `packages/core`
  "no tests were run" failure from earlier stacked sprints is known (sprint 6 review) and not caused here.
- `graphify update . --force`. Then:
  - `graphify affected "collectStableItems()" --depth 2` must list only the palette slice files and
    their tests;
  - grep `apps/dashboard/src/features/command-palette` for `@/features/` imports other than
    `@/features/shared`: zero new matches.
- Manual gate (human, dev stack):
  - open the palette: no Recent section on first use;
  - open Analytics, a seed and a settings tab from the palette; reopen: Recent lists them newest first,
    under the page actions (if an entry is open) and above Navigate;
  - type anything: the Recent section is gone;
  - sign in as another user on the same browser: their Recent section is empty;
  - as admin, record *Create in <seed>*, then remove `content:create` on that seed for the role and
    reload: the row is disabled with the missing permission;
  - delete a seed that is listed in Recent: the row disappears and nothing else changes;
  - in a private window with storage blocked: the palette works and shows no Recent section.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PaletteStableContext` and `PaletteProvider.getStableItems` match Section 4; `getStableItems` is optional.
- [ ] `PaletteStorage` and `probePaletteStorage` live in `lib/palette-storage.ts`; `probeQuickNotesStorage`
      and `QuickNotesStorage` no longer exist; the quick-notes suites pass unedited.
- [ ] `collectStableItems`, `RECENT_ITEMS_MAX` (5), `recentItemsKey`, `readRecentIds`, `recordRecentId`,
      `RecentItemsState`, `RecentItemsApi`, `useRecentItems`, `RECENT_PROVIDER_ID`, `toRecentRowId`,
      `recentSourceId`, `recentIdToRecord` and `createRecentItemsProvider` match their signatures.
- [ ] Storage key `beech:palette-recent:v1:<userId>`; reads and writes never throw.
- [ ] The navigation, content, tools, settings, preferences, system and schema providers declare
      `getStableItems` per Tasks 8–9. The shortcuts, calculator, conversions, notes and context-actions
      providers do not.
- [ ] Recent rows appear only on the idle root, after the context actions, newest first, at most five.
- [ ] Recent row ids are `recent:<sourceId>`. Performing one records the source id.
- [ ] A recent row is disabled exactly when its source is, and omitted when its source is absent.
- [ ] Only `perform` records. Page rows, row actions, confirmed page actions, search hits, notes,
      computed and shortcut rows are never recorded.
- [ ] Storage unavailable or no signed-in user: no Recent section, and every other row behaves as before.
- [ ] No new request, endpoint, permission, component or token.
- [ ] Both new strings exist in `en.json` and `it.json`.
- [ ] tsc, lint, the design-token check, the scoped vitest run and the dashboard build pass; existing
      test cases pass unedited.
- [ ] `docs/features/command-palette.md` describes the Recent section.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Pins, the pin/unpin row actions and the UI preferences container → roadmap entries 8 `UiPreferencesApi`
  and 9 `BeechPalPins`. Entry 9 reuses `getStableItems` and `collectStableItems` unchanged.
- Server persistence or cross-device sync of recents (brief §5).
- A "clear recent items" command, removing one recent row, or a recents settings toggle.
- Frequency or time weighting; showing recents while typing; boosting recent rows in the ranking.
- Recording page rows, row actions (Mod+Enter, actions page), confirmed page actions, search hits, notes,
  computed or shortcut rows.
- Listing `content:all` in the content catalogue.
- Any change to `collect-palette-items.ts`, `rank-palette-items.ts`, `parse-palette-query.ts`,
  `use-command-palette.ts`, `use-async-palette-items.ts`, `_parts/*`, `index.ts`,
  `pages/app-command-palette.tsx`, `App.tsx`.
- Media actions → roadmap entry 6b (blocked on a media library page).
- Any change in `apps/api` or `packages/*`.
