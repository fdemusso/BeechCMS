# Sprint Plan — BeechPalPins (BeechPal, roadmap entry 9)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 9, the last pending entry apart from the
blocked 6b).
Feature brief: `stages/00_ideation/output/feature_brief.md`. Relevant parts:
- user story "fissare tra i preferiti le voci che uso più spesso e ritrovarle in cima alla palette su qualsiasi
  browser o dispositivo";
- business rules 3–5 (RBAC, visibility by permission, slice boundaries), 6 (no direct data access), 10 (local rows
  with no latency), 11 (closed-key preferences), 12 (pins: per user, server side);
- §4 "Pin e preferenze utente" (stable rows only, low cap, RBAC on every open, missing item never an error, a failed
  write never leaves a falsely saved list, other users can neither read nor change them), "Ricerca" ("Con query
  vuota … compaiono pin, recenti e navigazione") and "Prefissi e tastiera" (the row submenu is keyboard-reachable).

Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`, `BeechPalLocalTools/`,
`SearchResultMetadataApi/`, `BeechPalContentSearch/`, `BeechPalRowActions/`, `BeechPalQuickNotes/`,
`BeechPalContextActions/`, `BeechPalSystemCommands/`, `BeechPalRecentItems/`, `UiPreferencesApi/`.

### Pre-Computation Analysis

The graph was refreshed with `graphify update . --force` (19495 nodes, 46061 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L120` | Engine. Mounts the pins hook and provider, memoises the stable lookup and decorates local rows with pin actions. |
| `collectStableItems()` | `lib/stable-items.ts` | Unchanged. It is the lookup that pins resolve against (sprint 7b built it for this). |
| `createRecentItemsProvider()` | `providers/recent-items-provider.ts:L36` | Gains an optional `exclude` set, so a pinned row is not listed twice on the idle root. |
| `toActionRows()` | `lib/action-rows.ts:L8` | Unchanged. It lists the frozen target's actions, and the pin action is already on the target when Shift+Enter freezes it. |
| `PaletteRowAction` | `types.ts:L59` | Unchanged. Pin and Unpin are plain `run` actions. |
| `uiPreferencesSchema`, `PALETTE_PINS_MAX`, `PALETTE_PIN_ID_MAX_LENGTH`, `UiPreferences` | `packages/core/src/settings/ui-preferences.ts:L7–L45` | Sprint 8 contract, consumed read-only by the dashboard. |
| `GET` / `PUT /api/settings/ui-preferences` | `apps/api/src/features/settings/settings.handler.ts:L532`, `L547` | Sprint 8 routes. `AUTHED`, JWT subject only (`permission.middleware.ts:L78–L79`). PUT replaces the whole container and answers 200 with what it stored. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none. Only the existing `PALETTE_PINS_MAX`, `PALETTE_PIN_ID_MAX_LENGTH` and the `UiPreferences`
  type are imported.
- `apps/api`: none. The routes, validation, isolation and error codes shipped in sprint 8.
- `apps/dashboard`:
  - `src/features/command-palette/`: the pins hook (query and mutation through `rpc`), the pins provider, the
    pin-action decorator, the engine wiring, and `exclude` on the recent provider.
  - `src/locales/en.json`, `it.json`: one nested `commandPalette.pins` object.
  - `src/pages/`: none. The composition root needs nothing new.
- `docs/features/command-palette.md`: one capability bullet.

**c) `graphify affected` impact analysis**

```
graphify affected "createRecentItemsProvider()" --depth 2
- command-palette.tsx (CommandPalette() L188), recent-items-provider.test.ts, command-palette.test.tsx
  (renderPalette L89, renderPaletteWithPage L579), app-command-palette.tsx, command-palette/index.ts (re-export)
graphify affected "collectStableItems()" --depth 2
- command-palette.tsx (L256), recent-items-provider.ts (L51) + its test, stable-items.test.ts,
  command-palette.test.tsx, app-command-palette.tsx, index.ts
graphify affected "CommandPalette()" --depth 2
- command-palette.test.tsx, app-command-palette.tsx, index.ts, App.tsx (RootLayout L136),
  palette-providers.ts(+test) (type imports)
graphify affected "toActionRows()" --depth 2
- command-palette.tsx (L215), action-rows.test.ts, command-palette.test.tsx, app-command-palette.tsx, index.ts
graphify affected "PaletteRowAction" --depth 2
- No affected nodes found (type-only; referenced through PaletteItem.actions)
graphify path "CommandPalette()" "parseStoredUiPreferences()"
- No directed path: the dashboard never reaches the API's storage code, only the HTTP route
graphify explain "uiPreferencesSchema"
- degree 3: its module, its test, uiPreferencesByteLength(). No dashboard consumer yet
```

