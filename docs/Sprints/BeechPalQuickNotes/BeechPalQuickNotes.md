# Sprint Plan — BeechPalQuickNotes (BeechPal, sprint 6 of 10)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 5).
Feature brief: `stages/00_ideation/output/feature_brief.md`, user story "salvare un appunto al volo
scrivendolo nella palette, rivederlo, copiarlo ed eliminarlo", business rules 7 (prefixes), 10 (local
rows with no latency) and 12 (Quick Notes stay in the browser), §4 "Quick Notes" (per-user, caps with
a clear message, "saved on this browser only" notice, storage unavailable, empty note refused,
immediate single delete).
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`,
`docs/Sprints/BeechPalContentSearch/`, `docs/Sprints/BeechPalRowActions/`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30160 nodes, 44142 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L107` | Engine entry. Mounts the notes hook and registers the notes provider. Public props unchanged. |
| `PaletteItem` | `features/command-palette/types.ts:L65` | Gains the optional `unavailableReason`. 31 dependants at depth 2, all in the slice or the composition root. The field is optional, so none of them changes. |
| `PalettePrefix` / `PALETTE_PREFIXES` | `types.ts:L46`, `lib/parse-palette-query.ts:L8` | Gain `"#"`. |
| `parsePaletteQuery()` | `lib/parse-palette-query.ts:L18` | Gains the hex-colour exception for `#`. |
| `collectPaletteItems()` | `lib/collect-palette-items.ts:L28` | Maps `unavailableReason` into `disabledReason`. |
| `useMe()` | `features/shared/hooks/use-me.ts:L21` | Source of the current user id (`data.id`, from `GET /api/settings/me`, `apps/api/src/features/settings/settings.handler.ts:L223`). Read only. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. Notes never leave the browser (brief rule 12).
- `apps/dashboard`:
  - `src/features/command-palette/` (owner slice): the `#` prefix, the row-level unavailable state,
    the notes storage module, the notes hook and the notes provider.
  - `src/features/shared` (`useMe`): read-only, through the barrel, as `usePermissions` and
    `useSchema` already are.
  - Shared, read-only imports: `@/components/icons` (`Stickynote`, `NoteAdd`, `Trash2`), `sonner`.
    None is a feature slice.
  - `src/locales/en.json`, `src/locales/it.json`: one `commandPalette.notes` block.
  - `src/pages/*` (composition root) and `App.tsx`: unchanged.
- `docs/features/command-palette.md`: one capability bullet.

**c) `graphify affected` impact analysis**

```
graphify affected "PalettePrefix" --depth 2
- slice: index.ts [re_exports], parse-palette-query.ts (ParsedPaletteQuery), command-palette.tsx,
  calculator-provider.test.ts, use-async-palette-items.test.tsx (HookProps),
  parse-palette-query.test.ts, command-palette.test.tsx
- outside: App.tsx, app-command-palette.tsx, palette-providers.ts(+test) (barrel imports only)

graphify affected "PALETTE_PREFIXES" --depth 2
- No affected nodes found (read only inside parsePaletteQuery)

graphify affected "parsePaletteQuery()" --depth 2
- command-palette.tsx, parse-palette-query.test.ts, index.ts            (slice-internal only)

graphify affected "collectPaletteItems()" --depth 2
- command-palette.tsx, collect-palette-items.test.ts, index.ts          (slice-internal only)

graphify affected "PaletteItem" --depth 2
- slice: index.ts, collect-palette-items.ts, rank-palette-items.ts, action-rows.ts, the 5 providers,
  use-async-palette-items.ts (QueryState), use-command-palette.ts, command-palette.tsx,
  palette-list.tsx, palette-footer.tsx, ResolvedPaletteItem [inherits], 9 unit test files
- outside: palette-providers.ts(+test), app-command-palette.tsx, App.tsx

graphify affected "convertValue()" --depth 2
- conversions-provider.ts, convert-value.test.ts, conversions-provider.test.ts, command-palette.tsx

graphify affected "useMe()" --depth 2
- 30+ readers across rbac, settings, navigation, content-*, dashboard, automations (all read-only;
  this sprint adds one more reader and does not change the hook)
```

Breaking-change verdict:
- `PaletteItem.unavailableReason` is optional. `ResolvedPaletteItem` inherits it unchanged; its own
  `disabledReason: string | null` does not clash because the new member has a different name. Every
  provider, test literal and the composition root compile unchanged.
