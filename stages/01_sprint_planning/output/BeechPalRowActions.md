# Sprint Plan — BeechPalRowActions (BeechPal, sprint 5 of 10)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 4b).
Feature brief: `stages/00_ideation/output/feature_brief.md`, §4 "Prefissi e tastiera" ("Invio esegue
l'azione primaria della riga selezionata; l'azione secondaria, la copia dell'identificativo o del
valore e il sottomenu delle azioni sono accessibili da tastiera") and §4 "Esecuzione delle azioni"
("l'identità del bersaglio si fissa al momento della selezione dell'azione").
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`,
`docs/Sprints/BeechPalContentSearch/`.

Scope note on computed rows: the roadmap entry lists "copy value on computed rows". Since sprint 2
the calculator and conversion rows already copy their value on Enter (`perform: { kind: "copy" }`,
`providers/calculator-provider.ts:L39`, `providers/conversions-provider.ts:L55`). A secondary action
doing the same thing would be a duplicate. Computed rows therefore get **no** action list. The
brief's "copia del valore accessibile da tastiera" is already met by Enter. Search rows are the only
consumer this sprint (copy ID).

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30143 nodes, 44094 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L103` | Engine entry. Gains the key bindings, the actions page rows and the footer hints. Public props unchanged. |
| `PaletteItem` | `features/command-palette/types.ts:L50` | Gains the optional `actions` list. 22 dependants at depth 2, all inside the slice or the composition root; the field is optional, so none of them changes. |
| `CommandPage` | `features/command-palette/types.ts:L11` | Gains the engine-owned `"actions"` member. |
| `useCommandPalette()` / `CommandPaletteState` | `use-command-palette.ts:L8`, `types.ts:L19` | Holds the frozen target and the query to restore; `popPage` restores it. |
| `createContentSearchProvider()` | `providers/content-search-provider.ts:L18` | First consumer: each hit row declares a Copy ID action. |
| `PaletteList()` / `PaletteRow` | `_parts/palette-list.tsx:L63`, `L28` | Row key caps move to the `Kbd` component. No structural change. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. The hit id is already in `SearchResultItem.id`.
- `apps/dashboard`:
  - `src/features/command-palette/` (owner slice): row action contract, `"actions"` page, key
    binding classifier, action rows builder, footer part, Copy ID on search rows.
  - `src/locales/en.json`, `src/locales/it.json`: three keys added under `commandPalette`.
  - Shared, read-only imports: `@/components/ui/kbd`, `@/lib/platform` (`MOD_KEY_LABEL`),
    `@/components/icons` (`Copy`). None is a feature slice.
  - `src/pages/*` (composition root) and `App.tsx`: unchanged.
- `docs/features/command-palette.md`: two rows added to the keyboard table.

**c) `graphify affected` impact analysis**

```
graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts, palette-providers.test.ts

graphify affected "PaletteItem" --depth 2
- slice: index.ts, collect-palette-items.ts, content-provider.ts, content-search-provider.ts,
  navigation-provider.ts, tools-provider.ts, use-async-palette-items.ts (QueryState),
  command-palette.tsx, ResolvedPaletteItem [inherits], 8 unit test files
- outside: palette-providers.ts(+test), app-command-palette.tsx, App.tsx

graphify affected "CommandPage" --depth 2
- command-palette.tsx, index.ts, parse-palette-query.ts, use-command-palette.ts,
  collect-palette-items.test.ts, content-provider.test.ts, use-async-palette-items.test.tsx,
  command-palette.test.tsx, parse-palette-query.test.ts, palette-providers.ts(+test), App.tsx,
  app-command-palette.tsx

graphify affected "useCommandPalette()" --depth 2
- command-palette.tsx [imports, calls], index.ts [re_exports]; App.tsx / app-command-palette.tsx /
  palette-providers.ts only through the barrel (grep: no call outside command-palette.tsx)

graphify affected "CommandPaletteState" --depth 2
- command-palette.tsx, use-command-palette.ts, index.ts [re_exports]; no other reader

graphify affected "createContentSearchProvider()" --depth 2
- command-palette.tsx, content-search-provider.test.ts, index.ts       (slice-internal only)

graphify affected "PaletteList()" --depth 2
- command-palette.tsx, index.ts                                       (slice-internal only)
```