Breaking-change verdict:
- `exclude` on `createRecentItemsProvider` is optional. `recent-items-provider.test.ts` compiles and passes unedited.
- No exported type in `types.ts` changes, so every provider and test stub compiles unchanged.
- `command-palette.test.tsx` mocks `@/lib/rpc` with only `api.search.$get` (`L28`). The new hook calls
  `rpc.api.settings["ui-preferences"]`, so the mock factory gains a `settings` branch (Task 9). This is a change to
  the shared mock, not to any existing case. Every existing `it()` stays byte-identical and green.
- With the new mock returning `{ palettePins: [] }`, every existing case sees an unchanged idle root. Stable rows
  gain a trailing **Pin** action. Before this sprint they had no actions (`grep "actions:"`: only
  `content-search-provider.ts:L53` and `quick-notes-provider.ts:L61`), so Pin becomes their first action. That
  changes the footer of a selected stable row from nothing to the Mod+Enter / Shift+Enter hints. The cases that
  assert the footer select a search row or a note (sprint 4b/5 suites), so they keep passing. The executor confirms
  this in the scoped run.
- `app.test.tsx` mocks `@/pages/app-command-palette`, so the engine's new hook never runs there.

Findings that shape the plan:
1. **Pins resolve against the 7b catalogue.** `collectStableItems` returns every stable row, whatever the page or
   query. It hides a row the caller may not see, and keeps `requires` on a row the caller may see but not run. So
   the brief's two cases fall out:
   - a pin whose source has a failing `requires` shows **disabled** with the missing permission, and stays stored;
   - a pin whose source is absent (deleted seed, or a surface hidden by permission) is **unavailable**.
   Nothing is pruned automatically. A pin comes back the moment its source does, which is the brief's "torna attivo
   se il permesso torna".
2. **An unavailable pin must be removable, otherwise it holds a slot for ever.** cmdk skips disabled items in
   keyboard navigation, so a disabled row can never be selected, and its actions can never be reached. The
   unavailable pin row is therefore an **enabled** row whose own Enter removes the pin. Its label and description
   say so. This does not break rule 4: the row is not a disabled action made clickable, it is a cleanup row for
   the user's own stored id.
3. **The catalogue is incomplete until the schema loads.** Content rows come from `useSchema()`. While its `data` is
   `undefined`, every content pin is absent from the lookup. Showing those pins as "unavailable", whose Enter
   removes them, during that window would invite data loss. Unresolved pins are therefore **omitted** until the
   schema has loaded. Permissions arrive with `useMe()`, and the pins query waits for `me.id` anyway.
4. **A PUT is only safe from a loaded list.** PUT replaces the whole container (sprint 8). Writing while the GET is
   pending or failed would overwrite the user's stored pins with a list built from nothing. So pin and unpin exist
   only when the list is loaded and no write is in flight.
5. **Non-optimistic write, because the palette closes on the action.** A `run` action closes the palette
   (`command-palette.tsx:L243–L246`). The user does not see the list during the request. The cache therefore changes
   only from the PUT response, and a failure leaves it untouched. That makes "never falsely saved" true by
   construction, with no rollback code, and it matches the design contract: a toast confirms an action that already
   happened (`design_system.html:L510`).
6. **The engine adds the actions, providers do not.** Whether a row can be pinned depends on two engine-owned
   facts: the stable lookup and the pin list. A decorator over the resolved local rows adds Pin or Unpin to every
   row whose stable id is in the lookup: its source row, its recent copy and its pinned copy. No provider changes,
   and a future stable provider is pinnable for free.
7. **The stable lookup becomes a memo.** Sprint 7b computes it only on perform (`L256`), to keep typing free of the
   extra pass. The decorator needs it on every render. So it moves into a `useMemo` over `providers` and the
   permission functions, which the query never invalidates, and `perform` reuses it.
8. **Pinned sits under the page actions and above Recent.** Page actions are tied to the visible record and are
   "in cima" (user story 3), as decided in 7b. Pins are "in cima" among the stable rows. A pinned row is excluded
   from Recent, so with caps 8 and 5 the idle root never shows the same destination twice.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** Cut:
  - reordering pins: the brief asks for "in cima", not an order editor; new pins append;
  - a "manage pins" page: Unpin on the row, and Enter on an unavailable pin, cover removal;
  - optimistic updates: the palette is closed during the write (finding 5);
  - a refetch on every open: `refetchOnWindowFocus` (QueryClient default) already picks up another device's change
    when this tab regains focus;
  - recording a pinned row as recent: it is excluded from Recent while pinned;
  - pinning search hits, notes, computed rows, page actions or shortcuts: excluded by the brief (§5) and by
    construction, since they are not in the catalogue;
  - a pin keyboard shortcut of its own: Pin is the first action of a stable row, so Mod+Enter already does it.

  **No VETO.**
