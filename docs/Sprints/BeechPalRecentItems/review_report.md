# Verdict
PASS

Independent review of `BeechPalRecentItems` (roadmap 7b). The sprint is uncommitted on `feature/beechpal-recent-items`,
branched from `2d045527`, so I reviewed the working tree against HEAD: `git diff devs...HEAD` is only the stacked
earlier sprints. Every command in SECTION 5 passes when I re-run it, and the code matches the plan's building blocks,
decisions and prose rules. Two gaps are for the human gate, listed at the end of Verification Evidence: no runtime
check in a live dashboard, and `pnpm beech test --diff` still exits 1 for the inherited `packages/core` reason.

# Findings

None blocking. Non-blocking, at the human's discretion:

1. `command-palette.test.tsx`, "Enter on a recent row navigates to its destination and keeps a single recent entry for
   it": it does not prove the performed row is the recent copy. If `recentIdToRecord` stopped unwrapping `recent:<id>`,
   nothing would be recorded and the stored list would still read `["nav:/"]`, so the test would stay green. The unwrap is
   covered only at unit level (`recentIdToRecord` suite). Asserting the selected row's `data-value` is `recent:nav:/`
   before Enter would close it.
2. `command-palette.test.tsx`, "lists that row first under Recent": `rows[0]` is checked for the text "Dashboard", not for
   membership in the Recent group. `recentRows()[0]` carrying "Navigate" as its second line covers it indirectly.
3. `stable-items.test.ts` and `use-recent-items.test.tsx` each carry one `toBeGreaterThan(0)` (a guard against a vacuous
   comparison), next to exact assertions. Acceptable under Rule 5, noted only.

# Verification Evidence

Commands re-run by me (not taken from `execution_log.md`):

| Command | Observed |
|---|---|
| `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` | exit 0, no output |
| `npx vitest run src/features/command-palette src/pages src/test/cross-slice` (in `apps/dashboard`) | 44 files, 390 tests, 390 passed, exit 0. The log shows `ECONNREFUSED 127.0.0.1:3000` noise from suites that touch a network client; no test failed. |
| `pnpm beech lint` | `19 successful, 19 total`, exit 0. Turbo replayed it from cache (`FULL TURBO`), a cache keyed on the current inputs. |
| `node scripts/check-design-tokens.mjs --format agent .../command-palette.tsx` | no output, exit 0 |
| `pnpm --filter @beechcms/dashboard build` | exit 0 |
| `pnpm beech test --diff` | api integration 99 files / 748 tests passed; api changed-line coverage passes (7 files); `apps/dashboard` coverage passes. Exit 1 solely from `[packages/core] [unit] no tests were run for the changed files`. This sprint touches no `packages/` file (`git diff HEAD -- packages apps/api` is empty), so the failure comes from the stacked earlier sprints against `devs`, as the plan states. |
| `graphify update . --force`, then `graphify affected "collectStableItems()" --depth 2` | lists only `command-palette.tsx`, `recent-items-provider.ts`, `recent-items-provider.test.ts`, `stable-items.test.ts`, `index.ts` (re-export edge): palette slice only |
| `grep -rn "@/features/" features/command-palette` (excluding `features/shared` and `/test/`) | 0 matches |

Code review (read in full): `lib/palette-storage.ts`, `lib/stable-items.ts`, `lib/recent-items-storage.ts`,
`use-recent-items.ts`, `providers/recent-items-provider.ts`, and the diffs of `types.ts`, `command-palette.tsx`,
`quick-notes-storage.ts`, `use-quick-notes.ts`, the three built-in providers, `pages/palette-providers.ts`, both locale
files and the docs.
- Signatures, constants (`RECENT_ITEMS_MAX = 5`, key `beech:palette-recent:v1:<userId>`, probe key `beech:palette:probe`)
  and the engine order (calculator, conversions, context, recent, then nav, content, host, notes, tools, shortcuts) match
  SECTION 4 exactly. `getStableItems` is optional.
- `probeQuickNotesStorage`, `QuickNotesStorage` and the quick-notes `PROBE_KEY` are gone. `git status` shows
  `quick-notes-storage.test.ts`, `use-quick-notes.test.tsx` and `quick-notes-provider.test.ts` unmodified, and they pass.
- Catalogues are built by the same local row builders as `getItems` (`rowsFor`, `gotoRow`/`createRow`/`newContentRow`,
  shared `rows`); none calls `getItems` with a made-up page. Content lists open rows for all readable seeds, then create
  rows, then `content:new`, and never `content:all`. Schema and system return `[]` without the global authority.
  Shortcuts, calculator, conversions, notes, context actions and search declare none.