Breaking-change verdict:
- `PaletteItem.actions` is optional: every provider, the composition root and every test literal
  compile unchanged.
- Adding `"actions"` to `CommandPage` forces one new key in the `PLACEHOLDER` record
  (`command-palette.tsx:L113`, the only `Record<CommandPage, …>` in `src`). No exhaustive switch over
  `CommandPage` exists. `parsePaletteQuery` returns prefix-free text on any non-root page
  (`lib/parse-palette-query.ts:L18`), so `"actions"` needs no change there.
- Narrowing `PalettePerform`'s `page` member to `Exclude<CommandPage, "actions">` breaks no caller:
  the only `kind: "page"` literals are `"seeds"`, `"create"` (`providers/content-provider.ts:L70`,
  `L82`) and `"edit-schema"` (`pages/palette-providers.ts:L119`).
- `CommandPaletteState` gains two members. Only `useCommandPalette` produces it and only
  `CommandPalette` reads it.
- No provider declares `"actions"` in `pages`, so `collectPaletteItems` and `useAsyncPaletteItems`
  are idle on that page (`servesContext`, `lib/collect-palette-items.ts:L14`). The async query
  observer for the root query is dropped when the page changes, and its cache entry stays valid for
  30 s (`use-async-palette-items.ts:L12`). Going back to root with the restored query therefore
  serves the search rows from cache.

Findings that shape the plan:
1. **cmdk key order** (cmdk 1.1.1, `node_modules/.pnpm/cmdk@1.1.1_*/node_modules/cmdk/dist/index.mjs`,
   the root `onKeyDown`). cmdk calls the caller's `onKeyDown` first. It then skips its own handling
   when `e.defaultPrevented` is set or the event is composing (IME, `keyCode 229`). Its `Enter` case
   does not look at modifiers: Shift+Enter or Ctrl+Enter left alone would run the primary action. The
   engine must therefore `preventDefault()` every Enter that carries Shift, Ctrl or Meta.
2. **Selected row lookup.** cmdk finds the selected row with
   `root.querySelector('[cmdk-item=""][aria-selected="true"]')`. The row's value sits in `data-value`
   and equals `item.id`, trimmed, not lower-cased (`PaletteRow` passes `value={item.id}`,
   `_parts/palette-list.tsx:L34`). Disabled rows are never selectable
   (`[cmdk-item]:not([aria-disabled="true"])`). The key handler reads the selected row the same way,
   from `event.currentTarget`. A controlled `value` was rejected: cmdk calls `onValueChange` only in
   controlled mode, and that mode needs a manual reset on every page change and on close. Without
   the reset, a stale value blocks cmdk's select-first-row on the next page. The footer reads the
   selection reactively with `useCommandState((state) => state.value)`, which `EmptyMessage` already
   uses (`command-palette.tsx:L57`).
3. **Key collisions.** Taken today:
   - Cmd/Ctrl+K toggle, Alt+N create, Backspace-on-empty back: document listener,
     `use-command-palette.ts:L30–L59`.
   - Cmd/Ctrl+B sidebar: window listener, `components/ui/sidebar.tsx:L110–L125`.
   - cmdk's own keys: arrows, Home/End, Enter, Ctrl+N/J/P/K vim bindings.
   - Seed builder Mod+Enter: React `onKeyDown` on its own dialog (`SeedFormDialog.tsx:L65`). The
     palette is mounted in `App.tsx`, outside that React tree, so its events never reach it.

   **Mod+Enter** (secondary action) and **Shift+Enter** (open actions) collide with none of these,
   once finding 1 is applied. Mod = Ctrl or Meta, as for the global toggle.