- **Rule 2, Botanical invariant.** The dashboard calls the sprint 8 HTTP routes through `rpc`. There is no D1
  access and no field name. **Respected.**
- **Rule 3, VSA.**
  - Everything new lives in the palette slice. It imports only `@/lib/rpc`, `@/components/icons`, `sonner`,
    `@tanstack/react-query` and `@beechcms/core`, all of which the slice or the dashboard already uses.
  - The query key is private to the slice, because no other slice reads UI preferences.
  - No import from `features/settings`.

  **Respected.**
- **Rule 4, Cloudflare purity.** No server change. **Respected.**
- **Rule 5, minimal blueprint.** Core 0, api 0. Dashboard: one slice.
  - New: 3 source files, 3 test files.
  - Edited: 2 source files, 2 test files, 2 locale files, 1 doc.

  **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint closes BeechPal. Every dependency is in place:
- the row submenu (4b): Mod+Enter runs the first action, Shift+Enter opens the actions page;
- the query-independent stable lookup and the "stored id resolves against current provider output" rule (7b);
- the closed-key, size-capped, self-only server container with one key, `palettePins` (8).

What is left is the dashboard half of pins:
- a hook that reads and replaces `palettePins`;
- a provider that turns the stored ids into a *Pinned* section on the idle root;
- an engine-level decorator that offers Pin or Unpin on every stable row.

VSA holds because the palette owns the pins end to end. It consumes the sprint 8 HTTP contract through the shared
`rpc` client, as the search provider already does (`content-search-provider.ts:L36`), and imports nothing from
another slice. The Botanical invariant holds because the dashboard never sees storage: the API's repository
(sprint 8) is the only code that touches `users.ui_prefs`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 8 (`UiPreferencesApi`, review PASS) is uncommitted on `feature/ui-preferences-api` (on top
of `d59e0827`). The human commits it first. The executor then branches `feature/beechpal-pins` from that commit.
Sprint 8 touched no dashboard file, so the dashboard line numbers below hold for that commit. The rpc type picks
up the new routes from `AppType` with no dashboard change.

**Server contract (sprint 8, consumed as is):**
- `GET /api/settings/ui-preferences` → 200 `UiPreferences` (`{ palettePins: string[] }`). An invalid stored value
  reads as empty.
- `PUT /api/settings/ui-preferences`, body = the whole container → 200 with what was stored. Errors are 400
  `ui-preferences-unknown-key` / `-invalid` / `-too-large`, and 404 for a missing user.
- `PALETTE_PINS_MAX = 8`, `PALETTE_PIN_ID_MAX_LENGTH = 200`, `UI_PREFERENCES_MAX_BYTES = 2048`. These are exported
  from `@beechcms/core` (`index.ts:L84`), which the dashboard already imports at runtime
  (`features/shared/hooks/use-permissions.ts:L6–L13`).
- `rpc` throws `ApiError` for every non-2xx (`lib/rpc.ts:L13–L16`).

**Engine** (`command-palette.tsx`):
- `useMe` (L130), `useQuickNotes` (L131), `useRecentItems` (L132). `useSchema` gives `seedsData`, which is
  `undefined` while loading (L127).
- Providers memo (L170–L194), final order: calculator, conversions, context, recent, then `afterContext`
  (navigation, content, `...hostProviders`, notes, tools, shortcuts). Recent gets `sources` = every other provider
  (L188–L192).
- Items memo (L213–L221): on `actions`, `toActionRows(actionsTarget)`; elsewhere, ranked local rows plus async rows.
- `runPerform` (L234–L252). `perform` (L254–L260) computes `collectStableItems` inline, then records a recent id.
- `handleKeyDown` (L283–L299) finds the selected row in `items`, refuses disabled rows and rows without actions,
  and runs `actions[0]` (Mod+Enter) or `openActions(row)` (Shift+Enter).

**Rendering:**
- `PaletteList` uses `item.id` as the cmdk value and sets `disabled` from `disabledReason`
  (`_parts/palette-list.tsx:L34–L37`).
- `PaletteFooter` shows the hints of `actions[0]` for an enabled selected row on root (`_parts/palette-footer.tsx:L28–L48`).

**Recent provider** (`providers/recent-items-provider.ts`):
- `RECENT_PROVIDER_ID = "recent"`, `toRecentRowId`, `recentSourceId` (L10–L23).
- The copy rules (L55–L64): `score` dropped, `id`, `section` and `description` overridden, everything else kept.
  Pins copy these rules.

**Stable rows today** (`getStableItems`, sprint 7b): `nav`, `content`, `tools`, `settings`, `prefs`, `system`,
`schema`. Page rows among them: `nav:settings`, `content:new`, `schema:edit`. Disabled-capable rows:
`content:create:<slug>` and `content:new` (`requires`); `prefs:*` and `system:status` (transient
`unavailableReason`). None carries `actions`.