- `PalettePrefix` gains `"#"`. `PALETTE_PREFIXES` is the only `Record<PalettePrefix, …>` in `src`, so
  tsc forces the one new key. No `switch` over `PalettePrefix` exists.
- Exporting `COLOR_PATTERN` from `lib/convert-value.ts` changes no behaviour of `convertValue`.
- `command-palette.test.tsx` mocks `@/features/shared` with only `usePermissions` and `useSchema`
  (L30–L38). The engine now calls `useMe`, so that mock gains `useMe`. The other suites that render the
  palette mock it away: `test/cross-slice/app.test.tsx:L44` replaces `AppCommandPalette` with `null`.
- Under `#`, `servesContext` (`lib/collect-palette-items.ts:L14`) keeps every provider without that
  prefix silent, the async search lane included: no request is sent for a notes query.

Findings that shape the plan:
1. **Hex colours vs `#`** (constraint carried from sprint 2). `COLOR_PATTERN`
   (`lib/convert-value.ts:L24`) is `^#([0-9a-f]{3}|[0-9a-f]{6})(?:\s+to\s+rgb)?$/i`. Making `#` a
   plain prefix would turn `#f00` into the note "f00" and drop the conversion row, because the
   conversions provider declares no prefix. `parsePaletteQuery` therefore treats a leading `#` as
   plain text whenever the whole trimmed input matches `COLOR_PATTERN`. A note that looks like a
   colour is written with a space, `# fff`: the pattern needs `#` directly before the digits, so that
   input routes to notes.
2. **Rows that cannot run.** Brief: at the cap "nessuna nota viene persa in silenzio", and with
   storage unavailable "la palette funziona comunque e comunica che le note non sono salvabili".
   Today a row is disabled only by a failing `requires` (`collect-palette-items.ts:L50–L53`). A
   disabled row stays visible with its reason as second line, and cmdk never runs it, so the typed
   text stays in the input. A provider-declared `unavailableReason` reuses exactly that path. Roadmap
   entry 9 needs the same state for pins whose item no longer exists.
3. **Per-user storage.** `localStorage` is shared by every account on the browser. The key carries
   the user id from `useMe().data.id`. Without an id (not loaded, or no session) the notes are
   unavailable: nothing is read and nothing is written.
4. **Concurrent tabs.** Two open tabs each hold notes in memory. Writing the in-memory list would
   erase a note saved by the other tab. Every write is therefore read-modify-write against storage,
   and the hook re-reads storage each time the palette opens.
5. **Delete.** The brief wants an immediate single delete. The design contract
   (`_config/design_system.html`, "Deleting") says a single immediate delete comes with an Undo toast.
   The note row's first action is Delete (Mod+Enter, sprint 4b). The toast offers Undo for
   5000 ms, with the shared `.undo-toast` countdown class (`src/index.css:L487–L511`). The pattern to
   copy is `features/content-management/hooks/use-delete-with-undo.ts:L61–L67`, by shape only.
   Importing it would be a cross-slice import.
6. **Existing storage idiom.** `features/seed-builder/lib/seed-draft.ts:L63–L93` wraps every storage
   call in `try/catch` and uses a versioned key prefix (`beech:seed-draft:v1:`). The notes module
   follows it. It differs in one way: a failed write is reported, not swallowed, because a note,
   unlike a draft, must not be lost silently.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** The sprint adds one prefix, one optional row field, one storage module, one
  hook, one provider. Cut as speculative:
  - no note editing (the brief lists write, review, copy, delete);
  - no cross-tab live sync through the `storage` event (re-read on open is enough);
  - no pinning or ordering of notes;
  - no multi-line notes (the palette input is one line);
  - no server sync, no migration (brief §5);
  - no generic "browser storage" abstraction outside the slice;
  - no note rows on the idle root (brief §4 "Ricerca": an empty query lists pins, recent items and
    navigation only).

  `unavailableReason` is needed now (cap, storage unavailable, empty note) and has a named future
  consumer (entry 9). **No VETO.**
- **Rule 2, Botanical invariant.** No server call and no database access. The user id is read from
  the existing `/settings/me` cache. **Respected.**
