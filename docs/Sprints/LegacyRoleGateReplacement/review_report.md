# Verdict
PASS

# Findings
No blocking findings. The two blocking findings of the previous REWORK_CODE report are fixed. Non-blocking notes and one open item for the human:

1. **Open item, not a defect: UI runtime verification was not performed.** SECTION 5 step 12 is still unverified at UI level, by the executor and by me. The Chrome extension was not connected and no local login credentials were available. The three flows to check by hand before merging:
   - the layout builder works for the setup account;
   - the layout builder is absent for an account whose only grant is `content:*` at `*`;
   - the last-admin error appears, then deactivation succeeds once a second global admin exists.

   API behaviour for all three is covered by real-D1 integration tests, and the dashboard gates are covered by unit tests with a `canGlobally` spy.
2. **Scope beyond SECTION 3, already accepted by the human reviewer (previous report, finding 3).** The advisory predicates `isLastGlobalAdmin` and `isLastGlobalAdminAssignment` were deleted from core and the two D1 repositories. The "advisory predicates" test block was dropped, and `effective-permissions.test.ts` was updated from 7 to 9 permissions. I re-checked that nothing calls the deleted methods (grep: only `graphify-out` hits). Merging implies accepting this deviation.
3. **Nit, non-blocking.** `use-entry-editor-dialog.test.tsx` has `client =new QueryClient(...)`, a missing space in `beforeEach`. Lint passes.
4. **Nit, non-blocking.** Older tests in `flow-media-assets.test.ts` still build keys with `${Date.now()}-…`. These are the pre-existing download, owner and delete tests. The new regression test uses the fixed key `claim-ignored.png`. Not a blocking violation of §7.7, since the pattern was not introduced by this sprint.

# Verification Evidence
All commands were run by me on the working tree. Nothing from this sprint is committed, so `git diff devs...HEAD` shows only earlier commits. I reviewed `git diff HEAD` plus the staged deletions instead.

- `packages/core`: `pnpm run build` → exit 0. `rtk proxy npx vitest run src/rbac src/oauth src/dashboard-layout` → 14 files, 255 tests passed. `layout-permissions.ts` and its test are absent.
- `apps/api`: `npx tsc --noEmit | grep -c "error TS"` → 50 (baseline 51). A grep of the errors for `schema.handler|upload/index|settings.handler|stats.handler|features/rbac/|permission.middleware|d1-setup-checklist|d1-user|d1-role-assignment` → no hits.
- `apps/api`: `vitest run --project unit src/middleware src/features/rbac src/features/settings src/features/stats src/shared/db/repositories src/shared/rbac` → 52 files, 679 tests passed.
- `apps/api`: `vitest run --config vitest.workers.config.ts src/features/schema src/features/settings src/features/rbac src/features/upload src/features/seeds` → 38 files, 256 tests passed.
- `apps/api`: `vitest run --project flow` (media-assets, stats, rbac-admin, rbac-projections), `beech-minio` container up → 4 files, 46 tests passed.
- `apps/dashboard`: `npx tsc --noEmit` → no errors. `vitest run src/features/entry-editor src/features/seed-builder src/features/rbac src/features/shared src/test/cross-slice` → 36 files, 276 tests passed.
- `pnpm beech test --diff` → PASS; all 30 changed files meet the changed-line threshold; 1 file NOT MEASURED (workerd-only tier). The previous report named `dashboard-layout.handler.ts` as that file. I did not re-derive its name.
- `pnpm beech lint` → 19 of 19 tasks successful.
- Greps over `apps` and `packages` (`.ts`, `.tsx`, `.json`, `.js`; excluding `node_modules`, `dist`, `.vitest`):
  - `canEditLayout\b|ROLES_ALLOWED_TO_EDIT_LAYOUT` → only `apps/api/graphify-out/graph.json` and `packages/mcp/resources/manifest.json` (generated; the manifest is ROADMAP entry 10).
  - `legacy-admin|LEGACY_ADMIN` → 0 files.
  - `developer-protected|DEVELOPER_PROTECTED|cannotDeactivateDev|cannotRemoveDevSuperAdmin` → only the built dashboard bundle in `apps/api/assets` (generated).
  - `countAdmins|isLastGlobalAdmin` → only `graphify-out`.
  - `role (===|=) 'admin'` in non-test `apps/api/src` and `apps/dashboard/src` → 0.
  - `\.role\b` in non-test dashboard code → only i18n key strings (`rbac.assignments.role`, `role-name-taken`), no JWT-user reads.