4. **Key caps.** The design contract lists `Kbd`/`KbdGroup` as the component for shortcuts
   (`_config/design_system.html`, component "Tabs, Breadcrumb, Pagination, Kbd"). The modifier label
   comes from `MOD_KEY_LABEL` (`lib/platform.ts:L9`). The pattern to copy is
   `features/seed-builder/components/SeedFormFooter.tsx:L52–L58`. `PaletteRow` hand-rolls `<kbd>`
   today (`_parts/palette-list.tsx:L51–L57`). It moves to `Kbd` so the row caps and the footer caps
   look the same.
5. **Leaving the actions page.** `pushPage`/`popPage` clear the query (`use-command-palette.ts:L16–L27`).
   Without a restore, Escape on the actions page would drop the user's search and its results. The
   query in place when the actions page opened is saved and restored on the way back.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** The contract is one optional list of `{ id, label, icon, perform }` per row: the
  smallest shape that carries copy ID now and pin/unpin in entry 9. Cut as speculative:
  - no per-action permission (no action this sprint needs one);
  - no per-action shortcut other than "first action";
  - no primary action repeated in the submenu;
  - no secondary action on computed rows (it would duplicate Enter);
  - no "open in new tab";
  - no pointer entry point to the submenu;
  - no selection restore on the way back;
  - no export of the action type from the barrel (no host needs it yet).

  **No VETO.**
- **Rule 2, Botanical invariant.** No data access of any kind. The copied id is the `id` the search
  API already returns. **Respected.**
- **Rule 3, VSA.** All code lives in `features/command-palette/`. New imports: `@/components/ui/kbd`,
  `@/lib/platform` and `@/components/icons`. None is a feature slice. The slice does not reuse the
  content slice's `content.actions.copyId` key; it gets its own `commandPalette.copyId`, as previous
  sprints did. The composition root is untouched. **Respected.**
- **Rule 4, Cloudflare purity.** No request is added. Opening and leaving the actions page reuses
  the 30 s search cache. **Respected.**
- **Rule 5, minimal blueprint.** Tier footprint: core 0, api 0. Dashboard: 1 slice, 3 new source
  files, 5 edited; 2 new test files, 2 edited; 2 locale files; 1 doc. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–4 made every palette row come from a provider. Each row has exactly one behaviour: Enter
runs `perform`. The brief needs a second, keyboard-reachable layer: a secondary action, copy of the
identifier, and a submenu of actions for the selected row. The target of that submenu must be fixed
at the moment it opens. Entry 9 (pins) puts pin/unpin in that submenu. Entry 6 (context actions)
will reuse the same "frozen target" rule. So the submenu is an engine capability, built once and
proved on a simple consumer (copy ID on search rows) before anything destructive or persistent
depends on it.

This sprint delivers, in order:
- the per-row action contract;
- the engine-owned `actions` page with the target frozen at selection;
- two key bindings, Mod+Enter (first action) and Shift+Enter (open the submenu), plus their footer
  hints;
- the first consumer, Copy ID on search rows.

VSA: everything lives in the palette slice. Providers declare actions on their own rows; the engine
renders and runs them through the one `perform` path it already has (brief rule 1). Botanical
invariant: no data access; nothing touches `apps/api` or `packages/`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 4 (`BeechPalContentSearch`) is in the working tree of
`feature/beechpal-content-search` and has not been committed (its review ran on the working tree).
The executor starts from that code. The files listed below are as of that tree.

**Contract** (`types.ts`):
- `CommandPage = "root" | "seeds" | "create" | "settings" | "edit-schema"` (L11);
- `CommandPaletteState` (L19–L28);
- `PalettePerform`, four kinds: `navigate`, `page`, `run`, `copy` (L44–L48);
- `PaletteItem`, with optional `status`, `shortcut`, `requires`, `score` (L50–L70);
- `ResolvedPaletteItem` adds `disabledReason` (L105).

