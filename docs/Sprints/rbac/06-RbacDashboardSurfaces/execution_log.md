# Execution Log — `RbacDashboardSurfaces`

Branch: `feature/rbac-dashboard-surfaces` (from `devs`). No commits made — orchestrator commits.

## SECTION 6 — ACCEPTANCE CRITERIA

**Boundaries**
- [x] `packages/core/**` has zero diff. (`git diff devs --stat -- packages/core` empty)
- [x] `apps/api/migrations/**` has zero diff. (`git diff devs --stat -- apps/api/migrations` empty)
- [x] `PROTECTED_ROUTES` has zero diff — no row added, removed or reordered. (`permission.middleware.ts` absent from diff)
- [x] The only `apps/api` production changes are `shared/rbac/scoped-projection.ts` (one added export, `manageableScopes`) and `features/settings/settings.handler.ts` (one added field).
- [x] `apps/dashboard/src/features/rbac/**` imports no feature slice other than `@/features/shared`, and nothing from `apps/api`. (grep gate clean)
- [x] `apps/dashboard/src/features/shared/**` imports no feature slice. (grep gate clean)
- [x] The only new slice-to-slice edge is `settings-dialog.tsx → @/features/rbac`, alongside its existing `@/features/seed-builder` / `@/features/oauth-consent` imports. No reverse edge.