**Patterns to copy:**
- Query plus a saving path with toasts: `features/settings/hooks/use-notification-pref-toggle.ts:L23–L46`. Copy the
  shape only; nothing is imported from there.
- `rpc` call shape: `features/settings/api/settings.api.ts:L62–L69`.
- QueryClient defaults: `staleTime` 5 min, `retry: 1` (`lib/query-client.ts:L8–L13`).
- Icons: `Pin` and `PinOff` are exported by `reicon-react` through `@/components/icons`.

**Tests:**
- `command-palette.test.tsx`:
  - hoisted mocks (L18–L24);
  - `@/lib/rpc` mocked (L28);
  - `useMe` → `CANONICAL_USERS.editor.id`, `useSchema` → `CANONICAL_SEEDS` (L37–L46);
  - `renderPalette` builds a fresh `QueryClient` with `retry: false` (L84–L92).
- `src/test/setup.ts:L45–L47` clears `localStorage` after each test.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/dashboard/src/features/command-palette/use-palette-pins.ts`
- `apps/dashboard/src/features/command-palette/providers/pins-provider.ts`
- `apps/dashboard/src/features/command-palette/lib/pin-actions.ts`
- `apps/dashboard/src/features/command-palette/test/unit/use-palette-pins.test.tsx`
- `apps/dashboard/src/features/command-palette/test/unit/pins-provider.test.ts`
- `apps/dashboard/src/features/command-palette/test/unit/pin-actions.test.ts`

Edit:
- `apps/dashboard/src/features/command-palette/command-palette.tsx`
- `apps/dashboard/src/features/command-palette/providers/recent-items-provider.ts`: optional `exclude`.
- `apps/dashboard/src/features/command-palette/test/unit/recent-items-provider.test.ts`: one case added.
- `apps/dashboard/src/features/command-palette/test/unit/command-palette.test.tsx`: the rpc mock gains `settings`,
  and cases are added.
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`
- `docs/features/command-palette.md`
- `stages/01_sprint_planning/output/backlog/ROADMAP.md`: already updated at planning (entry 8 DONE, entry 9 IN
  FLIGHT). The executor does not touch it.

Not touched: `apps/api`, `packages/*`, `types.ts`, `index.ts`, `lib/stable-items.ts`, `lib/action-rows.ts`,
`lib/collect-palette-items.ts`, `lib/rank-palette-items.ts`, `use-command-palette.ts`, `use-recent-items.ts`,
`_parts/*`, every other provider, `pages/*`, `App.tsx`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Pins hook (`use-palette-pins.ts`, new)**

```ts
export type PalettePinsState =
  | { readonly status: "ready"; readonly ids: readonly string[]; readonly saving: boolean }
  | { readonly status: "unavailable" }

export interface PalettePinsApi {
  readonly state: PalettePinsState
  /** Appends `id`; toasts with `label`. No request when not ready, saving, already pinned or at PALETTE_PINS_MAX. */
  readonly pin: (id: string, label: string) => void
  /** Removes `id`; toasts with `label`. No request when not ready, saving or not pinned. */
  readonly unpin: (id: string, label: string) => void
}

/** The signed-in user's palette pins, persisted server side (`/api/settings/ui-preferences`). */
export function usePalettePins(userId: string | undefined): PalettePinsApi
```

Query:
- key `["ui-preferences", userId]`, private to this file as `uiPreferencesQueryKey(userId)`. The user id in the key
  means another account never sees a previous user's cached pins.
- `enabled: userId !== undefined`.
- `queryFn`: `rpc.api.settings["ui-preferences"].$get()`, then `.json()`, typed `UiPreferences` from
  `@beechcms/core`.
- QueryClient defaults otherwise. The query is mounted with the palette, which is always mounted, so the ids are
  in cache before the first open (brief rule 10).

State:
- `ready` only when the query has `data`. `ids = data.palettePins` and `saving = mutation.isPending`.
- No user, pending or failed → `unavailable` (finding 4).

Mutation:
- `mutationFn(palettePins: string[])` PUTs `{ json: { palettePins } }` and returns the parsed 200 body.
- `onSuccess`: `queryClient.setQueryData(uiPreferencesQueryKey(userId), stored)`. The cache only ever holds what
  the server stored (finding 5).
- No `onMutate`, no `invalidateQueries`.

`pin(id, label)`:
- not ready, `saving`, or `id` already in `ids` → no-op;
- `ids.length >= PALETTE_PINS_MAX` → `toast.error(t("commandPalette.pins.full", { max: PALETTE_PINS_MAX }))`, no
  request;
- otherwise mutate with `[...ids, id]`. New pins append, so the stored order is the pin order. On success,
  `toast.success(t("commandPalette.pins.pinned", { label }))`. On error,
  `toast.error(t("commandPalette.pins.saveFailed"))`.