- **Rule 3, VSA.** All new code lives in `features/command-palette/`. New imports are
  `@/features/shared` (`useMe`, already the slice's shared entry point), `@/components/icons` and
  `sonner`. The Undo toast copies the shape of `useDeleteWithUndo` and does not import it. The
  5000 ms duration becomes a slice-local constant. **Respected.**
- **Rule 4, Cloudflare purity.** Nothing is added server side. A notes query sends no request.
  **Respected.**
- **Rule 5, minimal blueprint.** Tier footprint: core 0, api 0. Dashboard: 1 slice, 3 new source
  files, 5 edited; 3 new test files, 3 edited; 2 locale files; 1 doc. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–4b gave the palette providers, a prefix router, per-row scores, an async lane and row
actions. Quick Notes is the third "stay in BeechCMS" tool of the brief (after the calculator and the
conversions). It needs:
- the prefix router (sprint 2), for `#`;
- row actions (sprint 4b), for delete on Mod+Enter and on the actions page.

Both are shipped. Quick Notes is also the first provider whose rows can be unrunnable for a reason
other than permissions (cap reached, storage unavailable). The row-level `unavailableReason` lands
here, proved on a small local consumer, before entry 9 (pins) needs it for missing items.

VSA: storage, hook, provider and engine wiring all live in the palette slice. The only outside read
is `useMe` through `@/features/shared`. Botanical invariant: no data access of any kind; nothing
touches `apps/api` or `packages/`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Precondition.** Sprint 4b (`BeechPalRowActions`) is committed on `feature/beechpal-row-actions`
(`6db1d36d`). The executor branches `feature/beechpal-quick-notes` from it. Line numbers below are as
of that commit.

**Contract** (`types.ts`):
- `CommandPage` includes the engine-owned `"actions"` (L11–L17);
- `PalettePrefix = "=" | "/"` (L46);
- `PalettePerform`: `navigate`, `page`, `run`, `copy` (L49–L53);
- `PaletteRowAction` (L56–L63);
- `PaletteItem` (L65–L90), with optional `requires`, `score` and `actions`;
- `PaletteProvider.prefix` (L109);
- `ResolvedPaletteItem.disabledReason: string | null` (L125–L128).

**Prefix router** (`lib/parse-palette-query.ts`):
- `PALETTE_PREFIXES` (L8);
- `parsePaletteQuery` (L18–L26): on root, a leading character in the table becomes the prefix and is
  stripped from the trimmed text.

**Collection** (`lib/collect-palette-items.ts`):
- `servesContext` (L14–L20): with a prefix typed, only providers declaring it contribute;
- `disabledReason` is computed from `requires` only (L50–L53).

**Ranking** (`lib/rank-palette-items.ts`): `EXACT_MATCH_SCORE = 1` (L9). An item `score` replaces the
lexical one. A blank query keeps input order.

**Engine** (`command-palette.tsx`):
- `useCommandPalette()` gives `open` (L111–L113);
- `formatUpdatedAt(unixSeconds)` (L131–L138);
- providers memo (L142–L152): calculator, conversions, navigation, content, host, tools;
- `runPerform` closes the palette after `run` and `copy` (L192–L210);
- Mod+Enter runs `row.actions[0]` and Shift+Enter opens the actions page, on enabled rows only
  (L214–L230);
- the footer hints come from `_parts/palette-footer.tsx`.

**Disabled rows** (`_parts/palette-list.tsx:L29–L49`): `disabled` comes from `disabledReason`, and the
reason replaces the description on the second line.

**Storage idiom**: `features/seed-builder/lib/seed-draft.ts:L11` (key prefix), `L63–L93` (guarded
read and write). Tests start from an empty `localStorage`: `src/test/setup.ts:L45–L47` clears it
after each test.

**Tests** (`test/unit/command-palette.test.tsx`):
- hoisted mocks (L11–L17);
- `@/features/shared` mock (L30–L38);
- `typeInRoot` (L100);
- chords fired on the input with `fireEvent.keyDown(input, { key: "Enter", code: "Enter", ctrlKey: true })`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

All under `apps/dashboard/src/features/command-palette/` unless stated otherwise.

Create:
- `lib/quick-notes-storage.ts`: the per-user notes store over a `Storage`-like object (pure, no React).
- `use-quick-notes.ts`: the hook (availability, re-read on open, writes, toasts, Undo).
- `providers/quick-notes-provider.ts`: the `#` provider (compose row, note rows).
- `test/unit/quick-notes-storage.test.ts`
- `test/unit/use-quick-notes.test.tsx`
- `test/unit/quick-notes-provider.test.ts`

Edit:
- `types.ts`: `PalettePrefix` gains `"#"`; `PaletteItem.unavailableReason`.
- `lib/parse-palette-query.ts`: `"#"` in `PALETTE_PREFIXES`; hex-colour exception.
- `lib/convert-value.ts`: export `COLOR_PATTERN` (no other change).
- `lib/collect-palette-items.ts`: `unavailableReason` → `disabledReason`.
- `command-palette.tsx`: `useMe`, `useQuickNotes`, notes provider registration.
- `test/unit/parse-palette-query.test.ts`, `test/unit/collect-palette-items.test.ts`,
  `test/unit/command-palette.test.tsx`: cases added, existing cases untouched (the shared mock gains
  `useMe`).
- `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json`: `commandPalette.notes`.
- `docs/features/command-palette.md`: one Key Capabilities bullet.

Not touched: `apps/api`, `packages/*`, `src/pages/*`, `App.tsx`, `index.ts` (barrel), `_parts/*`,
`use-command-palette.ts`, every other provider.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Task 1 — Contract (`types.ts`)**

`PalettePrefix` becomes `"=" | "/" | "#"`.

On `PaletteItem`, after `requires`:

```ts
  /**
   * Why the row cannot run right now, for a reason other than permissions (e.g. a cap reached).
   * Disables the row like a failing `requires`; when both apply, the missing permission is shown.
   */
  readonly unavailableReason?: string
```

**Task 2 — Prefix router (`lib/parse-palette-query.ts`, `lib/convert-value.ts`)**

- `convert-value.ts:L24`: `const COLOR_PATTERN` becomes `export const COLOR_PATTERN`. Nothing else
  changes.
- `PALETTE_PREFIXES` gains `"#": true`.
- `parsePaletteQuery`: on root, when the first character is `#` and the whole trimmed input matches
  `COLOR_PATTERN`, return `{ text: trimmed }` with no prefix, so the conversions provider answers as
  today. Add a one-line comment naming the reason: a hex colour is a conversion; `# fff` is the way
  to write such a note. All other inputs keep today's behaviour.

**Task 3 — Collection (`lib/collect-palette-items.ts:L50–L53`)**

`disabledReason` becomes: the `describeMissing` text when the requirement fails; otherwise
`item.unavailableReason`; otherwise `null`. Update the function's doc comment with one sentence about
`unavailableReason`. The footer, Mod+Enter, Shift+Enter and cmdk already ignore disabled rows, so no
other engine change is needed.

**Task 4 — Notes store (`lib/quick-notes-storage.ts`, new)**

Building blocks, verbatim:

```ts
export interface QuickNote {
  /** UUIDv4 minted by the caller. */
  readonly id: string
  /** Trimmed, non-empty, at most QUICK_NOTE_MAX_LENGTH UTF-16 units. */
  readonly text: string
  /** Epoch milliseconds; notes are listed newest first. */
  readonly createdAt: number
}

/** The subset of Web Storage the store uses; `window.localStorage` in production. */
export type QuickNotesStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

/** Count and length caps, so the notes never exhaust the browser quota (brief §4). */
export const QUICK_NOTES_MAX_COUNT = 50
export const QUICK_NOTE_MAX_LENGTH = 280

const KEY_PREFIX = "beech:quick-notes:v1:"

export type QuickNoteTextRejection = "empty" | "too-long"
export type QuickNotesRejection = QuickNoteTextRejection | "full" | "write-failed"

export type QuickNotesWrite =
  | { readonly ok: true; readonly notes: readonly QuickNote[] }
  | { readonly ok: false; readonly reason: QuickNotesRejection }

/** One storage key per user: another account on the same browser never reads these notes. */
export function quickNotesKey(userId: string): string

/** `localStorage` when a probe write and remove succeed; null when storage is missing, blocked or full. */
export function probeQuickNotesStorage(): QuickNotesStorage | null

/** Why `text` (already trimmed) cannot be a note; null when it can. */
export function noteTextRejection(text: string): QuickNoteTextRejection | null

/** The user's notes, newest first. A missing key, corrupt JSON or a failing read yields []. Never throws. */
export function readNotes(storage: QuickNotesStorage, userId: string): QuickNote[]

/** Read-modify-write: adds `note` unless rejected. Never throws. */
export function insertNote(storage: QuickNotesStorage, userId: string, note: QuickNote): QuickNotesWrite

/** Read-modify-write: removes the note with `noteId`. Never throws. */
export function deleteNote(storage: QuickNotesStorage, userId: string, noteId: string): QuickNotesWrite
```

Rules:
- Stored value: a JSON array of `QuickNote` under `quickNotesKey(userId)`. `readNotes` drops entries
  that are not `{ id: string, text: string, createdAt: number }` (shape guard in the style of
  `seed-draft.ts:L50–L61`) and sorts by `createdAt` descending.
- `insertNote` reads the stored notes **at call time**, never a list held by the caller (finding 4).
  Checks run in this order: `noteTextRejection(note.text)`; then, if a note with the same `id` is
  already stored, it returns `ok` with the stored list unchanged (a double Undo click stays harmless);
  then a count at `QUICK_NOTES_MAX_COUNT` returns `full`. On success it writes the list including the
  note and returns it newest first.
- `deleteNote` reads at call time and writes the list without the note. An unknown id returns `ok`
  with the list unchanged, and nothing is written.
- A throwing `setItem` (quota, blocked) returns `write-failed`, and the stored value is left as it
  was. The rejection is returned, never swallowed (finding 6).
- `noteTextRejection`: `""` → `empty`; length > `QUICK_NOTE_MAX_LENGTH` → `too-long`.
- `probeQuickNotesStorage` writes and removes a probe key inside `try/catch`. Any exception, including
  reading `window.localStorage` itself, returns `null`.

**Task 5 — Hook (`use-quick-notes.ts`, new)**

```ts
export type QuickNotesState =
  | { readonly status: "ready"; readonly notes: readonly QuickNote[] }
  | { readonly status: "unavailable" }

export interface QuickNotesApi {
  readonly state: QuickNotesState
  /** Saves `text` (trimmed) as a new note, then toasts the outcome. */
  readonly save: (text: string) => void
  /** Deletes `note` at once, then toasts with an Undo action. */
  readonly remove: (note: QuickNote) => void
}

/** Browser-only notes of `userId`, re-read from storage each time `open` turns true. */
export function useQuickNotes(userId: string | undefined, open: boolean): QuickNotesApi
```

Behaviour:
- Storage comes from `probeQuickNotesStorage()`, probed once per mount. The state is `unavailable`
  when the probe returns `null` or `userId` is `undefined`. In that state `save` and `remove` do
  nothing.
- When ready, `notes` is re-read with `readNotes` when `open` becomes true and after each write by
  this hook. The value returned by a successful write becomes the new state directly.
- `save(text)`: mints `{ id: crypto.randomUUID(), text: text.trim(), createdAt: Date.now() }` (the
  dashboard already mints client ids this way, `features/dashboard/builder/use-dashboard-builder.ts:L128`)
  and calls `insertNote`. On `ok` it shows `toast.success(notes.saved)`, the brief's "saved on this
  browser only" notice. On a rejection it shows `toast.error` with the reason text (Task 7 table).
  Only a race can reach that branch, because the compose row is enabled only for a valid note.
- `remove(note)`: calls `deleteNote`. On `ok` it shows `toast.success(notes.deleted)` with:
  - `duration: NOTE_UNDO_TOAST_MS` (slice-local, value `5000`, the design contract's Undo window);
  - `className: "undo-toast"` and the `--undo-duration` style;
  - `action: { label: notes.undo, onClick }`, where `onClick` runs `insertNote` with the **same** note
    object (same id and `createdAt`, so it returns to its place) and toasts `notes.restored` or the
    reason text.

  Copy the toast shape from `use-delete-with-undo.ts:L61–L67`. On a rejection it shows
  `toast.error(notes.deleteFailed)`.
- No `storage` event listener (Section 7).

**Task 6 — Provider (`providers/quick-notes-provider.ts`, new)**

```ts
/** Quick notes: written and listed under the `#` prefix; existing notes also match un-prefixed queries. */
export function createQuickNotesProvider(deps: {
  t: TFunction
  notes: QuickNotesState
  save: (text: string) => void
  remove: (note: QuickNote) => void
  /** Relative "saved …" text for a note's createdAt (epoch ms). */
  formatSavedAt: (epochMs: number) => string
}): PaletteProvider
```

`id: "notes"`, `pages: ["root"]`, `prefix: "#"`. `getItems({ query, prefix })` follows these rules.

Without a prefix:
- An empty query or an `unavailable` state → `[]`. The idle root lists no notes.
- Otherwise one note row per stored note. The engine's lexical ranking keeps only the matching ones.

With `#`, the compose row comes first, then one note row per stored note (none when `unavailable`).

Compose row:
- `id: "notes:new"`, `section: notes.section`, `icon: NoteAdd`, `score: EXACT_MATCH_SCORE` (it tops
  the ranked list, like the computed rows);
- `label`: `notes.save` with `{ text: query }` when the query is non-empty, `notes.compose` otherwise;
- `unavailableReason`, the first that applies:
  1. `unavailable` state → `notes.unavailable`;
  2. `noteTextRejection(query)` is `empty` → `notes.typeToSave`;
  3. `too-long` → `notes.tooLong` with `{ length, max: QUICK_NOTE_MAX_LENGTH }`;
  4. `notes.length >= QUICK_NOTES_MAX_COUNT` → `notes.full` with `{ max: QUICK_NOTES_MAX_COUNT }`.
- `description: notes.browserOnly` (shown only while enabled, because the reason replaces it);
- `perform: { kind: "run", run: () => save(query) }`.

Note row:
- `id: "notes:<note.id>"`, `section: notes.section`, `label: note.text`, `icon: Stickynote`;
- `description: formatSavedAt(note.createdAt)`;
- `perform: { kind: "copy", value: note.text }`: Enter copies, closes and toasts `Copied …`, as on the
  calculator rows;
- `actions: [{ id: "delete", label: notes.delete, icon: Trash2, perform: { kind: "run", run: () =>
  remove(note) } }]`. Mod+Enter deletes it, and Shift+Enter lists Delete on the actions page
  (sprint 4b).

No `requires`: notes are personal and need no permission. The provider never touches storage; it
only reads `deps.notes`.

**Task 7 — Engine (`command-palette.tsx`)**

- Import `useMe` from `@/features/shared` and read `const { data: me } = useMe()`.
- `const quickNotes = useQuickNotes(me?.id, open)`.
- `formatSavedAt` is a `useCallback` over `formatUpdatedAt`, converting epoch ms to unix seconds.
- In the providers memo (L142–L152), insert
  `createQuickNotesProvider({ t, notes: quickNotes.state, save: quickNotes.save, remove: quickNotes.remove, formatSavedAt })`
  after `...hostProviders` and before the tools provider, and extend the dependency list. Update the
  comment on L140 to the new idle order.
- Nothing else changes: `runPerform` closes after `run`/`copy`, and the row-action handler already
  skips disabled rows.

Locale keys (`en.json` / `it.json`, new nested block `commandPalette.notes`):

| Key | en | it |
|-----|----|----|
| `section` | `Quick notes` | `Appunti rapidi` |
| `compose` | `New note` | `Nuova nota` |
| `save` | `Save note: {{text}}` | `Salva nota: {{text}}` |
| `browserOnly` | `Saved on this browser only` | `Salvata solo su questo browser` |
| `typeToSave` | `Type the note after #` | `Scrivi la nota dopo #` |
| `tooLong` | `Too long: {{length}}/{{max}} characters` | `Troppo lunga: {{length}}/{{max}} caratteri` |
| `full` | `{{max}} notes saved: delete one to save a new one` | `{{max}} note salvate: eliminane una per salvarne un'altra` |
| `unavailable` | `Notes can't be saved: browser storage is unavailable` | `Impossibile salvare le note: l'archiviazione del browser non è disponibile` |
| `saved` | `Note saved on this browser only` | `Nota salvata solo su questo browser` |
| `saveFailed` | `Note not saved: the browser refused to store it` | `Nota non salvata: il browser ha rifiutato il salvataggio` |
| `delete` | `Delete note` | `Elimina nota` |
| `deleted` | `Note deleted` | `Nota eliminata` |
| `undo` | `Undo` | `Annulla` |
| `restored` | `Note restored` | `Nota ripristinata` |
| `deleteFailed` | `Note not deleted: the browser refused the change` | `Nota non eliminata: il browser ha rifiutato la modifica` |

Reason text for a `QuickNotesRejection` (hook toasts): `empty` → `typeToSave`, `too-long` →
`tooLong`, `full` → `full`, `write-failed` → `saveFailed` (`deleteFailed` on the delete path). Keep the
mapping in one slice-local function inside `use-quick-notes.ts`. The provider builds its own reasons
from the state, as listed in Task 6.

**Task 8 — Docs (`docs/features/command-palette.md`, Key Capabilities)**

Add one bullet after "Settings":
- **Quick notes (`#`)**: type `#` and a note to save it on this browser only (separate per user,
  up to 50 notes of 280 characters). `#` alone lists your notes: Enter copies one, ⌘/Ctrl+Enter
  deletes it (with Undo). A colour such as `#f00` is still converted. Write `# f00` to save it as a
  note.

**Task 9 — Tests**

Fixtures:
- user ids: `CANONICAL_USERS.editor.id` and `CANONICAL_USERS.admin.id` (`@beechcms/testing`);
- note ids: UUIDv4 literals declared once per file (Rule 3.6);
- `createdAt`: literal epoch-ms constants, never `Date.now()` (Rule 7.7). The hook mints its own
  timestamp, so hook and engine tests assert ordering and text only, never `createdAt`.
- Storage-failure cases use `vi.spyOn(Storage.prototype, "setItem")` throwing a
  `DOMException("…", "QuotaExceededError")`. Add `vi.restoreAllMocks()` to the `afterEach` of each
  file that spies.
- `localStorage` is real (jsdom) and cleared by `src/test/setup.ts` after each test.

`test/unit/quick-notes-storage.test.ts`, unit (jsdom, real `localStorage`).
`describe("quick notes storage")` with one nested `describe` per exported function:
- `readNotes`: a missing key yields an empty list.
- `readNotes`: corrupt JSON yields an empty list without throwing.
- `readNotes`: entries with a wrong shape are dropped and the rest is returned newest first.
- `insertNote`: stores the note under the user's key, newest first, and leaves another user's key
  untouched.
- `insertNote`: empty or over-length text is rejected with `empty`/`too-long` and nothing is stored
  (array-driven, Rule 1.6).
- `insertNote`: at `QUICK_NOTES_MAX_COUNT` it returns `full` and the stored list is unchanged.
- `insertNote`: an id already stored returns ok and the stored list is unchanged.
- `insertNote`: a throwing `setItem` returns `write-failed` and the stored list is unchanged.
- `insertNote`: works from storage, not from a stale list. Regression guard: a note written by
  another tab between two inserts survives.
- `deleteNote`: removes only the matching note.
- `deleteNote`: an unknown id returns ok and the stored list is unchanged.

`test/unit/quick-notes-provider.test.ts`, unit, `// @vitest-environment node` on line 1. `t` is the
identity-with-params stub already used by `conversions-provider.test.ts`. `save` and `remove` are
`vi.fn()`. `describe("createQuickNotesProvider")`:
- `it` without a prefix an empty query yields no rows.
- `it` without a prefix a non-empty query yields one copy row per stored note, id `notes:<id>`.
- `it` with `#` and text, the first row is the enabled compose row with score 1. Running its perform
  calls `save` with the text.
- `it` the compose row carries the reason for an unavailable store, empty text, over-length text and
  a full list (array-driven: state + query → reason key).
- `it` a note row copies its text and declares one delete action whose run calls `remove` with that
  note.
- `it` with `#` and an unavailable store, only the compose row is returned.

`test/unit/use-quick-notes.test.tsx`, unit (jsdom, `renderHook` from `@testing-library/react`).
`sonner` mocked as in `command-palette.test.tsx:L19`. `describe("useQuickNotes")`:
- `it` without a user id the state is unavailable.
- `it` when storage refuses writes the state is unavailable.
- `it` save stores the trimmed text as the newest note and toasts the browser-only message. Assert
  storage through `readNotes`, then `state.notes`.
- `it` save on a full list stores nothing and toasts an error.
- `it` remove deletes only that note and toasts with an Undo action.
- `it` running the Undo action restores the deleted note at its place. ARRANGE: remove; ACT: the
  captured `action.onClick`.
- `it` notes written to storage while the palette was closed are listed after `open` turns true
  (rerender with `open: true`).

`test/unit/parse-palette-query.test.ts`, edit. Add:
- `it` a leading # on the root page is returned as the prefix and stripped from the trimmed text.
- `it` a complete 3- or 6-digit hex colour, with or without ` to rgb`, yields no prefix and the whole
  text (array-driven). Regression guard: sprint 2's hex conversion must keep answering `#f00`.
- `it` `# fff` with a space is the notes prefix with text `fff`.

`test/unit/collect-palette-items.test.ts`, edit. Add:
- `it` an item's unavailableReason becomes its disabledReason when its requirement holds.
- `it` a failing requirement's text wins over unavailableReason.

`test/unit/command-palette.test.tsx`, edit:
- The `@/features/shared` mock gains `useMe: () => ({ data: { id: CANONICAL_USERS.editor.id } })`.
- Existing cases stay as they are. New cases go in the same `describe`.

New cases:
- `it` `# buy milk` + Enter saves the note for the current user, closes the dialog and toasts the
  browser-only message. Assert through `readNotes(localStorage, editorId)`.
- `it` `#f00` lists the colour conversion row and no Quick notes row (regression guard, finding 1).
- `it` notes stored for another user are not listed. ARRANGE: `insertNote` under the admin id. ACT:
  `typeInRoot("#")`. ASSERT: no note row, only the compose row.
- `it` Ctrl+Enter on a note row deletes that note from storage and keeps the others.
- `it` with a full list the compose row is disabled with the cap message and Enter saves nothing.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json`
- In `apps/dashboard`:
  `npx vitest run src/features/command-palette src/pages/palette-providers.test.ts src/test/cross-slice/app.test.tsx`
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx`
- `pnpm --filter @beechcms/dashboard build`
- `pnpm beech test --diff`. This sprint touches no `packages/` file.
- `graphify update . --force`
- Manual gate (human, dev stack):
  - `# buy milk` + Enter shows "Note saved on this browser only";
  - `#` lists the note, and Enter copies it;
  - ⌘/Ctrl+Enter deletes it, and Undo brings it back;
  - `#f00` still converts, and `# f00` saves a note;
  - a second account on the same browser sees no notes;
  - in a private window with storage blocked, `#` shows the unavailable message.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PalettePrefix` includes `"#"`, and `PaletteItem.unavailableReason` matches Section 4 verbatim.
- [ ] `QuickNote`, `QuickNotesStorage`, the two caps, the rejection types, `QuickNotesWrite` and the
      store functions match their signatures. No store function throws.
- [ ] `QuickNotesState`, `QuickNotesApi`, `useQuickNotes` and `createQuickNotesProvider` match their
      signatures.
- [ ] A complete 3- or 6-digit hex literal (optionally ` to rgb`) is never routed to notes; `# fff`
      is.
- [ ] Notes live under `beech:quick-notes:v1:<userId>`. Another user on the same browser never sees
      them. Without a user id or with storage blocked, the notes are unavailable and the palette still
      works.
- [ ] Every write is read-modify-write against storage. A failed write is reported with an error
      toast and leaves storage unchanged.
- [ ] An empty, over-length or over-cap note is refused through a disabled compose row that names
      the reason. The typed text stays in the input.
- [ ] Saving toasts "Note saved on this browser only". Deleting is immediate with a 5000 ms Undo
      toast, and Undo restores the same note.
- [ ] Note rows: Enter copies, Mod+Enter deletes, Shift+Enter lists Delete. The idle root shows no
      note.
- [ ] A notes query sends no search request.
- [ ] `collectPaletteItems` disables rows with an `unavailableReason`; a missing permission wins.
- [ ] All palette strings come from `commandPalette.notes` in `en.json` and `it.json`.
- [ ] `features/command-palette` imports no feature slice besides `@/features/shared`.
- [ ] Every existing provider, `src/pages/*`, the barrel and the existing test cases compile and pass
      unedited (except the `useMe` line in the shared mock).
- [ ] tsc, lint, design-token check, the scoped vitest run and the dashboard build pass.
- [ ] `docs/features/command-palette.md` describes Quick notes.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Server-side storage or sync of notes, and any migration (brief §5).
- Editing a note, multi-line notes, pinning or reordering notes, note search on the idle root.
- Live sync between tabs through the `storage` event. Notes are re-read on open and every write is
  read-modify-write, so no note is lost; a tab simply shows another tab's note at its next open.
- Purging the notes of users who never sign in again on this browser.
- A shared browser-storage helper outside the slice.
- Keeping the palette open after a save or delete (the engine closes after `run`, as for every row).
- Pins and the "unavailable pin" display → roadmap entries 8 `UiPreferencesApi` and 9 `BeechPalPins`
  (they reuse `unavailableReason`).
- System commands, the `>` prefix, recent items, the "Keyboard shortcuts" row → roadmap entry 7
  `BeechPalSystemCommands`.
- Context actions declared by host pages → roadmap entry 6 `BeechPalContextActions`.
- Any change in `apps/api`, `packages/*`, `src/pages/*`, `App.tsx` or `_parts/*`.
