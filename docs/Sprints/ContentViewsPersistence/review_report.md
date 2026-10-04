# Verdict
PASS

# Findings

None blocking. Two non-blocking observations for the record, surfaced by an independent code-review
pass on the diff (not merely trusting `execution_log.md`):

1. **Position collision across a visibility round-trip (narrow edge case).**
   `apps/api/src/shared/db/repositories/content-view.repository.d1.ts:158` — `reorder()` only writes
   `position` for the ids it is given (the currently *visible* set). A row whose type is hidden by the
   seed's `dashboard.views` allow-list at reorder time keeps its old `position` untouched. Sequence that
   triggers it: a seed authorizes `table/gallery/kanban` and bootstraps three rows at positions 0/1/2 →
   the seed-author narrows the allow-list to `table/gallery` (kanban now hidden, still at position 2) →
   an admin creates a second `gallery` instance (`create()` computes `MAX(position)+1` over *all* rows,
   including hidden ones, so the new row lands at position 3) → the admin reorders the two now-visible
   non-table views, which can place one of them back at position 2 — now colliding with the hidden
   kanban row. Nothing breaks today: `listBySeed`'s `ORDER BY position ASC, created_at ASC, id ASC` still
   returns one row per id, and `projectContentViews` filters the hidden row out of every response, so no
   view is duplicated or dropped. The only observable effect is that *if* kanban is re-authorized later,
   its tab position relative to the reordered views is decided by the `created_at`/`id` tie-break instead
   of anything an admin chose. No acceptance criterion requires stable ordering across a hide/show
   round-trip, and the migration's own comment already documents that `position` is deliberately
   non-unique ("a reorder batch passes through transient duplicates"). Worth a follow-up (e.g. `reorder`
   could compact *all* of a seed's rows, not just the visible ones) before Sprint 3 builds the
   drag-and-drop switcher on top of this contract, but it is not a defect in anything this sprint's
   acceptance criteria promise.

2. **`nowSeconds()` reimplements an existing `IClock` method.**
   `apps/api/src/shared/db/repositories/content-view.repository.d1.ts:65-67` defines a private
   `nowSeconds()` as `Math.floor(this.clock.now() / 1000)`. `IClock` already exposes `nowSeconds(): number`
   (`packages/core/src/common/clock.ts:22`), and every other D1 repository in the codebase calls
   `this.clock.nowSeconds()` directly (`content.repository.d1.ts:1193`, `d1-analytics.repository.ts:27`,
   `d1-oauth-token.repository.ts:73`, `d1-session.repository.ts:43`, etc.). Functionally harmless today —
   both the production clock and `FixedClock` keep `now()`/`nowSeconds()` consistent — but it is
   unnecessary duplication against an established convention. A one-line fix (drop the private method,
   call `this.clock.nowSeconds()` at the four call sites) is appropriate whenever this file is next
   touched; not worth a rework cycle on its own.

# Verification Evidence

Independent re-run of SECTION 5 validation (plan at `stages/01_sprint_planning/output/ContentViewsPersistence.md`),
not trusting `execution_log.md`'s claims:

```
$ cd packages/core && pnpm run build
  tsc — exit 0, no output

$ pnpm test -- content-view
  src/dashboard-layout/content-view.test.ts: 18 passed
  (full suite also run clean: 54 files, 940 tests passed)

$ cd packages/testing && pnpm run type-check
  tsc -p tsconfig.json --noEmit — exit 0, no output

$ cd apps/api && npx tsc --noEmit
  8 pre-existing errors in 5 files (import-chunk.worker.test.ts, media-transform.test.ts,
  display-name.test.ts, cloudflare-images.transformer.test.ts, test/helpers/d1-test-database.ts).
  Independently confirmed via `git diff --stat HEAD` / `git status --porcelain` on those exact 5 files:
  zero changes, in either the commit history or the working tree, for any of them. Pre-existing and
  unrelated to this sprint, as claimed.

$ pnpm beech db:reset
  [bootstrap-d1] applying 0000_v040_base.sql / 0030_test_seeds.sql / 0031_import_jobs_seed.sql /
  0032_rbac_and_user_activation.sql / 0033_seed_views.sql → done (5 applied)
  ✓ Local database reset completed. (clean DB, not an incremental apply)

$ cd apps/api && pnpm run test:integration -- content-views
  src/features/content/test/integration/content-views.integration.test.ts: 17/17 passed — every
  required case from SECTION 4 Task 14 present and passing by name.

$ pnpm run test:integration (full tier)
  Test Files  22 passed (22) / Tests  152 passed (152)

$ cd ../.. && pnpm beech test --diff
  [apps/dashboard] unit: 8 files / 75 tests passed
  [apps/api] unit: 21 files / 128 tests passed; integration: 22 files / 152 tests passed
  PASS — all 7 changed file(s) meet coverage thresholds

$ pnpm lint
  ESLint: No issues found
```

All numbers match `execution_log.md` exactly; none were assumed.

**Invariant / acceptance-criteria audit (file inspection, not trust):**
- `0033_seed_views.sql`: no `CHECK` on `view_type`, no `UNIQUE` on `position` — confirmed by reading the file.
- `content-view.ts` / `content-view.repository.ts` imports: `zod` plus relative `../engine/*`, `./view-authorization.js`,
  `./seed-layout.js`, `./kanban/kanban.js` — all inside `packages/core/src`, none from `apps/`. Confirmed by `grep ^import`.
- Alias rejection: `viewColumnRefSchema` is `z.enum(VIEW_SYSTEM_COLUMNS) | z.string().regex(/^br_[A-Za-z0-9]+$/)` — an
  alias like `title` matches neither branch and fails; covered by the "rejects a column reference written as an alias"
  unit test (passing).
- `VIEW_FORMAT_TARGETS = ['element', 'field']` — `target: 'row'` is rejected by the enum; covered by a passing unit test.
- `VIEW_TYPE_IDS` vs `AUTHORIZABLE_VIEWS`: both `['table', 'gallery', 'kanban']`; unit test asserts equality (passing).
- Bootstrap/no-duplicate guard: `ensureDefaults`'s `INSERT … SELECT … WHERE NOT EXISTS` runs inside one `db.batch()`
  (one transaction); traced the SQL and bind-parameter order by hand (9 placeholders, 9 bound values, in order) —
  correct. Confirmed behaviourally by integration tests 1–2 (bootstraps once, second read creates no more rows).
- `remove()`'s last-Table guard is inside the `DELETE … WHERE … AND (view_type <> 'table' OR (SELECT COUNT…) > 1)`
  statement itself, not a separate check-then-delete — confirmed by reading the SQL; the only way `changes = 0`
  with the row still present is the last-Table case, which the follow-up `get()` correctly reports as `'last-table'`.
- Hidden types: `projectContentView` returns `null` when `isViewAuthorized` is false; `isViewAuthorized` fails closed
  for any `view_type` string outside `AUTHORIZABLE_VIEWS` (`view-authorization.ts:34-36`, unmodified, read directly).
  Never reached by `remove`/`update` either — both handlers independently re-check `isViewAuthorized` before calling
  the repository, so a hidden row 404s instead of being mutated or deleted.
- `PUT /views/order` permutation check (`reorderViewsHandler`): size match + `Set` dedupe + every id in the visible
  set — all three conditions required; confirmed by reading the handler and by the two passing order tests
  (accepts an exact permutation, rejects an incomplete one with positions unchanged).
- Permission table: `grep -n "capture1" permission.middleware.ts` — the five new rows sit immediately after the two
  `view-config` rows and before every generic `/api/content/([^/]+)/[^/]+$`-shaped row. `OAUTH_SCOPE_ROUTES` diff is
  empty (`git diff ... | grep OAUTH_SCOPE_ROUTES` → no output).
- Route order: `grep -n "content\.\(get\|delete\)"` on `features/content/index.ts` — `GET /:slug/views` (line 33)
  precedes `GET /:slug/:id` (line 48); `DELETE /:slug/views/:viewId` (line 37) precedes `DELETE /:slug/:id` (line 52).
  Hono matches in registration order, so neither generic route can swallow `views`.
- `grep -rn "crypto.randomUUID\|Date.now()"` over the four new production files: no matches. Ids/time come only
  from the injected `IIdGenerator`/`IClock`.
- No handler issues SQL: `grep ^import` on `handlers/views.ts` shows only `@beechcms/core`, `../../../public/errors/
  problem-details`, `../constants`, `../../../types` — no D1 import, no cross-slice `features/*` import.
- `apps/dashboard`: `git diff --stat` and `git status --porcelain` both empty for that path. The legacy
  `view-config.ts` handler, `seed-layout.ts`, `seed-layout.repository.d1.ts`, and `packages/cli` are each confirmed
  unchanged (`git diff --stat` / `git status --porcelain`, empty for all four).
- `canonical.seeds.ts`: `posts` seed carries `dashboard: { views: ['table', 'gallery'] }` exactly where the plan
  specified (directly after `allowDrafts: true`), confirmed by reading the file directly.
- `harness.ts`: `resetSeedViews(options.db)` is called directly after `resetContentTables` and before `seedUsers`,
  exactly as specified — confirmed by reading the file.

**Test-convention audit** (`_config/testing_conventions.md` §8 checklist) on both new test files:
- Correct tiers and placement: unit file sits next to its source in `packages/core/src/dashboard-layout/`;
  integration file sits in `<slice>/test/integration/`.
- SPDX headers byte-match sibling files (`seed-layout.test.ts` for the MIT core header; the BUSL template for the
  integration file) — confirmed by direct read.
- Four-zone anatomy, one act per `it()`, act result named, status asserted before body, typed bodies (`ViewBody`,
  no `any` — confirmed by grep), error assertions on `body.type` never `detail`, every write/rejection asserts
  zone-4 state via direct `harness.db.prepare(...)` reads — all confirmed by reading every test.
- Fixtures: the integration suite uses only the canonical `posts` seed and `harness.asUser(...)`; the one
  hand-rolled SQL insert (a stale `kanban` row) is a deliberately malformed/legacy arrangement, which Rule 3.5
  explicitly permits.
- `it.each` matrix in `viewTitleSchema` and the RBAC-style 403 case are each a single cause/arrangement, satisfying
  Rule 1.6.

**Runtime verification:** this sprint has no dashboard/UI surface to exercise (explicitly zero changes under
`apps/dashboard/`, confirmed above) and no new user-visible behaviour beyond the new API routes themselves. The
integration tier already exercises those routes through the real Hono app, the real permission/auth middleware
chain, and real D1 (not mocks) — `createBeechApp` end-to-end via `createTestHarness`, per
`testing_conventions.md` Rule 3.4/4.1. This constitutes the runtime verification the pipeline calls for, since
there is no UI consumer yet for a manual `pnpm beech dev` smoke test to add beyond what the integration suite
already proves.

**Independent code-review pass** (full diff, both tiers of new/modified files): no blocking correctness bugs.
SQL placeholder-to-bind-value ordering was hand-verified correct in `create`, `update`, `ensureDefaults`, and
`remove`; the two non-blocking items above are the full result.

# Sprint Documentation

Adds the backend half of Saved Views (Sprint 1 of 5): a new `seed_views` system table (migration `0033`), a
core-side `ContentView`/`ContentViewConfig` contract with pure, non-throwing cleanup against a live seed
(`validateViewConfigAgainstSeed`), a `D1ContentViewRepository`, and five RBAC-gated routes
(`GET/POST /:slug/views`, `PATCH/DELETE /:slug/views/:viewId`, `PUT /:slug/views/order`) under
`features/content`. Column references in a saved view's filters/sort/groupBy/appearance/conditional-formats are
restricted to Branch IDs (`br_XX`) or four engine system columns — never aliases — so a branch rename can never
break a saved view. A seed's first read (or first write) auto-bootstraps one untitled instance per
currently-authorized view type, guaranteeing at least one Table instance always exists; deleting a seed's last
Table instance is refused atomically (409) inside the `DELETE` statement itself. Instances whose type later
falls outside the seed's `dashboard.views` allow-list are hidden from every route (never deleted) via a
fail-closed `isViewAuthorized` check reused unchanged from the existing view-authorization module.

**Deviations from the plan:** none — every file matches SECTION 3/4 of the sprint plan byte-for-byte, and all 18
SECTION 6 acceptance criteria were independently re-verified rather than taken on the executor's word.

**Known limitation (non-blocking, see Findings):** `reorder()` does not compact positions for rows hidden by the
current allow-list, so a type that is hidden, then has sibling views created/reordered around it, then
re-authorized, may reappear at an order decided by a tie-break rather than any admin's explicit choice. Worth
revisiting once Sprint 3's drag-and-drop switcher makes tab order user-visible and persistent in a way users will
notice. Also non-blocking: `D1ContentViewRepository.nowSeconds()` reimplements `IClock.nowSeconds()` instead of
calling it directly, unlike every sibling D1 repository.

**Zero changes under `apps/dashboard/`, as required** — the dashboard keeps rendering the three fixed in-memory
views until Sprint 2 switches `ContentListPage` over to this new persisted contract. The legacy
`GET/PUT /:slug/view-config` routes and `seed_layouts` table are untouched and still serve the only existing
consumer (`useKanbanViewConfig`) until Sprint 2 removes both together.

## Handoff (Human Gate)
Verdict: **PASS**, on an intermediate sprint (1 of 5) of the Saved Views feature.
Per the pipeline contract: the human merges the branch, then runs `pnpm pipeline next` (archives this sprint,
keeps the feature brief + ROADMAP; stage 01 then plans Sprint 2). This review does not run that command.
