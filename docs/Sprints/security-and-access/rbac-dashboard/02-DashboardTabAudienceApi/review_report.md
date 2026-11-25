# Verdict
PASS

# Findings
No blocking findings. Non-blocking notes (no rework required):

1. `apps/api/src/features/dashboard-layout/test/integration/dashboard-layout.integration.test.ts:346-347`: the duplicate-widget-id test asserts `body.detail` contains `w-dup`. `testing_conventions.md` §5.4 prefers error identity over message text. The plan (7c) explicitly asks for "the detail naming the id", and the `type` is asserted too, so this is plan-mandated and not a violation.
2. `GET /api/dashboard-layout/roles` "ordered by name" (SECTION 6) has no test asserting order. The code is correct: `d1-role.repository.ts:65` is `ORDER BY name` and the handler keeps repository order. Add an order assertion in a later sprint if it matters.
3. `dashboard-layout.handler.ts`: `putLayout` and `loadStoredLayout` each build `seedSlugs` from `seedRegistry.all()`. This is a harmless duplicate and an implementation choice, not a deviation.
4. Process: the branch was cut from `feature/dashboard-data-scope-closure` and the sprint is uncommitted. `git diff devs...HEAD` therefore shows only sprint 1's commit `30473871` (plus unrelated commits already on this lineage) and none of this sprint. I reviewed the working tree (`git diff HEAD` + untracked files). The human must commit the sprint before merging.

# Verification Evidence
Executor claims were not trusted; every command was re-run.

- `cd packages/core && pnpm run build` → `tsc`, exit 0.
- `cd apps/dashboard && npx tsc --noEmit` → "TypeScript: No errors found", exit 0.
- `cd apps/api && npx tsc --noEmit` → 51 `error TS`, equal to the sprint-1 baseline. `grep -E "dashboard-layout|permission.middleware"` on the output → 0 hits (no error in a touched file).
- `pnpm beech test` (full workspace) → exit 0. core 1329/1329 (69 files), api unit 2398/2398 (199 files), api workers/integration 706/706 (96 files), dashboard 1516/1516 (206 files, no flake this run), cli 168, client 121, mcp 27, forms-react 43, search-client 19, widget-sdk 8, api-client 26 (+1 pre-existing skip). The `✗` lines in cli output are expected assertions of the CLI's own error messages.
- `pnpm beech lint` → 19/19 tasks successful, exit 0 (turbo cache hit on unchanged inputs).
- `rg -n "KNOWN_DASHBOARD_ROLES|roleScope|isValidDashboardScope|resolveDashboardScopeChain|listScopes|builder\.scope\." apps packages -g '!**/dist/**' -g '!**/node_modules/**'` → hits only in `apps/api/assets/**`, `apps/api/graphify-out/**` and `packages/mcp/resources/**`. `git check-ignore` confirms all three are gitignored build or generated output, so there are no source hits.
- Invariant greps: `rg "jwtPayload|canEditDashboard|\.role\b"` in the slice → only `jwtPayload?.sub` (lines 26, 95); `.role` is never read. `rg "features/"` in the slice → 0 hits, so there is no cross-slice import. The handler has no SQL and uses only injected repositories.
- Manual read of the diff against the plan:
  - Building blocks match verbatim: `roles?`, `MAX_ROLES_PER_PAGE = 32`, schema line, `roleIds?`, the error string, the `DashboardLayoutViewer` / `FilteredDashboardLayout` / `filterDashboardLayoutForViewer` signatures, the four route-table rows and the 409 problem object.
  - `DEFAULT_DASHBOARD_SCOPE` moved to `dashboard-layout.repository.ts`, `listScopes` is removed from the interface and D1, and `index.ts` swaps the export.
  - SECTION 4 behaviour holds: filter steps 1-8 all go through `hasPermission`, the PUT order is 400/422 then 409, both GET branches carry `no-store`, `/roles` returns `{id,name,icon:null-coalesced}`, and the wildcard row is gone.
  - Out-of-scope items are untouched: `canEditDashboard` and the dashboard-page gate remain, there is no migration, no `docs/` edit, and the stats routes are unchanged.
- Test audit (§8): SPDX headers are present, and files are in the right tier (the integration file is under `features/dashboard-layout/test/integration/`; unit files sit next to the source). Four zones and a named ACT result are respected; the `removed per-scope URLs` test and the `Promise.all` matrix are RBAC-matrix style, allowed by Rule 1.6. Status is asserted first, bodies are typed with no `any`, and writes and rejections assert persisted state (row counts, byte-unchanged JSON). Fixtures use canonical seeds, `CANONICAL_USERS` and UUIDv4 role ids. The three required §6.2 comments are present (decay-filter coupling, 409 with ROADMAP entry 5, `route_not_registered`). No `it.only`/`skip`, `Date.now()` or timers. The deleted `handler.test.ts` contracts are all re-covered in 7c.
- Acceptance criteria SECTION 6: all items verified independently (see commands above); the `roles` order criterion is verified by code reading, not by a test (note 2).
- Runtime verification: the API behaviour was exercised through the integration suite (real D1 in the workers pool, full Hono + auth + oauth-scope + permission middleware chain, harness-issued users). The empty-layout render guard was exercised by the new renderer unit test. I did **not** start `pnpm beech dev` or click through the dashboard UI, so no browser-level observation of the builder or the blank-dashboard state was made. The plan marks that manual check optional.

# Sprint Documentation
- Shipped: the dashboard layout has one `default` document. Tabs carry optional `roles` (role ids), and `filterDashboardLayoutForViewer` in `@beechcms/core` projects the layout per caller. `GET /api/dashboard-layout` is filtered server-side (tabs outside the caller's role audience and widgets on seeds they cannot `content:read` never leave the server; `Cache-Control: no-store`; readers get no `roles` key).
- Write gate: PUT/DELETE and the new `GET /api/dashboard-layout/roles` (`{id,name,icon}`) are gated by `manage_roles@*` in the route table only, replacing the split `manage_users@*` + `users.role` handler check. Unknown role ids at save are 422 `invalid-layout` and are never stripped.
- Removed: per-role scope machinery (`dashboard-scopes.ts`, `listScopes`, `/scopes`, `/:scope` routes) deleted without compatibility; the former URLs answer 403 `route_not_registered`; legacy `role:*` rows are ignored, not migrated.
- Decision: an interim 409 `layout-locked` on PUT/DELETE when the stored layout holds widgets the caller cannot read, so a filtered save cannot silently delete them. It is replaced by server-side re-injection in ROADMAP entry 5.
- Dashboard follow-through only: the builder lost its scope selector and discard dialog, `useDashboardLayout` lost `scope`, the renderer returns `null` for `pages: []`, and the `dashboard.builder.scope.*` locale keys were removed (en/it parity kept).
- Known limitations: no UI for tab audiences or the roles picker (entry 3), no explicit empty state; a legacy-admin user without `manage_roles@*` still sees the Edit button and gets a 403 toast (accepted, until entry 3); the lock check is not a compare-and-swap (entries 5-6); only `config.seedSlug` is treated as a seed reference (`requires` arrives in entry 4).
- Deviations from the plan: none found. Process note: work was done on a branch cut from the sprint-1 branch and left uncommitted, so `git diff devs...HEAD` does not show this sprint.