- Recording happens only in `perform` (before `runPerform`); `handleKeyDown`'s secondary action and
  `confirmPendingAction` still call `runPerform` directly. `recentIdToRecord` rejects `kind: "page"` rows and ids outside
  the lookup, and unwraps `recent:`.
- The recent provider is pure, returns `[]` off the idle root, with a prefix, while typing, or when storage is
  unavailable, drops `score`, and keeps `requires`/`unavailableReason`/`perform`, so `collectPaletteItems` disables it
  exactly like its source.
- Invariants: no D1 or `@beechcms/core` access, no hardcoded field names, no cross-slice import, nothing from SECTION 7
  changed (`collect-palette-items.ts`, `rank-palette-items.ts`, `_parts/*`, `index.ts`, `app-command-palette.tsx`,
  `App.tsx` untouched). `ROADMAP.md` is edited, which the plan sanctions (finding 5, wording amendment).

Test audit (§8): the five new files and the five edited ones were read in full. SPDX header present, with
`// @vitest-environment node` on line 1 for the node suites, as the existing node suites do. Placement is inside the slice
and `pages/`. `describe` and `it` names match the plan's list. Four-zone anatomy holds. User ids come from
`CANONICAL_USERS` and seeds from `CANONICAL_SEEDS`/`paddedSeeds`; the hand-rolled `row()` is the plan's Rule 3.5 carve-out.
Refused writes use the manual-restore spy with the happy-dom reason commented. No `any`, `.only`/`.skip`, sleeps or
conditional assertions (grep of the five new files: no match). The edited test files have additions only (0 removed
lines), so "existing cases unedited" holds. No MUST violation.

Acceptance criteria (SECTION 6), all 13 checked against the code and the runs above: contract, shared probe, store/hook/
provider signatures, storage key and never-throw reads and writes, the seven catalogue providers and the five without,
idle-root-only placement after context actions, `recent:` ids with source-id recording, disabled/omitted resolution,
record-on-`perform` only, unavailable storage, no new request/endpoint/permission/component/token, both locale strings
(`recentSection` Recent/Recenti, `createIn` Create in {{label}}/Crea in {{label}}), green validation, docs bullet at
`docs/features/command-palette.md:19`.

Gaps:
- **Runtime verification not done.** The dev stack is not running: `curl` to `localhost:3000` and `localhost:5173` refuses
  the connection. The only evidence for the idle-root behaviour is `command-palette.test.tsx`, which renders the real
  engine with the real store in happy-dom (Recent absent at first use, recorded row reappears first, typing hides it,
  revoked `content:create` shows disabled, search hit records nothing). Executor also did not run the plan's manual gate.
- `pnpm beech test --diff` exits 1, for the inherited `packages/core` reason above.

Before merge the human still runs the SECTION 5 manual gate on the dev stack: first-use empty state; Analytics, a seed and
a settings tab, then reopen; typing hides Recent; a second user on the same browser sees none; revoke `content:create`
and reload; delete a listed seed; blocked storage in a private window.

# Sprint Documentation

- Shipped: a *Recent* section on the idle palette root, listing up to five stable rows the user last performed (screens,
  seeds, settings, commands), newest first, after the page actions and above Navigate. Browser-only, one key per user:
  `beech:palette-recent:v1:<userId>`. Typing, a prefix or a sub-page hides it.
- Key decision: a query-independent catalogue. `PaletteProvider.getStableItems` (optional) plus `collectStableItems`
  let a stored id resolve whatever the page or query; roadmap 9 (pins) reuses both unchanged. Seven providers declare
  one; shortcuts, calculator, conversions, notes, context actions and search do not, by design.
- Recent rows are copies with ids `recent:<sourceId>` (cmdk uses `item.id` as the row value, so a duplicate id would select
  both), carrying the source's `requires`, so a row is disabled exactly when its source is and omitted when the source
  is gone.
- Only `perform` records; page rows, row actions, confirmed page actions, search hits, notes, computed and shortcut rows
  never do.
- The quick-notes storage probe moved to `lib/palette-storage.ts` (`probePaletteStorage`, probe key
  `beech:palette:probe`); the quick-notes suites pass unedited.
- Deviations from the plan: none. The roadmap's "Recent first" wording was amended to "after context actions".
- Known limitations: no clear/remove-one command, no cross-device sync, no frequency weighting (all out of scope). Ids
  of seeds that no longer exist stay in storage until they age out under the cap of five. Two storage probes run at
  mount (notes and recents); harmless.