**State hook** (`use-command-palette.ts`):
- `pages` stack starts at `["root"]` (L10);
- `pushPage` and `popPage` both clear `search` (L16–L27);
- the document keydown listener handles Mod+K, Alt+N and Backspace-on-empty (L30–L63);
- closing resets `search` and `pages` (L65–L71).

**Engine** (`command-palette.tsx`):
- `PLACEHOLDER: Record<CommandPage, string>` (L113);
- providers memo (L136), async providers memo (L148), `parsed` and `context` (L153–L162);
- `items` = ranked local rows followed by settled async rows (L165–L170);
- `copyToClipboard` (L172) toasts `commandPalette.copied` or `common.copyFailed`;
- `perform(item)` (L183–L202) switches on `item.perform.kind`: it navigates and closes, pushes a
  page, runs and closes, or copies and closes;
- `<Command loop shouldFilter={false}>` (L223) has no `onKeyDown` today;
- the footer `div` with `commandPalette.backHint` renders on non-root pages (L239–L243), with
  classes `p-3 border-t text-xs text-muted-foreground bg-muted/20`;
- Escape on a sub-page pops instead of closing (`onEscapeKeyDown`, L214–L221).

**Search rows** (`providers/content-search-provider.ts:L41–L53`): id `search:<hit.id>`, section =
seed label, label = title or `untitledEntry`, `StatusBadge` status, `author · date` description,
`perform: navigate /content/<slug>/<id>`.

**Row rendering** (`_parts/palette-list.tsx`): `PaletteRow` (L28) renders
`<CommandItem value={item.id} disabled={…} onSelect={() => onPerform(item)}>`. Shortcut caps are
raw `<kbd>` elements (L51–L57).

**Tests** (`test/unit/command-palette.test.tsx`):
- render wrapper `renderPalette` (L72);
- helpers `typeInRoot` (L100) and `stubClipboard` (L93);
- mocks for `sonner`, `@/lib/rpc`, `@/hooks/use-debounce`, `react-router-dom`, `@/features/shared`,
  `@/lib/theme` (L19–L45);
- hit fixture `searchHit()` with `HIT_ID` (L49–L66);
- Enter is fired on the input with `fireEvent.keyDown(input, { key: "Enter", code: "Enter" })`
  (L223).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

All under `apps/dashboard/src/features/command-palette/` unless stated otherwise.

Create:
- `lib/palette-key-binding.ts`: pure classifier for the two bindings.
- `lib/action-rows.ts`: pure builder of the actions page rows from a frozen target.
- `_parts/palette-footer.tsx`: the footer, with the back hint on sub-pages and the action hints on
  root.
- `test/unit/palette-key-binding.test.ts`
- `test/unit/action-rows.test.ts`

Edit:
- `types.ts`: `PaletteRowAction`, `PaletteItem.actions`, `CommandPage` `"actions"`,
  `PalettePerform` page narrowing, `CommandPaletteState` members.
- `use-command-palette.ts`: `actionsTarget`, `openActions`, query restore in `popPage`, reset on
  close.
- `command-palette.tsx`: `onKeyDown`, actions page rows, `runPerform`, `PaletteFooter`,
  `placeholderActions`.
- `_parts/palette-list.tsx`: shortcut caps through `Kbd`/`KbdGroup`.
- `providers/content-search-provider.ts`: Copy ID action on each hit row.
- `test/unit/content-search-provider.test.ts`: one case added.
- `test/unit/command-palette.test.tsx`: cases added; existing cases untouched.
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`: three keys.
- `docs/features/command-palette.md`: two keyboard-table rows.

Not touched: `apps/api`, `packages/*`, `src/pages/*`, `App.tsx`, `index.ts` (barrel), all other
providers.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Contract (`types.ts`)**

Add, verbatim:

```ts
/** A secondary action of one row. Runs through the same `perform` path as the row itself. */
export interface PaletteRowAction {
  /** Unique within its row, e.g. "copy-id". */
  readonly id: string
  readonly label: string
  readonly icon: IconComponent
  /** Never `page`: an action ends the interaction (the engine closes after it). */
  readonly perform: Exclude<PalettePerform, { readonly kind: "page" }>
}
```

On `PaletteItem`, after `perform`:

```ts
  /**
   * Secondary actions, in display order. The first runs on Mod+Enter; all are listed on the actions page (Shift+Enter).
   * Never shown or run while the row is disabled.
   */
  readonly actions?: readonly PaletteRowAction[]
