# Verdict
PASS

Conditional on one human step: the runtime check (SECTION 5 "Manual check") could not be performed by this review. See Verification Evidence, "Runtime verification". Run it before merging.

# Findings
No blocking findings. Non-blocking observations:

1. `apps/dashboard/src/features/dashboard/builder/page-audience-picker.tsx:72-74`. `renderChips` branches on `isError` before it looks at `data`. TanStack keeps `data` and sets `status: 'error'` when a background refetch fails. `useLayoutRoles` has `staleTime: 0`, so every window focus refetches. A failed refetch (network blip) therefore replaces the chips with "Could not load roles." and disables the trigger, even though a valid list is in hand. Nothing is lost: the draft is untouched, and `handleSave` still uses the cached list. Optional hardening: branch on `roles === undefined && isError`.
2. Process: the sprint is entirely uncommitted. `git diff devs...HEAD` is therefore empty of this sprint's work, and `HEAD` (`b64a39d9`) is sprint 2's tip. I reviewed `git diff HEAD` plus the 4 untracked source/test files instead. Before merging, `git add` these untracked files:
   - `builder/page-audience-picker.tsx`
   - `builder/use-layout-roles.ts`
   - `test/unit/dashboard-page.test.tsx`
   - `test/unit/page-audience-picker.test.tsx`

   The branch is based on `feature/dashboard-tab-audience-api` because `devs` lacks sprints 1–2 (execution log), so merge order matters.

# Verification Evidence

Scope: reviewed the working tree against `HEAD` (see finding 2). Nothing from the execution log was taken on trust.

**SECTION 5 commands, re-run by me**