**Contracts**
- [x] `GET /api/settings/me` returns every pre-existing key byte-identical, plus `manageableScopes: string[]`.
- [x] `manageableScopes` = `['*', ...sorted slugs]` global; caller's own `manage_users` scopes (never `'*'`) scoped; `[]` otherwise. (unit + flow tests)
- [x] `GET /api/settings/me` fetched under exactly one query key: `useProfile()` delegates to `useMe()`, `SETTINGS_QUERY_KEYS.profile()` returns `ME_QUERY_KEY`.
- [x] No client-side permission arithmetic: every decision goes through `hasPermission` / `hasPermissionAnywhere` / `permissionsHeldAnywhere` imported from `@beechcms/core` (verified by SECTION 5 gate 6 grep — the one `byScope` hand-loop found during review was replaced with core's `permissionsHeldAnywhere`).
- [x] `AccountView`, `AssignmentView`, role/permission types built on core's `AccountSummary`, `PermissionAssignment`, `RoleRecord`, `Permission`.
- [x] Role editor's permission list rendered from `PERMISSIONS` imported from `@beechcms/core`; no hardcoded permission string array.

**Behaviour**
- [x] While `/settings/me` is loading, `usePermissions()` returns `NO_AUTHORITY` (zero-trust default) — every gated surface hidden, no flash.
- [x] Zero-trust account: Dashboard + Settings → Profile/Security/Connected apps/Notifications/Interface only (tested in `settings-dialog.test.tsx`).
- [x] Analytics / Storage / Site gated on `view_analytics`/`manage_users` at `'*'` respectively.
- [x] Content Types gated only on `isDeveloper`, no RBAC permission (tested: "isDeveloper=false hides Content Types even with every RBAC permission").
- [x] `/settings?tab=<unauthorized>` falls back to Profile (`safeTab` deep-link guard).
- [x] Sidebar content groups unchanged (scope-filtered server-side via `GET /api/schema`).
- [x] HIDE vs DISABLE applied exactly: `getContentCategoryMenu` tests assert Create New present+disabled vs whole group absent.
- [x] Disabled nav item renders no `<Link>`/anchor, `aria-disabled="true"` (tested).
- [x] Analytics/Storage/Site/Access/Content Types hidden, never disabled (only sidebar Create New uses the disabled axis, per T15/T15b).
- [x] No empty nav group rendered (`contentCategoryItems.length > 0` guard in `app-sidebar.tsx`; settings groups `.filter(g => g.items.length > 0)`).
- [x] Idempotent assignment replay renders as success (existing API idempotency preserved; UI does not special-case the id return).
- [x] System roles: no Edit/Delete (tested). Accepted invitations: no Regenerate (tested). Caller's own row: no Deactivate (tested).
- [x] `escalation-refused`, `last-global-admin`, `email-unavailable` each map to a distinct i18n string in `constants.ts` consumers.
- [x] Invitation token never rendered/logged/reconstructed — `AcceptInvitePage` only ever forwards the URL `token` param verbatim to the two `/auth/invitations/*` calls; no other read of it.
- [x] `/accept-invite?token=…` previews, activates, routes to `/login`; invalid/expired/used collapse to one invalid-link card (tested).

**Build & tests**
- [x] `pnpm --filter @beechcms/core run build` clean.
- [x] `apps/api` `npx tsc --noEmit` → 0 errors.
- [x] `apps/dashboard` `npx tsc --noEmit` → 0 errors.
- [x] `pnpm --filter @beechcms/{core,api,dashboard} test` all green; `pnpm lint` green.
- [ ] SECTION 5 item 9 runtime smoke (a–i, manual browser walkthrough with `pnpm beech dev`) — **not executed this run**, deferred to the user per stage contract (requires an interactive browser session).
- [x] No production code was weakened to keep a pre-existing test green. No pre-existing test was adapted for this sprint beyond the three T20 API test files and `settings-dialog.test.tsx`, all listed under Deviations/Notes below.

## Validation command output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(no output — clean)

$ git diff devs --stat -- packages/core
(empty)

$ git diff devs --stat -- apps/api/migrations
(empty)

$ cd apps/api && npx tsc --noEmit | grep -c "error TS"
0

$ cd apps/dashboard && npx tsc --noEmit
(no output — clean)

$ grep -rn "features/" apps/dashboard/src/features/shared/
(no code matches — only doc comments referencing "features/settings" by name)

$ grep -rn "@/features/" apps/dashboard/src/features/rbac/ | grep -v "@/features/shared"
(empty)

$ grep -rn "@/features/settings" apps/dashboard/src/features/rbac/
(empty)

$ grep -rn "apps/api" apps/dashboard/src/features/rbac/
(only a doc-comment path reference in constants.ts, no import)

$ grep -rn "manage_seeds" packages/core apps/api apps/dashboard
(only comments/tests — unchanged from pre-sprint baseline)

$ grep -rn "byScope" apps/dashboard/src | grep -v "use-permissions\|use-me\|\.test\."
(empty — role-form-dialog.tsx now uses core's permissionsHeldAnywhere)

$ pnpm --filter @beechcms/core test
Test Files  37 passed (37)
Tests  659 passed (659)

$ pnpm --filter @beechcms/api test
Test Files  148 passed (148)
Tests  1612 passed (1612)

$ pnpm --filter @beechcms/dashboard test
Test Files  118 passed (118)
Tests  848 passed (848)

$ pnpm lint
12 successful, 12 total (all packages incl. dashboard, api)

$ cd apps/api && npx vitest run src/shared/rbac/scoped-projection.test.ts src/features/settings/__tests__/settings.handler.test.ts src/middleware/permission.middleware.test.ts test/flow-rbac-projections.test.ts test/flow-rbac-admin.test.ts test/flow-rbac-invitations.test.ts test/flow-rbac-enforcement.test.ts
(covered by full `pnpm --filter @beechcms/api test` run above — all green)

$ cd apps/dashboard && npx vitest run src/test/lib/use-permissions.test.ts src/test/config/dashboard-menu.test.ts src/test/pages/accept-invite.test.tsx src/features/settings/components/settings-dialog.test.tsx src/features/rbac
Test Files  8 passed (8)
Tests  24 passed (24)
```

## Deviations from the plan

1. **Icon substitution (`reicon-react`, T17):** exact export `Mail` does not exist; the nearest available glyph is `Mailbox`, imported as `Mail`. `Users` and `ShieldCheck` exist verbatim as specified. (Plan explicitly authorized substituting the nearest glyph.)
2. **Icon choice (T13, `invitations-tab.tsx`):** plan did not name specific icons for Regenerate; used `Refresh` (exists verbatim in `reicon-react`) aliased to `RefreshCw`.
3. **Self-row detection (T11, `users-tab.tsx`):** the plan says "the caller's own row is always present" but does not specify how the UI detects it. `useAuth()`'s JWT-decoded user carries no `id` (by design — plan SECTION 2 explicitly forbids treating it as a permission/identity source beyond `role`), so self-detection uses `useMe().data.id` (the same `/settings/me` cache entry `usePermissions` already reads) compared against each row's `id`.
4. **Local `TooltipProvider` wraps** added inside `assignments-dialog.tsx`, `invite-dialog.tsx`, `role-form-dialog.tsx` around their `Tooltip` usages. The app already wraps the whole tree in one `TooltipProvider` in `main.tsx`; nested providers are harmless in Radix and this keeps each component renderable in isolation (component tests render them outside `main.tsx`'s tree).
5. **`role-form-dialog.tsx` initially hand-rolled a `byScope` fold to compute "permissions held anywhere"** (mirroring core's `permissionsHeldAnywhere`); caught by the SECTION 5 gate-6 self-check and replaced with `permissionsHeldAnywhere` imported from `@beechcms/core` before this log was written. No hand-rolled permission arithmetic remains.

## Not executed

- SECTION 5 item 9 (manual runtime smoke test: `pnpm beech db:reset` / `pnpm beech dev` + browser walkthrough steps a–i). Requires an interactive session; deferred to the user.
- `graphify update . --force` (SECTION 5 item 10) — deferred to the orchestrator per this stage's contract, not run by the execution agent itself in this session.