```

`CommandPage` gains `| "actions"` with the comment `// Engine-owned: reached only through openActions, never declared by a provider`.

`PalettePerform` page member becomes
`{ readonly kind: "page"; readonly page: Exclude<CommandPage, "actions"> }`. The actions page needs
a target, so a provider cannot open it.

`CommandPaletteState` gains:

```ts
  /** The row whose actions the "actions" page lists, frozen when the page opened. null elsewhere. */
  actionsTarget: ResolvedPaletteItem | null
  /** Freezes `target`, remembers the current query and pushes the "actions" page. */
  openActions: (target: ResolvedPaletteItem) => void
```

`ResolvedPaletteItem` is declared below `CommandPaletteState` in the same file. A type reference
needs no reordering.

**Task 2 — State hook (`use-command-palette.ts`)**

- New state: the frozen target (`ResolvedPaletteItem | null`) and the query to restore (string).
- `openActions(target)`: stores `target` and the current `search`, then pushes `"actions"` and
  clears `search`, as `pushPage` does today. The stored object is the snapshot taken at selection.
  Later provider output (new search results, permission changes) never replaces it while the page
  is open.
- `popPage`: when the page being left is `"actions"`, set `search` to the stored query and clear
  the target. Otherwise clear `search`, as today. Escape (`onEscapeKeyDown`), Backspace-on-empty and
  the breadcrumb chips all go through `popPage`, so they behave the same.
- The close reset (L65–L71) also clears the target and the stored query.
- `openActions` is `useCallback`-stable like `pushPage`. The keydown listener's dependency list
  (L63) is unchanged: the listener does not use the new state.

**Task 3 — Key binding classifier (`lib/palette-key-binding.ts`, new)**

```ts
export type PaletteKeyBinding = "secondary-action" | "open-actions"

/**
 * Which palette binding a keydown is. null: not one, cmdk handles it.
 * Mod (Ctrl or Meta) + Enter → "secondary-action"; Shift + Enter → "open-actions".
 */
export function paletteKeyBinding(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "isComposing">,
): PaletteKeyBinding | null
```

Rules:
- `key !== "Enter"` → `null`. A composing event → `null` (same guard as cmdk).
- Ctrl or Meta held → `"secondary-action"`, whether or not Shift is also held (Mod wins).
- Shift held without Ctrl/Meta → `"open-actions"`.
- Plain Enter and Alt+Enter → `null`: cmdk runs the primary action as today.

Pure, no DOM access. The caller passes `event.nativeEvent`.

**Task 4 — Action rows builder (`lib/action-rows.ts`, new)**

```ts
/** The "actions" page rows for a frozen target: one enabled row per action, in declared order. */
export function toActionRows(target: ResolvedPaletteItem): ResolvedPaletteItem[]
```

Each row has:
- `id`: `actions:<action.id>`;
- `section`: `target.label`, so the group heading names the row the actions act on;
- `label`, `icon`: copied from the action;
- `perform`: the action's own `perform`;
- `disabledReason`: `null`;
- no `actions`, `keywords`, `score` or `status`.

A target without actions returns `[]`. Same input, same output; never throws.

**Task 5 — Engine (`command-palette.tsx`)**

- Read `actionsTarget` and `openActions` from `useCommandPalette()`. Add `PLACEHOLDER.actions =
  t("commandPalette.placeholderActions")`.