- Source diff against the plan's building blocks:
  - `permission.middleware.ts`: both layout rows are `perm('manage_seeds', 'global')`. `RouteRequirement` has exactly three kinds. `LEGACY_ADMIN` and the pass-through branch are gone.
  - `schema.handler.ts`: the guard is removed and `requireKnownSeed` stays first in both chains.
  - `upload/index.ts` (download and delete) and `settings.handler.ts` (orphan delete): the owner-or-`manage_users@*` predicate through core `hasPermission` and `resolveEffectivePermissions`, with the 403 bodies unchanged. The RBAC side is evaluated only for non-owners on upload.
  - `stats.handler.ts`: `adminExists` is the constant `true` with the reason comment. `countAdmins` is removed from the interface and the class.
  - `rbac/users.ts`, `assignments.ts`, `constants.ts`: the developer blocks and `DEVELOPER_PROTECTED` are deleted. The in-statement last-admin guards are untouched.
- Rework items re-verified:
  - `use-entry-editor-dialog.test.tsx` has a `canGlobally` spy and two new tests. With `manage_seeds` the flag is `true`. With the spy returning false for `manage_seeds` the flag is `false`. Both assert the spy was called with `"manage_seeds"`. Changing the hook's argument would now fail them.
  - `flow-media-assets.test.ts`: the "claim-ignored" test uses the fixed key, the content-only editor helper and a token with `role: 'admin'`. It asserts 403 and that the `media_objects` row survives.
- Invariant audit:
  - No migration, and no `content_*` or Branch ID path touched.
  - No new cross-slice imports. Upload and settings use `shared/rbac/effective-permissions` plus core. The dashboard uses `@/features/shared/hooks/use-permissions`.
  - Nothing from SECTION 7 touched (`role` types, `seed-fixtures.ts`, `docs/`).
  - No new permission, requirement kind or shared helper.
- Test audit (§8): the new and changed tests carry SPDX headers, sit in the right tiers, follow the four zones, and the writes assert state. Rejections assert nothing changed, and the regression guards carry "why" comments. No `MUST` violation found.
- Acceptance criteria (SECTION 6), item by item: all 12 are met by the evidence above, except that the UI part of the dashboard criterion rests on unit tests and not on a runtime check (see finding 1).
- Runtime: not performed (see finding 1). Not claimed as verified.

# Sprint Documentation
- Every reader of `users.role` that gated authorization has been replaced. `PUT` and `DELETE /api/schema/:slug/layout` now require `manage_seeds@*` in the shared route table. The schema slice keeps no guard of its own, the `legacy-admin` requirement kind is gone, and core `canEditLayout` is deleted.
- Media download, media delete and storage-orphan delete admit the uploader or a `manage_users@*` holder. The JWT `role` claim no longer decides anything, and a regression test proves that a token claiming `role: 'admin'` without the grant is refused.
- The setup checklist's `adminExists` is the constant `true`, because the route gate is `manage_users@*` for an active account. `countAdmins` is removed.
- Developer-account protection (`developer-protected`) is deleted on the API and the dashboard, with its constants, props and locale keys. The `last-global-admin` guards are unchanged.
- The dashboard asks `usePermissions().canGlobally('manage_seeds')` for the layout builder and the Seed Builder actions. `auth-context` no longer exposes `role`.
- Deviations from the plan, accepted:
  - the advisory predicates `isLastGlobalAdmin` and `isLastGlobalAdminAssignment` were removed as dead code;
  - the stale SuperAdmin permission count in `effective-permissions.test.ts` was fixed (7 → 9);
  - the layout 403 body is now `{ error: 'forbidden' }` instead of problem+json (status unchanged, as the plan states);
  - the upload ownership cases stay in the flow file, because the upload integration tier has no `presignGet` coverage.
- Known limitations: no UI runtime check was performed. The `users.role` column, the JWT claim and their types remain until ROADMAP entry 9 (`LegacyRoleAxisRemoval`), and the generated bundles and MCP docs still mention the removed names until entry 10.