`unpin(id, label)`:
- same guards;
- mutates with `ids` without `id`;
- `pins.unpinned` / `pins.saveFailed` toasts.

Both callbacks are `useCallback` over the state and the mutation. The returned object is memoised, as
`use-recent-items.ts:L52` does.

**Task 2 — Pins provider (`providers/pins-provider.ts`, new)**

```ts
export const PIN_PROVIDER_ID = "pin"

/** Row id of the pinned copy of the stable row `sourceId`: `pin:<sourceId>`. */
export function toPinRowId(sourceId: string): string

/** The stable id behind a pinned row id; null for any other id ("pin:" alone included). */
export function pinSourceId(rowId: string): string | null

/** The user's pins in stored order, on the idle root only; each one resolves against `sources`. */
export function createPinsProvider(deps: {
  t: TFunction
  pins: PalettePinsState
  /** Every other local provider; their stable rows are what pinned ids resolve against. */
  sources: readonly PaletteProvider[]
  /** false until every source's data has loaded: unresolved pins are then omitted, not shown as unavailable. */
  catalogueReady: boolean
  unpin: (id: string, label: string) => void
}): PaletteProvider
```

Provider rules:
- `id: PIN_PROVIDER_ID`, `pages: ["root"]`, no `prefix`, no `getStableItems`.
- `getItems` returns `[]` unless `page === "root"`, `query === ""` and there is no `prefix` (same guard as
  `recent-items-provider.ts:L48`). It also returns `[]` when `pins.status === "unavailable"`.
- Otherwise it calls `collectStableItems(sources, { permissions })` once. For each stored id, in order:
  - **resolved**: the source row copied exactly as the recent provider copies it (L58–L64): `id: toPinRowId(id)`,
    `section: t("commandPalette.pins.section")`, `description: source.description ?? source.section`, `score`
    dropped, everything else kept. `collectPaletteItems` then disables the copy exactly when it would disable the
    source (finding 1).
  - **unresolved, `catalogueReady` false**: skipped (finding 3).
  - **unresolved, `catalogueReady` true**: an enabled cleanup row (finding 2):
    - `id: toPinRowId(id)` and `section` as above;
    - `label: t("commandPalette.pins.unavailableLabel")`;
    - `description: t("commandPalette.pins.unavailableHint", { id })`;
    - `icon: PinOff`;
    - `perform: { kind: "run", run: () => unpin(id, id) }`;
    - no `requires`, no `actions`.
- Pure apart from calling `unpin` inside `run`: no request, no clock.

**Task 3 — Pin actions (`lib/pin-actions.ts`, new)**

```ts
export const PIN_ACTION_ID = "pin"
export const UNPIN_ACTION_ID = "unpin"

/**
 * `items` with a trailing Pin or Unpin action on every row whose stable id is in `stable`: a source row, its recent
 * copy or its pinned copy. Rows are unchanged when the pins are unavailable or saving, or when the id is not
 * pinnable. Returns a new array and never mutates `items`.
 */
export function withPinActions(
  items: readonly ResolvedPaletteItem[],
  deps: {
    t: TFunction
    pins: PalettePinsState
    stable: ReadonlyMap<string, PaletteItem>
    pin: (id: string, label: string) => void
    unpin: (id: string, label: string) => void
  },
): ResolvedPaletteItem[]
```

Rules:
- `pins.status === "unavailable"` or `pins.saving` → every row unchanged (finding 4).
- `sourceId = pinSourceId(item.id) ?? recentSourceId(item.id) ?? item.id`.
- Unchanged when:
  - `stable` has no `sourceId`. This covers search hits, notes, computed rows, context actions, shortcuts and
    unavailable pin rows;
  - `sourceId.length > PALETTE_PIN_ID_MAX_LENGTH`, which the server would refuse.
- Otherwise append, after the row's existing actions (an existing first action keeps Mod+Enter):
  - when `pins.ids` includes `sourceId`: `{ id: UNPIN_ACTION_ID, label: t("commandPalette.pins.unpin"), icon: PinOff,
    perform: { kind: "run", run: () => unpin(sourceId, label) } }`;
  - otherwise: `{ id: PIN_ACTION_ID, label: t("commandPalette.pins.pin"), icon: Pin,
    perform: { kind: "run", run: () => pin(sourceId, label) } }`.
- `label` is the **source** row's label (`stable.get(sourceId).label`), so the toast names the destination and
  never says "Unavailable item".
- Disabled rows are decorated too. The engine never runs actions on them (`command-palette.tsx:L295`) and the footer
  never shows them (`palette-footer.tsx:L29`). Leaving them decorated keeps the rule in one place.
- The import direction is `lib/pin-actions.ts` → `providers/pins-provider.ts` and
  `providers/recent-items-provider.ts`, which reuse their id helpers. Neither provider imports this file, so there
  is no cycle.