- `items` memo: on `currentPage === "actions"`, the list is
  `rankPaletteItems(toActionRows(actionsTarget), parsed.text)`, or `[]` when the target is `null`.
  Neither provider lane is collected on that page. On every other page the memo is unchanged.
- Split `perform(item)` into `runPerform(action: PalettePerform)`, which holds the existing switch
  verbatim in behaviour. `perform(item)` becomes a call to `runPerform(item.perform)`. Mod+Enter
  reuses `runPerform`, so an action closes, toasts and fails exactly like a row (brief rule 1).
- `onKeyDown` on `<Command>` (L223):
  1. `binding = paletteKeyBinding(event.nativeEvent)`. If `null`, return without touching the
     event: cmdk proceeds.
  2. Otherwise call `event.preventDefault()` first, always. cmdk then skips its Enter (finding 1),
     so these chords never run the primary action, even on a row without actions.
  3. Resolve the selected row. Read
     `event.currentTarget.querySelector('[cmdk-item=""][aria-selected="true"]')`, take its
     `data-value` and look it up in `items` by `id`. Add a one-line comment: this is the lookup cmdk
     uses for Enter.
  4. No row, a row with `disabledReason !== null`, or a row without actions → no-op.
  5. `"secondary-action"` → `runPerform(row.actions[0].perform)`.
  6. `"open-actions"` → `openActions(row)`.
  Rows on the actions page carry no `actions`, so both chords are no-ops there.
- Replace the footer block (L239–L243) with `<PaletteFooter page={currentPage} items={items} />`,
  in the same place inside `<Command>`. It must stay inside so `useCommandState` works.

**Task 6 — Footer (`_parts/palette-footer.tsx`, new)**

```ts
interface PaletteFooterProps {
  readonly page: CommandPage
  /** The rows currently listed; the selected one is found by cmdk's selected value. */
  readonly items: readonly ResolvedPaletteItem[]
}

export function PaletteFooter(props: PaletteFooterProps): React.ReactElement | null
```

Behaviour:
- On a non-root page it renders `commandPalette.backHint`, with the same classes as today (L240).
- On root it reads `useCommandState((state) => state.value)` and finds the row whose `id` equals
  that value. If the row is enabled and has at least one action, it renders two hints, right-aligned:
  - the first action's label, followed by the caps `MOD_KEY_LABEL` + `↵`;
  - `commandPalette.actionsHint`, followed by the caps `⇧` + `↵`.

  Otherwise it renders nothing, so the root footer does not exist when there is nothing to hint.
- Caps use `KbdGroup`/`Kbd` with `MOD_KEY_LABEL`, as in `SeedFormFooter.tsx:L52–L58`. Text classes
  come only from `#lookup`: `text-xs text-muted-foreground`, and container classes as the existing
  footer. No raw colours, no new type sizes.
- The hints are for display only. They are not buttons; pointer access is out of scope (Section 7).

**Task 7 — Row caps (`_parts/palette-list.tsx:L51–L57`)**

Render `item.shortcut` with `KbdGroup` + one `Kbd` per key, inside the existing `CommandShortcut`.
Drop the hand-written `kbd` classes (`font-mono bg-muted …`). Nothing else in the file changes.

**Task 8 — Copy ID on search rows (`providers/content-search-provider.ts:L44–L52`)**

Each hit row gains
`actions: [{ id: "copy-id", label: t("commandPalette.copyId"), icon: Copy, perform: { kind: "copy", value: hit.id } }]`.
`Copy` comes from `@/components/icons`. The row's `id` and primary `perform` are unchanged. The
copied value is the raw entry id, so the existing toast reads `Copied <id>`.

**Task 9 — Locales (`en.json`, `it.json`, block `commandPalette`)**

| Key | en | it |
|-----|----|----|
| `commandPalette.copyId` | `Copy ID` | `Copia ID` |
| `commandPalette.actionsHint` | `Actions` | `Azioni` |
| `commandPalette.placeholderActions` | `Choose an action…` | `Scegli un'azione…` |