| Command | Observed |
|---|---|
| `cd packages/core && pnpm run build` | `tsc`, exit 0 |
| `cd apps/dashboard && npx tsc --noEmit` | "TypeScript: No errors found" |
| `cd apps/api && npx tsc --noEmit \| grep -c "error TS"` | 51, equal to the baseline of 51 |
| `rg canEditDashboard\|ROLES_ALLOWED_TO_EDIT_DASHBOARD …` (plan's exclusions) | 0 matches |
| `rg "\.role\b" apps/dashboard/src/features/dashboard` | 0 matches |
| `rg "features/rbac" apps/dashboard/src/features/dashboard` | 0 matches |
| `pnpm beech test --diff` | exit 0: integration 96 files / 706 tests passed, "every selected test run passed", changed-line coverage met. The dashboard-layout handler is "NOT MEASURED" (workerd tier). That file is not changed by this sprint. |
| `vitest run src/features/dashboard` (dashboard) | 30 files, 196 tests, 0 failed |
| `vitest run src/dashboard-layout` (core) | 8 files, 179 tests, 0 failed |
| `pnpm beech lint` | exit 0, 19/19 tasks. **All 19 were Turbo cache hits** (replayed logs), so this is not a fresh lint execution. The inputs hash identically to the executor's run. |

Not re-run by me: the full `pnpm beech test`. The sprint touches no API code, and the executor's log reports a flow-tier timeout under load that passed on re-run. I did not reproduce that. `graphify update . --force` was not re-run.

**Mutation checks (tests are falsifiable).** I mutated the source, ran the matching test file and restored the file each time. `git diff --stat` after restoring matched the pre-mutation state.

| Mutation | Result |
|---|---|
| Removed `staleTime: 0` from `use-dashboard-layout.ts` | "re-requests the layout on remount…" failed (1 failed, 3 passed) |
| Removed `roleIds` from the `validateDashboardLayout` context in `dashboard-builder-dialog.tsx` | "refuses to save when a page targets an id absent from GET /roles" failed |
| Replaced `canGlobally("manage_roles")` with `true` | both negative `dashboard-page` tests failed (JWT-admin case and seed-scoped case) |

**Runtime verification: NOT PERFORMED**
- I started `pnpm beech dev`. The Docker stack was already up, the API came up on `127.0.0.1:8789` and the dashboard answered on `:5173` (302).
- The Claude-in-Chrome extension was not connected ("Browser extension is not connected"), and no dev login credentials were available to me. I stopped the dev stack afterwards.
- No UI flow was exercised. Still unverified at runtime:
  - SuperAdmin sets a tab's audience, the chip shows its icon and name, and Save succeeds.
  - Deleting that role shows the "Deleted role" chip, and Save is refused until the chip is removed.
  - A `content:read@posts`-only account sees no "Customize" button and no targeted tab, `?page=<hidden slug>` falls back to the first visible tab, and the empty state appears when every tab is targeted elsewhere.
  - Assigning the role in another browser and refocusing makes the tab appear without a reload.
- Component-level coverage of the same rules exists, and the mutation checks above show it bites. It does not replace the check, because the picker's popover interaction and the focus refetch were exercised only under happy-dom.

**Invariant audit**
- No API, handler, repository or migration file is touched (`git diff HEAD --stat` outside `stages/` and `docs/` lists only dashboard and core files, as in SECTION 3).
- No D1 access, no hardcoded field names.
- VSA: `features/dashboard/` imports only `@/features/shared/*`, `@/lib/*`, `@/components/*` and `@beechcms/core`. No `features/rbac` import.
- SECTION 7: nothing out of scope was built. `page-tabs-manager.tsx` is untouched. The `?page=` URL is not rewritten. The 409 `layout-locked` path is unchanged. No new shared query key. `docs/` is untouched (the untracked `docs/Sprints/*` directories are earlier archived sprints, not this sprint).

**Plan conformance**
- Building blocks match verbatim:
  - `getRoles`
  - `LayoutRole` (inferred via `InferResponseType`)
  - `LAYOUT_ROLES_QUERY_KEY`
  - `useLayoutRoles` (`staleTime: 0`)
  - the `setPageRoles` signature and docblock
  - `PageAudiencePickerProps`
  - the locale strings
- Locale parity: a flattened key diff of `en.json` and `it.json` under `dashboard` is empty in both directions. `audience` sits after `page`, and `empty` is a sibling of `builder`.
- `setPageRoles`:
  - dedupes in first-seen order;
  - deletes the `roles` key on an empty list;
  - is a no-op for an unknown page;
  - never validates ids against the role list.
- Picker states (empty, known, orphan, loading, error) behave as in T7. The picker is mounted in `builder-pane.tsx` after the page `SortableContext`, and only when `!showPreview && activePage`.
- T1: `dashboard-permissions.ts` is deleted, its barrel line is removed, and the core describe is dropped.
- T2: the edit gate is `usePermissions().canGlobally("manage_roles")`. Both the button and the dialog mount sit behind `canEdit`.
- T3: `staleTime: 0` is set, and `stored ?? generatedDefault` is unchanged. The generator always emits a page, so the empty state cannot flash while loading.
- T4: the empty state renders only when there are no pages, and the docblock is updated.
- T8: the pre-save check adds `roleIds` only when the list has data.

**Test audit (§8, every test file in the diff)**
- Tier and placement: all are unit tier, inside `features/dashboard/test/unit/` or core next to the source.
- SPDX header present in all. Names follow §1. `it()` names state behaviour and outcome.
- Fixtures:
  - UUIDv4 literals declared once per file as named constants;
  - the 32-role fixture is deterministic (a counter, no `randomUUID`/`Math.random`);
  - `CANONICAL_SEEDS` from `@beechcms/testing` is used;
  - `me` payloads use the real JSON shape, so the real hydration and `hasPermission` run.
- Mocks: `vi.mock` factories sit at the top, above the consuming imports, with `vi.clearAllMocks()` in `beforeEach`. Only `@/lib/rpc` (the I/O boundary), navigation chrome and `useAuth` are mocked.
- Comments (§6.2) are present for the magic value (`appWideStaleTime`), the regression guards (JWT admin, pending list) and the deterministic ids.
- No `any`, no `.only`/`.skip`, no fake timers, no sleeps, no conditional assertions.
- No MUST violation.

# Sprint Documentation
Sprint 3 (DashboardTabAudienceUi) moves the dashboard UI onto the role-aware layout contract shipped by sprint 2. The "Customize" button and the builder mount are now gated on `usePermissions().canGlobally("manage_roles")` (core `hasPermission`), not on the legacy JWT `role`. `canEditDashboard`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD` and `dashboard-permissions.ts` are deleted from core.
The layout query uses `staleTime: 0`, so the per-caller projection is re-fetched on mount and window focus. This is why role-assignment changes show up without a reload, and `/api/settings/me` did not need to carry role ids. A stored layout with `pages: []` is served as-is, and the renderer shows an explicit empty state (`dashboard.empty.*`) for it.
In the builder, a new `PageAudiencePicker` (below the page tabs, edit mode only) edits a tab's `roles` through a new `setPageRoles` op. An empty selection removes the `roles` key. Role names and icons come from `GET /api/dashboard-layout/roles` (`useLayoutRoles`, a builder-local query). An id missing from a loaded list renders as a removable "Deleted role" chip, and no id is marked orphan while the list is loading or has failed.
Save runs core `validateDashboardLayout` with `roleIds` when the list is available, so an orphan is refused client-side with core's message and no PUT. Otherwise the server's 422 is the backstop.
No deviations from the plan. Known limitations:
- The 409 `layout-locked` interim stays until ROADMAP entries 5–6.
- The builder still has no audience indicator on the tab pills (out of scope).
- A failed background refetch of the roles list hides the chips until the next successful fetch (finding 1).
- The cache is not cleared on logout or user switch (app-wide gap, out of scope).
- The manual runtime check in SECTION 5 was not executed by the executor or by this review.