**Task 4 — Recent provider (`providers/recent-items-provider.ts`)**

- `createRecentItemsProvider` deps gain:

  ```ts
  /** Stable ids never listed as recent (the pinned ones, shown in their own section). */
  exclude?: ReadonlySet<string>
  ```
- In the loop (L55), an id in `exclude` is skipped before the lookup. Nothing else changes.

**Task 5 — Engine wiring (`command-palette.tsx`)**

- `const pins = usePalettePins(me?.id)`, next to `useRecentItems` (L132).
- `const catalogueReady = seedsData !== undefined`. Content rows are the only stable rows that wait on a query the
  engine owns. Host rows are synchronous or carry their own `unavailableReason` (Section 2).
- `const pinnedIds = React.useMemo(() => new Set(pins.state.status === "ready" ? pins.state.ids : []), [pins.state])`.
- Providers memo (L170–L194):
  - `sources` stays `[calculator, conversions, contextActions, ...afterContext]` and is shared by both copies;
  - insert `createPinsProvider({ t, pins: pins.state, sources, catalogueReady, unpin: pins.unpin })` between
    `contextActions` and `recent`;
  - pass `exclude: pinnedIds` to `createRecentItemsProvider`;
  - final order: calculator, conversions, context, pin, recent, then `afterContext`;
  - add `pins.state`, `pins.unpin`, `catalogueReady` and `pinnedIds` to the dependencies;
  - update the L168 comment to "idle order: context, pinned, recent, navigation, content, host, notes, tools".
- New memo after `context`: `const stable = React.useMemo(() => collectStableItems(providers, { permissions: { can,
  canAnywhere, canGlobally } }), [providers, can, canAnywhere, canGlobally])` (finding 7).
- Items memo (L213–L221):
  - the `actions` branch is unchanged;
  - elsewhere, the ranked local rows go through `withPinActions(…, { t, pins: pins.state, stable, pin: pins.pin,
    unpin: pins.unpin })` before the async rows are appended. Async rows are never decorated;
  - add the new dependencies.
- `perform` (L254–L260): replace the inline `collectStableItems` call with the `stable` memo. Recording is otherwise
  unchanged, so a `pin:` row records nothing (VETO Audit).
- `handleKeyDown`, `runPerform`, `confirmPendingAction`, `PaletteList` and `PaletteFooter` are unchanged. Pin is a
  `run` action: Mod+Enter runs it and closes the palette, and Shift+Enter lists it on the actions page through
  `toActionRows`.

**Task 6 — Locale keys (`en.json` / `it.json`)**

One nested object `commandPalette.pins`, placed after `commandPalette.notes`:

| Key | en | it |
|-----|----|----|
| `section` | `Pinned` | `Fissati` |
| `pin` | `Pin to the top` | `Fissa in cima` |
| `unpin` | `Unpin` | `Rimuovi dai fissati` |
| `pinned` | `Pinned: {{label}}` | `Fissato: {{label}}` |
| `unpinned` | `Unpinned: {{label}}` | `Rimosso dai fissati: {{label}}` |
| `full` | `{{max}} items pinned: unpin one to pin another` | `{{max}} voci fissate: rimuovine una per fissarne un'altra` |
| `saveFailed` | `Pins not saved: try again. Your list is unchanged` | `Fissati non salvati: riprova. L'elenco non è cambiato` |
| `unavailableLabel` | `Unavailable item` | `Voce non disponibile` |
| `unavailableHint` | `{{id}} · Enter removes the pin` | `{{id}} · Invio rimuove il fissato` |

**Task 7 — Docs (`docs/features/command-palette.md`)**

Add after the **Recent** bullet (L19):
- **Pinned**: Mod+Enter on a screen, seed, setting or command (or *Pin to the top* in its Shift+Enter actions) pins
  it. The palette then opens with your pins at the top, under the page actions, on every browser you sign in to (up
  to eight, saved to your account). A pin you can no longer run is shown disabled, and returns when the permission
  does. A pin whose item no longer exists is shown as *Unavailable item*, and Enter removes it. If saving fails,
  you see an error and your pins stay as they were.

**Task 8 — Design (UI contract)**

- No new component, token or variant. The section is a `CommandGroup` rendered by the existing `PaletteList`
  grouping.
- The icons are `Pin` / `PinOff` from `@/components/icons` in the existing `size-4 text-muted-foreground` slot
  (`palette-list.tsx:L39`).
- The feedback uses the existing `sonner` toasts (`toast.success` after the server answered, `toast.error` on
  failure or at the cap), per `design_system.html:L510`.
- No colour class is added, so the design-token check covers only the touched `.tsx` file.

**Task 9 — Tests**