**Task 10 — Docs (`docs/features/command-palette.md:L30–L36`)**

Add two rows to the keyboard table, after the Enter row, in the existing `<kbd>` style:
- ⌘/Ctrl + Enter: "Run the selected row's first secondary action (for example Copy ID on a search
  result)";
- Shift + Enter: "Open the actions of the selected row".

**Task 11 — Tests**

Fixtures: the existing `searchHit()` / `HIT_ID` / `searchResponse()` in `command-palette.test.tsx`
and `hit()` / `HIT_ID` in `content-search-provider.test.ts`. Action-row targets are inline literals
(`icon: () => null`, as `command-palette.test.tsx:L185` does). No `Date.now`, no fake timers.

`test/unit/palette-key-binding.test.ts`, unit, `// @vitest-environment node` on line 1 (pure module,
as in `content-search-provider.test.ts`). Events are plain objects matching the `Pick`.
`describe("paletteKeyBinding")`:
- `it` plain Enter and Alt+Enter are not palette bindings and return null (array-driven, Rule 1.6).
- `it` Ctrl+Enter and Meta+Enter return secondary-action (array-driven).
- `it` Shift+Enter returns open-actions.
- `it` Ctrl+Shift+Enter returns secondary-action because Mod wins over Shift.
- `it` a composing Ctrl+Enter returns null.
- `it` Ctrl with a key other than Enter returns null.

`test/unit/action-rows.test.ts`, unit, node pragma. `describe("toActionRows")`:
- `it` a target with two actions yields two enabled rows in declared order, ids `actions:<id>`, the
  target's label as section and each action's perform passed through.
- `it` a target without actions yields no rows.

`test/unit/content-search-provider.test.ts`, edit, add one case:
- `it` each hit row carries one Copy ID action whose copy value is the hit id. Assert with
  `toMatchObject` on `actions`: the id is `copy-id` and `perform` is `{ kind: "copy", value: HIT_ID }`.

`test/unit/command-palette.test.tsx`, edit. Existing cases stay as they are. New cases go inside the
same `describe`; a local helper for "open the actions page on the hit" is allowed (Rule 3.12). New
cases:
- `it` Ctrl+Enter on a search row copies the hit id, closes the dialog and does not navigate.
  Setup: `content:read@posts`, one hit, `stubClipboard`, `typeInRoot("/canonical")`, await the row.
  Assert: `writeText` is called with `HIT_ID`, the dialog is gone, `navigateMock` is not called, and
  the success toast says `Copied <HIT_ID>`.
- `it` Ctrl+Enter on the calculator row neither copies nor closes the dialog. Regression guard: cmdk's
  Enter ignores modifiers, so a chord the engine does not consume would run the primary copy. Setup:
  `typeInRoot("2025-5")` and `stubClipboard`. Assert: `writeText` is not called and the dialog is
  still open.
- `it` Shift+Enter on a search row opens the actions page: the placeholder is `Choose an action…`
  and the one option reads `Copy ID` under the hit's title.
- `it` Shift+Enter on a row without actions keeps the root page. Setup: `typeInRoot("2025-5")`.
  Assert: the root placeholder is still shown.
- `it` Enter on the actions page copies the frozen target's id and closes the dialog. The actions
  page is opened in ARRANGE; the single ACT is Enter on the input.
- `it` Escape on the actions page returns to the root page with the typed query restored. Assert:
  the input value is `/canonical` and the hit row is listed again.
- `it` with a search row selected the footer shows the Copy ID and Actions hints.
- `it` with the calculator row selected the footer shows neither hint.

For each one, fire the chord on the input with `fireEvent.keyDown(input, { key: "Enter", code:
"Enter", ctrlKey: true })` or `shiftKey: true`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`:
  `npx vitest run src/features/command-palette src/pages/palette-providers.test.ts src/test/cross-slice/app.test.tsx`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx apps/dashboard/src/features/command-palette/_parts/palette-list.tsx apps/dashboard/src/features/command-palette/_parts/palette-footer.tsx`
