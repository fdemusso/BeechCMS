# Execution Log — LegacyRoleGateReplacement

Branch: `feature/legacy-role-gate-replacement`, created from `feature/manage-seeds-permission` after entry 7 was committed (`8a1cd718`). Nothing from this sprint is committed.

## Acceptance criteria

- [x] `PUT` / `DELETE /api/schema/:slug/layout` resolve to `perm('manage_seeds', 'global')`; `RouteRequirement` has exactly three kinds; `LEGACY_ADMIN` is gone.
- [x] A `manage_seeds@*` holder with `users.role = 'editor'` writes and resets a layout. A seed-scoped holder, a non-holder, and a `users.role = 'admin'` account without the grant get 403 with nothing stored or removed (`seed-layout.integration.test.ts`).
- [x] The layout write refusal precedes the 404 and the body parse (non-JSON test stays green).
- [x] Core exports no `canEditLayout` / `ROLES_ALLOWED_TO_EDIT_LAYOUT`; core gains no dependency.
- [x] Media download/delete and orphan delete admit the uploader or a `manage_users@*` holder only. A non-owner with `content:read` + `content:delete` at `'*'` is refused even with a JWT claiming `role: 'admin'`, and the row survives (`flow-media-assets.test.ts`, `settings-storage.integration.test.ts`).
- [x] `ISetupChecklistRepository` has no `countAdmins`; the setup checklist returns `adminExists: true`.
- [x] No `developer-protected` refusal exists. `last-global-admin` refusals are unchanged.
- [x] Dashboard: no `isDeveloper` prop; no developer branch in `users-tab`; both i18n keys are gone from `en.json` and `it.json`.
- [x] Dashboard: layout builder button and Seed Builder actions render iff `canGlobally('manage_seeds')`; `auth-context` exposes no `role`; no non-test dashboard file reads `.role`.
- [x] No new import between feature slices.
- [x] API `tsc` errors: 50 (baseline 51). Remaining errors are pre-existing (`MEDIA_BUCKET` on `Env` in `settings-storage.integration.test.ts`, `invitations.public.test.ts`). Dashboard `tsc` clean. `beech lint` passes.
- [x] Touched tests follow `_config/testing_conventions.md`.

## Validation

1. `packages/core` `pnpm run build` — exit 0.
2. `packages/core` `vitest run src/rbac src/oauth src/dashboard-layout` — 14 files, 255 tests passed; `layout-permissions.test.ts` absent.
3. `apps/api` `tsc --noEmit` — 50 errors, none from this sprint's source files.
4. `apps/api` `vitest run --project unit …` — 50 files, 665 tests passed.
5. `apps/api` `vitest run --config vitest.workers.config.ts …` — 38 files, 256 tests passed.
6. `apps/api` `vitest run --project flow …` (media, stats, rbac-admin, rbac-projections) — 4 files, 46 tests passed, MinIO up.
7. `apps/dashboard` `tsc --noEmit` — no errors.
8. `apps/dashboard` `vitest run …` — green (after restoring the `TooltipProvider` around the assignments list: `PermissionBadgeGroup` needs it).
9. `pnpm beech test --diff` — see the status line at the end of this file.
10. `pnpm beech lint` — 19 of 19 tasks successful.
11. Greps over `apps/` (`.ts`, `.tsx`, `.json`):
    - `canEditLayout|ROLES_ALLOWED_TO_EDIT_LAYOUT|legacy-admin|LEGACY_ADMIN|developer-protected|DEVELOPER_PROTECTED|cannotDeactivateDev|cannotRemoveDevSuperAdmin` — 0 hits.
    - `role === 'admin'` / `role = 'admin'` — only fixtures and tests that are out of scope (`seed-fixtures.ts`, `flow-rbac-upgrade`, `flow-rbac-admin` comment, `d1-user.repository.test.ts`).
    - `\.role\b` in `apps/dashboard/src` — 0 non-test code hits.
12. Manual run (`pnpm beech dev`) — **not run**.
13. `graphify update . --force` — run at the end.

## Decisions and deviations

- **Upload ownership tests stay in the flow file.** `features/upload/test/integration/` has no `presignGet` coverage, so I did not create `upload-ownership.integration.test.ts`.
- **Dead advisory predicates removed** (extra cleanup, requested: no legacy leftovers). `isLastGlobalAdmin` and `isLastGlobalAdminAssignment` served only the developer-protection branches. I deleted them from the core interfaces (`user.repository.ts`, `rbac/types.ts`), the two D1 repositories, and the "advisory predicates" block in `d1-last-global-admin.test.ts`. The in-statement guards in `setActive` and `delete` are untouched.
- **Stale test fixed.** `shared/rbac/effective-permissions.test.ts` expected 7 SuperAdmin permissions. Sprints 6 and 7 added `manage_layout` and `manage_seeds`, so the test already failed before this sprint; I updated it to 9, which `beech test --diff` needs.
- **Layout 403 body changed** from problem+json to the middleware's `{ error: 'forbidden' }`, as the plan states; status is unchanged.
- **`entry-editor-localization.test.tsx`** now mocks `canGlobally: () => true`, as the plan says. Its old `role: "editor"` mock hid the layout builder button; the button is now reachable in that test.

## Rework (review_report.md, REWORK_CODE)

- Finding 1: `use-entry-editor-dialog.test.tsx` — `canGlobally` is now a spy. Two new tests: `canEditLayoutFlag` true with `manage_seeds`, false without it; both assert the spy was called with `"manage_seeds"`.
- Finding 2: `flow-media-assets.test.ts` — "claim-ignored" test uses the fixed key `claim-ignored.png`.
- Finding 3: accepted by the reviewer; no change.
- Finding 4: UI runtime check still not run.
- Validation: dashboard `vitest run src/features/entry-editor src/test/cross-slice` — 184 passed, 0 failed; dashboard `tsc --noEmit` — no errors; api `vitest run --project flow test/flow/flow-media-assets.test.ts` — 43 passed, 0 failed; `graphify update . --force` — run.