Fixtures:
- user ids from `CANONICAL_USERS` (editor, admin);
- seeds from `CANONICAL_SEEDS`;
- `t`: `(key) => key` in node suites;
- source rows: hand-rolled `PaletteItem` literals through a local `row(id, overrides)` helper, as
  `recent-items-provider.test.ts` does. This is a palette contract, not a domain entity (Rule 3.5);
- permissions as literal `PalettePermissions` stubs;
- the HTTP boundary: `vi.mock("@/lib/rpc")` (Rule 3.10), returning `{ json: async () => body }` as
  `command-palette.test.tsx:L80–L82` does. A rejected `$put` stands for any non-2xx, because `rpc` throws `ApiError`.

`test/unit/use-palette-pins.test.tsx`, unit (happy-dom, `renderHook` inside a fresh `QueryClientProvider` with
`retry: false`). `sonner` and `@/lib/rpc` are mocked. `describe("usePalettePins")`:
- `it` without a user id the state is unavailable and no request is made.
- `it` while the GET is pending, and after it fails, the state is unavailable (array-driven).
- `it` once loaded the state is ready with the stored ids in order.
- `it` pin PUTs the whole container with the id appended, and the state then lists it.
- `it` pin toasts success with the label only after the server answered.
- `it` a rejected PUT toasts the error and leaves the ids exactly as loaded. Regression guard: never a falsely saved
  list (brief §4).
- `it` pin at PALETTE_PINS_MAX toasts the cap and makes no request.
- `it` pin of an id already pinned makes no request.
- `it` unpin PUTs the list without the id, and the state no longer lists it.
- `it` while a write is in flight the state reports saving and a second pin makes no request.
- `it` the cached pins of one user are never exposed after the user id changes.

`test/unit/pins-provider.test.ts`, unit, `// @vitest-environment node`.

`describe("createPinsProvider")`:
- `it` on the idle root lists the stored ids in stored order under the Pinned section, each with its source's label,
  icon and perform.
- `it` gives each row the pin: id and the source's description, else its section, as the second line.
- `it` emits nothing while typing, with a prefix, or on a sub-page (array-driven).
- `it` emits nothing when the pins are unavailable.
- `it` a source requiring a permission the caller lacks is listed disabled with that permission. Resolve through
  `collectPaletteItems` with a `describeMissing` stub. Regression guard: a pin never runs what its source cannot.
- `it` an unresolved id is omitted while the catalogue is not ready.
- `it` an unresolved id is listed as an enabled unavailable row once the catalogue is ready, and running it unpins
  that id.

`describe("pinSourceId")`:
- `it` round-trips toPinRowId and returns null for any other id, "pin:" alone included.

`test/unit/pin-actions.test.ts`, unit, `// @vitest-environment node`. `describe("withPinActions")`:
- `it` appends Pin to a stable row that is not pinned, and running it pins the source id with the source label.
- `it` appends Unpin to a stable row that is pinned, and running it unpins the source id.
- `it` decorates a recent copy and a pinned copy with the action for their source id (array-driven).
- `it` keeps an existing first action first and appends the pin action after it.
- `it` leaves unchanged a row whose id is not in the stable lookup (for example a search hit).
- `it` leaves every row unchanged while the pins are unavailable or saving (array-driven).
- `it` leaves unchanged a row whose id exceeds PALETTE_PIN_ID_MAX_LENGTH.

`recent-items-provider.test.ts`, edit. Existing cases stay untouched. Add:
- `it` skips a stored id that is in exclude.

`command-palette.test.tsx`, edit:
- The hoisted block gains `uiPreferencesGetMock` and `uiPreferencesPutMock`.
- The `@/lib/rpc` factory (L28) becomes `{ api: { search: { $get: searchMock }, settings: { "ui-preferences": {
  $get: uiPreferencesGetMock, $put: uiPreferencesPutMock } } } }`.
- `beforeEach` resolves GET to `{ palettePins: [] }` and PUT to an echo of the sent `json`.
- Existing cases stay byte-identical.

Add:
- `it` the idle root shows no Pinned section when nothing is pinned.
- `it` stored pins are listed first under Pinned, after the page actions and before Recent.
- `it` Mod+Enter on a navigation row PUTs it as a pin and closes the palette; reopening lists it under Pinned.
- `it` Shift+Enter on a stable row lists Pin to the top on the actions page.
- `it` Mod+Enter on a pinned row unpins it.
- `it` a pinned create row is listed disabled with the missing permission once content:create on its seed is revoked.
- `it` a pin whose seed no longer exists is listed as unavailable, and Enter on it PUTs the list without it.
- `it` a pinned row is not listed again under Recent.
- `it` a rejected PUT toasts the error and the reopened palette shows the pins as before.
- `it` a search row offers no pin action. Regression guard: search hits are never pins (brief §5).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`: `npx vitest run src/features/command-palette src/pages src/test/cross-slice`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx`
- `pnpm --filter @beechcms/dashboard build`
- `pnpm beech test --diff`. This sprint touches no `packages/` or `apps/api` file. The inherited
  `packages/core` "no tests were run" exit (reviews of sprints 6–7b) is not caused here.