- `pnpm --filter dashboard build` (or the dashboard's `build` script)
- `pnpm beech test --diff`. Known caveat from sprint 4: on a branch stacked on sprints 1–3, the
  `packages/core` gate reports files from sprint 3. This sprint touches no `packages/` file.
- `graphify update . --force`
- Manual gate (human, dev stack). Search a term and select a hit:
  - the footer shows `Copy ID ⌘/Ctrl ↵` and `Actions ⇧ ↵`;
  - Ctrl/⌘+Enter copies the id and closes;
  - Shift+Enter lists Copy ID under the hit title;
  - Escape returns to the same query and results;
  - Cmd/Ctrl+K still toggles and Alt+N still opens create.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PaletteRowAction`, `PaletteItem.actions`, `CommandPage` `"actions"`, the narrowed
      `PalettePerform` page member and the two `CommandPaletteState` members match Section 4 verbatim.
- [ ] `paletteKeyBinding` and `toActionRows` match their signatures and are pure.
- [ ] Every other provider, `src/pages/*`, the barrel and the existing test cases compile and pass
      unedited.
- [ ] Mod+Enter on an enabled row with actions runs its first action through the same path as Enter
      (close, toast, copy failure toast).
- [ ] Mod+Enter and Shift+Enter never run the primary action, on any row or page.
- [ ] Shift+Enter opens the actions page for the selected row. The page lists that row's actions
      under its label. The target is frozen at opening.
- [ ] Leaving the actions page (Escape, Backspace on empty, breadcrumb) restores the root query.
      Closing the palette clears the target.
- [ ] No binding acts on a disabled row; a row without actions is a no-op for both chords.
- [ ] Search rows expose Copy ID (value = entry id); computed rows expose no actions.
- [ ] The root footer shows both hints only when the selected row has actions. Sub-pages still show
      the back hint.
- [ ] Row and footer key caps use `Kbd`/`KbdGroup`; the modifier label comes from `MOD_KEY_LABEL`.
- [ ] Cmd/Ctrl+K, Alt+N and Backspace-on-empty behave as before.
- [ ] The three locale keys exist in `en.json` and `it.json`; no string literal is rendered in JSX.
- [ ] `features/command-palette` imports no feature slice besides `@/features/shared`.
- [ ] Design-token check clean on the three `.tsx` files; tsc, lint, the scoped vitest run and the
      dashboard build pass.
- [ ] `docs/features/command-palette.md` lists both new bindings.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Pin / unpin in the submenu, pin cap, server persistence → roadmap entries 8 `UiPreferencesApi` and
  9 `BeechPalPins`.
- Context actions declared by host pages (entry editor save/publish/duplicate/copy ID), the shared
  declaration hook and `ConfirmDialog` on destructive actions → roadmap entry 6
  `BeechPalContextActions`. This sprint's actions are non-destructive copies, so they have no
  confirmation step.
- Per-action `requires` / disabled actions: no action this sprint needs a permission. Add it with
  the first consumer that does (entry 6).
- Secondary actions on computed rows, navigation rows, seed rows or settings rows. Copy value on
  computed rows is already their primary action (Enter, sprint 2).
- Listing the primary action inside the submenu, per-action shortcuts beyond the first, nested
  submenus.
- A pointer (mouse) entry point to the actions page and clickable footer hints → decide in entry 9,
  where pinning needs it.
- Restoring the previously selected row when leaving the actions page. cmdk selects the first row,
  as on every query change.
- Exporting `PaletteRowAction` from the barrel; there is no host consumer yet.
- Quick notes, the `#` prefix → entry 5; system commands, the `>` prefix, recent items → entry 7.
- Any change in `apps/api`, `packages/*`, `src/pages/*` or `App.tsx`.