- `graphify update . --force`. Then:
  - `graphify affected "withPinActions()" --depth 2` and `graphify affected "createPinsProvider()" --depth 2` must
    list only palette slice files and their tests;
  - grep `apps/dashboard/src/features/command-palette` (excluding `/test/`) for `@/features/` imports other than
    `@/features/shared`: zero matches.
- Manual gate (human, dev stack with `pnpm beech dev`):
  - with nothing pinned, the idle root has no Pinned section;
  - select Analytics, press Mod+Enter: toast "Pinned: Analytics"; reopen: Analytics is first under Pinned (below the
    page actions when an entry is open) and no longer under Recent;
  - Shift+Enter on a seed shows *Pin to the top*; pin it;
  - sign in on a second browser as the same user: the same pins, in the same order;
  - sign in as another user: no pins;
  - pin eight rows, then try a ninth: the cap toast, and nothing changes;
  - as admin, pin *Create in <seed>*, revoke `content:create` on that seed for the role, and reload: the pin is
    disabled with the missing permission; restore the permission: it is enabled again;
  - delete a pinned seed: the pin reads *Unavailable item*; Enter removes it;
  - stop the API (or block the request in devtools), then pin: the error toast; reopen: the pins are unchanged.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PalettePinsState`, `PalettePinsApi`, `usePalettePins`, `PIN_PROVIDER_ID`, `toPinRowId`, `pinSourceId`,
      `createPinsProvider`, `PIN_ACTION_ID`, `UNPIN_ACTION_ID` and `withPinActions` match their Section 4 signatures.
- [ ] Pins are read and written only through `rpc.api.settings["ui-preferences"]`. The query key carries the user
      id. No `features/settings` import.
- [ ] The cache changes only from a 200 PUT response. A failed write toasts `pins.saveFailed` and leaves the list
      exactly as loaded.
- [ ] No PUT is sent while the list is not loaded, while a write is in flight, at `PALETTE_PINS_MAX`, or for an
      already pinned or unpinned id.
- [ ] *Pinned* appears only on the idle root, after the context actions and before Recent, in stored order. Pinned
      ids are excluded from Recent.
- [ ] Pinned row ids are `pin:<sourceId>`. A pin is disabled exactly when its source is. An unresolved pin is
      omitted until the schema has loaded, then shown as an enabled *Unavailable item* row whose Enter unpins it.
- [ ] Pin or Unpin is appended to every row whose stable id resolves (source, recent copy, pinned copy) and to no
      other row. Search hits, notes, computed, context, shortcut and action-page rows never get one.
- [ ] Mod+Enter on a stable row with no other action pins it. Shift+Enter lists the pin action.
- [ ] `createRecentItemsProvider`'s `exclude` is optional, and its existing suite passes unedited.
- [ ] No change in `apps/api`, `packages/*`, `types.ts`, `index.ts`, `_parts/*` or `pages/*`. No new component,
      token or permission.
- [ ] All nine `commandPalette.pins.*` strings exist in `en.json` and `it.json`.
- [ ] tsc, lint, the design-token check, the scoped vitest run and the dashboard build pass. Existing test cases
      pass unedited (only the shared rpc mock and `beforeEach` of `command-palette.test.tsx` change).
- [ ] `docs/features/command-palette.md` describes the Pinned section.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Any server change: routes, validation, caps, migration and isolation tests shipped in roadmap entry 8
  (`UiPreferencesApi`).
- Reordering pins, a "manage pins" page, pin import or export, or a settings tab for pins.
- Optimistic updates, a refetch on every palette open, and cross-tab or cross-device conflict resolution. PUT is
  last-write-wins, and another device's change arrives on the next fetch (window focus or reload).
- Unpinning a pin while it is disabled by a missing permission. cmdk cannot select a disabled row, and the brief
  keeps such a pin "in elenco … disabilitato" until the permission returns.
- Automatic pruning of unresolved pins.
- Pinning search hits, notes, computed rows, page actions, shortcuts or action-page rows (brief §5). Recording a
  pinned row as recent.
- A dedicated pin key binding, or a pointer entry point to the row submenu.
- Media actions → roadmap entry 6b (blocked on a media library page).
- Any change to `types.ts`, `index.ts`, `lib/stable-items.ts`, `lib/action-rows.ts`, `lib/collect-palette-items.ts`,
  `lib/rank-palette-items.ts`, `use-command-palette.ts`, `use-recent-items.ts`, `_parts/*`, the other providers,
  `pages/*` or `App.tsx`.
