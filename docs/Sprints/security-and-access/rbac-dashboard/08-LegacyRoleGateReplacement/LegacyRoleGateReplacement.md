# Sprint Plan — LegacyRoleGateReplacement (ROADMAP entry 8)

Feature brief: `stages/00_ideation/output/feature_brief.md` (rules 27, 31; §2 "Confini invalicabili"; §4 "Rimozione del
legacy", "Criteri di accettazione trasversali"; §5 "Entry editor").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 8. This planning run split the former entry 8 in two:
- entry 8, this sprint: every reader of the legacy axis is replaced;
- entry 9 (`LegacyRoleAxisRemoval`): the column, the claim and the types are deleted.

Entries 1–6 are shipped and archived under `docs/Sprints/`. Entry 7 (`ManageSeedsPermission`) passed review. It is archived in
`docs/Sprints/ManageSeedsPermission/` but still **uncommitted** on `feature/manage-seeds-permission`. This sprint needs
`manage_seeds` (migration `0040`), so it branches from that branch once entry 7 is committed. It is never based on `devs`/`master`.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (29 072 nodes, 41 872 edges) before any query.

**a) God nodes identified via the CLI**

| Node | Source | Degree / reach | Why it matters here |
|------|--------|----------------|---------------------|
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 20 | The one evaluator. Every gate this sprint rewrites asks it a question: `manage_seeds@*` for the entry-editor layout, `manage_users@*` for the media override. No second evaluator is added. |
| `usePermissions()` | `apps/dashboard/src/features/shared/hooks/use-permissions.ts:L60` | 58 (`graphify explain`) | Exposes `canGlobally` (`L70`). It replaces the two dashboard reads of `user.role`, in `useEntryEditorDialog` and `SeedBuilderPage`. |
| `PROTECTED_ROUTES` / `permissionMiddleware()` | `apps/api/src/middleware/permission.middleware.ts:L69`, `L281` | every `/api/*` request | The two `/api/schema/:slug/layout` rows (`L87-88`) leave `LEGACY_ADMIN`, and the `legacy-admin` kind (`L34-35`, `L41`, `L55`, `L278-279`, `L294`) is deleted. |
| `resolveEffectivePermissions()` | `apps/api/src/shared/rbac/effective-permissions.ts:L27` | shared, memoized per request | The upload and settings slices call it for the owner-or-administrator decision. It already lives in `shared/` for exactly this purpose: no slice-to-slice import. |
| `canEditLayout()` | `packages/core/src/dashboard-layout/layout-permissions.ts:L9` | see c | Its only input is the legacy role string. Deleted. |

**b) Architectural boundaries affected**

- `@beechcms/core` (pure, zero I/O): only deletions.
  - `dashboard-layout/layout-permissions.ts` (and its test) is deleted.
  - The barrel line `index.ts:L87` is deleted.
- `apps/api`:
  - `middleware/permission.middleware.ts`: 2 rows, the kind, comments;
  - `features/schema/schema.handler.ts`: in-slice guard deleted;
  - `features/upload/index.ts`: 2 ownership checks;
  - `features/settings/settings.handler.ts`: orphan-delete ownership check; comment in the route table `permission.middleware.ts:L80`;
  - `features/stats/stats.handler.ts` + `shared/db/repositories/d1-setup-checklist.repository.ts`: `countAdmins` deleted;
  - `features/rbac/users.ts`, `assignments.ts`, `constants.ts`: developer protection deleted;
  - comment only: `middleware/auth.middleware.ts:L101`;
  - tests in those places, plus `test/flow/flow-media-assets.test.ts` and `test/flow/flow-stats.test.ts`.
- `apps/dashboard`:
  - `features/entry-editor/hooks/use-entry-editor-dialog.tsx`;
  - `features/seed-builder/components/SeedBuilderPage.tsx`;
  - `features/rbac/components/users-tab.tsx`, `assignments-dialog.tsx`;
  - `features/rbac/constants.ts`;
  - `lib/auth-context.tsx`;
  - `locales/{en,it}.json`;
  - tests in those places.

**c) `graphify affected` impact analysis**

```
graphify affected "canEditLayout()" --depth 2
- requireLayoutEditPermission() [calls]  apps/api/src/features/schema/schema.handler.ts:L20
- requireLayoutEdit() [calls]            apps/api/src/features/schema/schema.handler.ts:L55
- useEntryEditorDialog() [calls]         apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx:L184
- EntryEditorDialog() / entry-editor-dialog.tsx [calls/imports]   (through the hook, not a direct import: grep)
- layout-permissions.test.ts, use-entry-editor-dialog.test.tsx [imports]
  → All three readers go in this sprint, so the symbol can be deleted with them.
    `ROLES_ALLOWED_TO_EDIT_LAYOUT` (affected: only layout-permissions.test.ts) goes with it.

graphify affected "requireLayoutEditPermission" --depth 2
- requireLayoutEdit() [calls] schema.handler.ts:L55
  → Both are module-private. Their only use is the two route chains at schema.handler.ts:L136, L141.
    `requireKnownSeed` stays.

graphify affected ".countAdmins()" --depth 2
- No affected nodes found (graph miss). grep: the only caller is stats.handler.ts:L196, plus the interface + class in
  d1-setup-checklist.repository.ts:L9, L24-29.

graphify affected "setUserActiveHandler()" / "deleteAssignmentHandler()" --depth 1
- rbac/index.ts [imports] only. The developer blocks are internal branches; signatures unchanged.

graphify explain "AssignmentsDialog()"
- imported only by users-tab.tsx and assignments-dialog.test.tsx
  → The `isDeveloper` prop has exactly one passer (users-tab.tsx:L171). It is removed on both sides.

graphify path "SeedBuilderPage()" "usePermissions()"
- 2 hops via settings-dialog.tsx. SeedBuilderPage renders only inside the Data Models group, which sprint 7 gates on
  canGlobally('manage_seeds'). The page's own `isAdmin` (L45) becomes the same question; no new slice edge
  (`@/features/shared` is the shared slice it already imports, L10).
```

grep complements the graph for the full reader list of the legacy axis, outside the test files and outside the writers
deferred to entry 9:

```
apps/api/src/features/upload/index.ts:271, :305            jwtPayload?.role === 'admin'
apps/api/src/features/settings/settings.handler.ts:420-421  role === 'admin'
apps/api/src/features/rbac/users.ts:151                     target.role === 'admin'
apps/api/src/features/rbac/assignments.ts:118               owner?.role === 'admin'
apps/api/src/features/schema/schema.handler.ts:21-22        canEditLayout(jwtPayload.role)
apps/api/src/shared/db/repositories/d1-setup-checklist.repository.ts:25   WHERE role = 'admin'
apps/dashboard/src/features/seed-builder/components/SeedBuilderPage.tsx:45   user?.role === "admin"
apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx:242  canEditLayout(user?.role)
apps/dashboard/src/features/rbac/components/users-tab.tsx:49, :91, :171      role === "admin"
apps/dashboard/src/lib/auth-context.tsx:35                  payload.role (decoded into the auth user)
```

The other `role` hits only propagate the value or write it. None branches on it:
- `actor = { …, role: jwtPayload.role }` in the content, draft and widget handlers;
- the `UserRecord` mapping;
- the JWT issuance;
- `setup/index.ts:270`, `invitations.public.ts:120`, `CREATED_ACCOUNT_ROLE`.

grep for `actor?.role`, `actor.role` and `options.actor` with a role read finds no consumer in core policies (`engine/privacy/policies.ts`
reads only `actor.type`), in hooks or in automations. Every one of these propagators and writers is entry 9.

**Fixture trap found during the mapping.** `apps/api/test/helpers/seed-fixtures.ts:L24-29` defaults every `TEST_USERS` row
to `role 'admin'` + SuperAdmin. `TEST_USERS[1]` ("editor", `user_editor_01`) therefore already holds `manage_users@*`
today. The current "not owner and not admin → 403" tests in `flow-media-assets.test.ts:L271-283` and `L342-354` pass only
because they mint a JWT with `role: 'editor'`. Once the override reads `manage_users@*`, they would turn into 200s. The
same trap exists in `settings-storage.integration.test.ts:L250-266`, which grants the canonical editor SuperAdmin. T4
rewrites all three arrangements.

### VETO Audit

- **Botanical invariant.**
  - No migration. No `content_*` table, Branch ID, `apiToDb` or `dbToApi` path is touched.
  - The only SQL change is a deletion: the `countAdmins` statement on the `users` system table.
  - **PASS.**
- **VSA.**
  - The entry-editor layout gate moves from the schema slice into the shared `permissionMiddleware`, like `/api/seeds` in
    sprint 7.
  - The upload and settings slices each call the shared `resolveEffectivePermissions` + core `hasPermission`. Neither imports
    the other or the `rbac` slice.
  - Dashboard gates go through the shared `usePermissions`.
  - `graphify path "schemaApp" "rbacApp"` = 2 hops via `factory.ts` (the composition root); unchanged.
  - **PASS.**
- **Cloudflare purity.** No schema change, no new binding. **PASS.**
- **YAGNI cuts applied before drafting:**
  1. **No shared "is owner or admin" helper.** Three call sites in two slices, each one line of core calls. A shared
     helper would be a new module for a single expression.
  2. **No `adminExists` recomputation.** The route is gated `manage_users@*` (`permission.middleware.ts:L125`) and the
     middleware refuses deactivated accounts first (`resolveActiveAccount`, `L231`, called at `L283`). A caller who reaches the handler is therefore an active global
     administrator, so the field is constantly `true`. The repository method goes. The response field stays, so the
     dashboard widget contract is unchanged.
  3. **No new permission and no new requirement kind.** `perm('manage_seeds','global')` and core `hasPermission` cover
     every replacement.
  4. **No type removal** (`UserRecord.role`, `JwtClaims.role`, `ActorContext.role`, `HookActor.role`). That is entry 9, where
     the compiler drives it. Doing it here would drag ~40 fixture files into a security diff.
- **Decisions that resolve the roadmap's open point:**
  1. **Entry-editor layout gate → `manage_seeds@*`.**
     - Brief §5 keeps "il gate … com'è oggi": the developer axis edits seed form layouts.
     - The vocabulary JSDoc (`permissions.ts:L12-16`) names `manage_seeds` as the deliberate replacement of
       `users.role = 'admin'`.
     - `manage_layout@*` would widen the gate to dashboard-layout editors. It would also pre-empt the per-seed
       `manage_layout` value that brief §4/§5 reserves for the future entry-editor iteration.
     - The form layout is part of the seed schema surface, which `manage_seeds` already owns.
  2. **Media override → `manage_users@*`.**
     - The override means "a platform administrator may act on anyone's file". `manage_users@*` is the marker the
       last-global-admin invariant already uses (`global-admin-sql.ts:L18-23`).
     - Brief rule 31 makes that invariant the only remaining guarantee.
     - The route gates (`content:read@*` download, `content:delete@*` delete) are unchanged. Using either of them as the
       override would make the ownership check meaningless.
  3. **Developer protection is deleted, not replaced** (brief rule 31). The last-global-admin refusal stays as it is.

No violation remains. HANDOFF → executor.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

After sprint 7, `users.role` no longer gates `/api/seeds/*`, but it still decides six things on the server and three in the
dashboard:
- who may edit a seed's form layout;
- who may download or delete someone else's media;
- whether the setup checklist sees an administrator;
- whether an account is "the Developer", who can be neither deactivated nor stripped of SuperAdmin.

Brief rule 27 removes the column and the claim. Each of these readers would then silently flip, to "nobody" for the layout
gate and the media override, and to "always false" for the checklist. Deleting the storage first would therefore change
authorization by accident. This sprint changes it on purpose and proves each new rule with tests. Entry 9 is then a pure
deletion, where the type checker finds every leftover.

The work follows the Vertical Slice Architecture:
- Authorization lands in the shared `permissionMiddleware` or in slice code that calls shared or core evaluators. No
  slice imports another, and the schema slice drops its own guard, as the seeds slice did in sprint 7.
- Core only loses code (`canEditLayout`), so it stays the single source of authorization truth. The dashboard asks
  `usePermissions().canGlobally`, which is core `hasPermission`, the function the route gates call. That satisfies
  "nessuna logica di autorizzazione della UI diverge dalle funzioni del core".

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware order** (unchanged by this sprint): `authMiddleware` sets `jwtPayload`, then `permissionMiddleware()`
(`permission.middleware.ts:L281`) applies these steps:
1. `resolveActiveAccount`: 403 `account_disabled` for every requirement class;
2. `resolveRouteRule`: 403 `route_not_registered`;
3. `authenticated` and `legacy-admin`: pass through (`L294-297`);
4. `permission-any-scope`;
5. `permission` via `resolveEffectivePermissions` + core `hasPermission`: 403 `{ error: 'forbidden' }`.

Then the slice router runs.

**Entry-editor layout routes** (`schema.handler.ts`):
- `PUT` and `DELETE /api/schema/:slug/layout` mount `requireLayoutEdit` (`L55-59`), then `requireKnownSeed` (`L61-65`),
  then (PUT only) `zodJson` (`L136`, `L141`).
- `requireLayoutEditPermission` (`L20-31`) returns a problem+json 403 `type: 'forbidden'` unless
  `canEditLayout(jwtPayload.role)`, i.e. role `'admin'`.
- Order today: permission → seed 404 → body. The middleware row preserves it: the 403 precedes the router, so it still
  precedes the 404 and the body parse.

**Media ownership** (`upload/index.ts`):
- `GET /upload/download-url/:key` (`L268-275`) and `DELETE /upload/:key` (`L302-309`) refuse 403 `{ error: 'Forbidden' }`
  unless `jwtPayload.sub === media.uploaded_by` or `jwtPayload.role === 'admin'`.
- Route gates: `content:read@*`, `content:delete@*` (`permission.middleware.ts:L178-179`).
- `POST /api/settings/storage/orphans/delete` (`settings.handler.ts:L419-424`) applies the same rule per key and refuses
  403 `{ type: 'settings-storage-orphan-forbidden', keys }`. Its gate is `content:delete@*` (`permission.middleware.ts:L81`).

**Setup checklist** (`stats.handler.ts:L194-199`): `adminExists = countAdmins() > 0` inside a try/catch.
- `countAdmins` runs `SELECT COUNT(*) … FROM users WHERE role = 'admin'`.
- The route gate is `manage_users@*` (`permission.middleware.ts:L125`).

**Developer protection:**
- `setUserActiveHandler` (`rbac/users.ts:L151-161`): deactivating a `role 'admin'` target refuses 409 `developer-protected`,
  or `last-global-admin` when the target is the last global admin.
- `deleteAssignmentHandler` (`rbac/assignments.ts:L114-129`): deleting a global SuperAdmin assignment of a `role 'admin'`
  owner gets the same pair.
- Constant `RBAC_ERRORS.DEVELOPER_PROTECTED` (`rbac/constants.ts:L27-28`).
- Dashboard `users-tab.tsx`:
  - `L49-50`: the toggle returns early for `isDev`;
  - `L91-92`: the switch is disabled;
  - `L147-148`: tooltip `cannotDeactivateDev`;
  - `L171`: passes `isDeveloper`.
- Dashboard `assignments-dialog.tsx`:
  - prop `isDeveloper` (`L32`, `L40`);
  - `cannotDelete` (`L91-93`) disables the delete button;
  - tooltip `cannotRemoveDevSuperAdmin` (`L129-136`).
- Dashboard `features/rbac/constants.ts:L18` `DEVELOPER_PROTECTED`.
- Locales: `en.json` / `it.json` `L1722` `cannotDeactivateDev`, `L1771` `cannotRemoveDevSuperAdmin`.

**Dashboard role reads:**
- `useEntryEditorDialog` (`use-entry-editor-dialog.tsx:L15` import, `L241-242`): `canEditLayoutFlag = canEditLayout(user?.role)`,
  fed to `SchemaFormShell` (`L677`).
- `SeedBuilderPage.tsx:L44-45`: `isAdmin = user?.role === "admin"` shows create/edit/delete (`L69`, `L100`, `L106`, …).
- `auth-context.tsx:L18`, `L32-35`, `L43`: the decoded JWT user carries `role?: 'admin' | 'editor'`.
- `usePermissions().canGlobally` exists (`use-permissions.ts:L70`).
- Path convention: the entry-editor slice already imports `@/features/shared/hooks/use-permissions` (`schema-form-shell.tsx:L8`).

**Test harness facts:**
- `createTestHarness` seeds every `CANONICAL_USERS` row by default. `admin` (role `'admin'`) holds SuperAdmin@*.
  `editor` and `viewer` (role `'editor'`) hold no assignment (`packages/testing/src/seeds/canonical.data.ts`).
- Custom roles are arranged by direct SQL on `roles` / `role_permissions` / `user_role_assignments`. The model is the
  `grantEditor` helper in `seeds/test/integration/seed-access.integration.test.ts:L39-47`, which also wipes non-system roles
  in `beforeEach` (`L30-31`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Delete:
- `packages/core/src/dashboard-layout/layout-permissions.ts`
- `packages/core/src/dashboard-layout/layout-permissions.test.ts`

Edit (source):
- `packages/core/src/index.ts`: drop the `layout-permissions.js` re-export (`L87`).
- `apps/api/src/middleware/permission.middleware.ts`
- `apps/api/src/features/schema/schema.handler.ts`
- `apps/api/src/features/upload/index.ts`
- `apps/api/src/features/settings/settings.handler.ts`
- `apps/api/src/features/stats/stats.handler.ts`
- `apps/api/src/shared/db/repositories/d1-setup-checklist.repository.ts`
- `apps/api/src/features/rbac/users.ts`, `assignments.ts`, `constants.ts`
- `apps/api/src/middleware/auth.middleware.ts` (comment `L101` only)
- `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`
- `apps/dashboard/src/features/seed-builder/components/SeedBuilderPage.tsx`
- `apps/dashboard/src/features/rbac/components/users-tab.tsx`, `assignments-dialog.tsx`
- `apps/dashboard/src/features/rbac/constants.ts`
- `apps/dashboard/src/lib/auth-context.tsx`
- `apps/dashboard/src/locales/en.json`, `it.json`

Edit (tests):
- `apps/api/src/middleware/permission.middleware.test.ts`
- `apps/api/src/features/schema/test/integration/seed-layout.integration.test.ts`
- `apps/api/test/flow/flow-media-assets.test.ts`
- `apps/api/src/features/settings/test/integration/settings-storage.integration.test.ts`
- `apps/api/test/flow/flow-stats.test.ts`
- `apps/api/src/features/rbac/users.test.ts`, `assignments.test.ts`
- `apps/api/src/features/rbac/test/integration/assignments.integration.test.ts`
- `apps/dashboard/src/features/entry-editor/test/unit/use-entry-editor-dialog.test.tsx`
- `apps/dashboard/src/test/cross-slice/entry-editor.test.tsx`, `entry-editor-localization.test.tsx` (mock shape only)
- `apps/dashboard/src/test/cross-slice/seed-builder-page.test.tsx`
- `apps/dashboard/src/features/seed-builder/test/unit/seed-builder-page-purge.test.tsx`
- `apps/dashboard/src/features/rbac/components/users-tab.test.tsx`, `assignments-dialog.test.tsx`

Create (test):
- `apps/api/src/features/upload/test/integration/upload-ownership.integration.test.ts`: only if T4's pre-check finds that the
  workers tier can presign. Otherwise the flow file carries the cases (see T4).

No migration. No API contract change except:
- the error body of a refused layout write: problem+json `type: forbidden` → middleware `{ error: 'forbidden' }`, status 403
  unchanged;
- the `developer-protected` code disappears.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — Entry-editor layout routes on `manage_seeds@*`; delete the `legacy-admin` kind

Approach: same move as sprint 7's `/api/seeds` rows. The shared middleware decides and the slice keeps no guard. One
evaluator, and the refusal happens before the router, so before the 404 and the body.

`apps/api/src/middleware/permission.middleware.ts`:
- Rows `L87-88` become, verbatim:
  ```ts
  { method: 'PUT',    pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: perm('manage_seeds', 'global') },
  { method: 'DELETE', pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: perm('manage_seeds', 'global') },
  ```
- Section comment `L85` becomes: read is dashboard chrome; seed form layout writes are schema authoring, so `manage_seeds`
  at the global scope.
- Delete: the `'legacy-admin'` bullet of the `RouteRequirement` JSDoc (`L34-35`); the `| { kind: 'legacy-admin' }` member
  (`L41`); `LEGACY_ADMIN` (`L55`); the paragraph `L278-279`; and `|| rule.requirement.kind === 'legacy-admin'` in `L294`.
  After this, `RouteRequirement` is exactly:
  ```ts
  export type RouteRequirement =
    | { kind: 'permission'; permission: Permission; scope: ScopeSource }
    | { kind: 'permission-any-scope'; permissions: readonly Permission[] }
    | { kind: 'authenticated' }
  ```
- `L80` comment ("the handler adds the owner-or-admin check") → "owner-or-`manage_users@*` check".

`apps/api/src/features/schema/schema.handler.ts`:
- Delete `requireLayoutEditPermission` (`L19-31`) and `requireLayoutEdit` (`L55-59`).
- Remove `requireLayoutEdit` from both chains (`L136`, `L141`). `requireKnownSeed` stays first.
- Drop `canEditLayout` from the core import (`L7`).
- Rewrite the JSDoc above `requireKnownSeed` (`L50-54`): the permission is decided by the route table before this router.
  The seed check still runs before the body is read.
- Replace "Admin-only." in `L134` and `L139` with "Gated by `manage_seeds` at the global scope (route table)."

`packages/core`: delete `dashboard-layout/layout-permissions.ts` + its test, and the `index.ts:L87` re-export. No other core
file imports it (affected list, c).

`apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx`:
- Drop `canEditLayout` from the core import (`L15`).
- Replace `L241-242` with `canGlobally("manage_seeds")` from `usePermissions()`, imported from
  `@/features/shared/hooks/use-permissions`, the path `schema-form-shell.tsx:L8` uses.
- `const { user } = useAuth()` goes too if `user` has no other reader in the hook (grep inside the file). Drop the import if
  it becomes unused.
- `canEditLayoutFlag` keeps its name and its consumers.

Tests:
- `apps/api/src/middleware/permission.middleware.test.ts`, unit, existing file:
  - replace `it('the entry-editor layout routes still resolve to legacy-admin')` (`L68-72`) with: "the entry-editor layout
    routes resolve to manage_seeds at the global scope". Same arrangement, expected
    `[{ kind: 'permission', permission: 'manage_seeds', scope: 'global' }, …]` ×2.
- `apps/api/src/features/schema/test/integration/seed-layout.integration.test.ts`, integration (real D1), canonical
  users plus a `grantEditor(scope)` local helper copied from `seed-access.integration.test.ts:L39-47`:
  - add the non-system-role wipe to `beforeEach`, as in `seed-access…:L30-31`, with the same comment;
  - existing "forbids a non-admin …" tests (`L125`, `L143`, `L247`): keep the bodies; rename to "a caller without
    `manage_seeds` …" (canonical editor, no assignment, still 403, nothing stored or removed);
  - new: "the canonical editor holding manage_seeds at '*' stores a layout with 200 and the row exists";
  - new: "manage_seeds held only on seed 'posts' is refused 403 on PUT and nothing is stored";
  - new: "users.role 'admin' without a manage_seeds grant is refused 403 on PUT and nothing is stored". Arrange like
    `seed-access…:L108`: delete the admin's assignments. This regression guard keeps the legacy axis from coming back.
  - new: "the canonical editor holding manage_seeds at '*' resets a stored layout with 200 and the row is gone" (DELETE).
- `apps/dashboard/src/features/entry-editor/test/unit/use-entry-editor-dialog.test.tsx`, unit:
  - add a `vi.mock("@/features/shared/hooks/use-permissions", …)` returning `canGlobally` (plus `can` / `canAnywhere` if
    the hook's dependency tree needs them);
  - drop `role` from the `useAuth` mock (`L23`). Keep the mock only if the hook still calls `useAuth`.
  - No new `it()`: the gate is a one-line projection, proven by the two shell tests below.
- `apps/dashboard/src/test/cross-slice/entry-editor.test.tsx` (`L69`), `entry-editor-localization.test.tsx` (`L33-35`):
  - add `canGlobally: () => true` to the existing `usePermissions` mock, so the layout builder button stays reachable
    exactly as with today's `role: "admin"` mock;
  - drop `role` from their `useAuth` mocks;
  - no assertion change.

### T2 — Media owner-or-administrator on `manage_users@*`

Approach: same predicate in three places: `jwtPayload.sub === media.uploaded_by` OR
`hasPermission(await resolveEffectivePermissions(c), 'manage_users', GLOBAL_SCOPE)`.
- Evaluate the RBAC side only when the caller is not the owner, so owners pay no extra D1 read.
- `resolveEffectivePermissions` memoizes per request: the route gate already resolved it, so it is a cache hit anyway.

- `apps/api/src/features/upload/index.ts`:
  - `L268-275` and `L302-309`: replace `isAdmin`, keep the existing 403 `{ error: 'Forbidden' }` body and the comment
    position;
  - comment text: "owner (uploaded_by) or a global administrator (`manage_users@*`)";
  - imports: `hasPermission`, `GLOBAL_SCOPE` from `@beechcms/core` (extend `L11`), and `resolveEffectivePermissions` from
    `../../shared/rbac/effective-permissions`.
- `apps/api/src/features/settings/settings.handler.ts:L419-421`:
  - keep the "Same owner-or-admin rule as DELETE /api/upload/:key" comment, reworded to name `manage_users@*`;
  - `foreignKeys` is empty when the caller holds `manage_users@*`, otherwise the keys not uploaded by `sub`;
  - stop destructuring `role`;
  - add the missing imports; `resolveEffectivePermissions` is already used elsewhere in the slice (grep).

Tests (T4 owns the fixture rewrite these depend on).

### T3 — Setup checklist without `countAdmins`

- `apps/api/src/shared/db/repositories/d1-setup-checklist.repository.ts`: delete `countAdmins` from
  `ISetupChecklistRepository` (`L9`) and `D1SetupChecklistRepository` (`L24-29`).
- `apps/api/src/features/stats/stats.handler.ts:L194-199`:
  - replace the `adminExists` try/catch with the constant `true`;
  - add a one-line comment: the route gate is `manage_users@*` for an active account, so reaching this handler proves an
    active global administrator exists.
  - The response shape is unchanged.
- grep for any test double implementing `ISetupChecklistRepository.countAdmins`, and drop the member there.
- `apps/api/test/flow/flow-stats.test.ts`, flow tier, existing fixtures:
  - first checklist test (`L50-71`): change `expect(typeof checklist.adminExists).toBe('boolean')` to `toBe(true)`, and turn
    the stale `L67` comment into the reason above;
  - delete `it('… returns adminExists=false when user table is empty')` (`L73-92`). That state is unreachable, because the
    only callers who clear the gate are global administrators. Put a one-line comment at the deleted site (rule 6.2.3,
    deliberate omission) saying why. The review must see this as a deliberate contract change, not a test edited to pass
    (conventions §7.10).

### T4 — Rewrite the fixtures that relied on the JWT `role` claim

Approach: a "non-owner, non-administrator" caller must actually lack `manage_users@*` while clearing the route gate. The
JWT claim no longer decides anything.

- `apps/api/test/flow/flow-media-assets.test.ts`, flow tier (MinIO), `TEST_USERS` + `seedTestUsers`:
  - add a `describe`-local helper `seedContentOnlyEditor()`. It removes `TEST_USERS[1]`'s SuperAdmin assignment, then inserts
    a role carrying `content:read` + `content:delete` and assigns it at `'*'`. Use direct SQL on structural tables
    (rule 3.8), resolving nothing by literal id except a fixed UUID role id, as `seed-access…:L18`. Comment the reason:
    `seedTestUsers` grants SuperAdmin to every row by default (`seed-fixtures.ts:L24-29`).
  - "returns 403 when user is not owner and not admin" (`L271`, download; `L342`, delete): call the helper in ARRANGE, and
    issue the token without `role`. Rename both to "… is not the owner and lacks manage_users@*". Delete case: also assert the
    `media_objects` row still exists (rule 5.6).
  - "allows download when user is owner" (`L285`): call the helper too (owner path, no administrator authority), and drop
    `role` from the token. Expected 200 unchanged.
  - "allows delete if user is admin even if not owner" (`L356`): rename to "a manage_users@* holder deletes a file it did not
    upload". Issue the token without `role` (`TEST_USERS[0]` holds SuperAdmin), and add the row-gone assertion.
  - new: "a non-owner holding content:read and content:delete at '*' but no manage_users is refused even though the JWT
    claims role admin". Arrange with the helper, then issue the token with `role: 'admin'`. Expect 403 and the row still
    present. This regression guard proves the claim is ignored. It is the only token in the file that still carries `role`;
    entry 9 removes the claim type.
  - Pre-check, then decide once: the upload integration tier (`features/upload/test/integration/`) runs in workerd. If
    `media-delivery.integration.test.ts` shows `presignGet` works there, put the four cases in a new
    `upload-ownership.integration.test.ts` with the harness and delete them from the flow file. Otherwise keep them in the
    flow file as above. Record the decision in the execution log.
- `apps/api/src/features/settings/test/integration/settings-storage.integration.test.ts`, integration (real D1):
  - "refuses another user's orphan to a non-admin holder of global content:delete" (`L250-266`): replace the SuperAdmin grant
    (`L252-255`) with a non-system role carrying only `content:delete`, assigned to the canonical editor at `'*'`. Same SQL
    shape as `seed-access…:L39-47`. Add the role wipe to `beforeEach` if the file has none. Assertions unchanged.
  - new: "a manage_users@* holder deletes another user's orphan": `trackMedia` uploaded by the canonical editor, the canonical
    admin deletes it; 200, R2 object gone, tracked count 0. Copy the success assertions of the existing admin test above
    `L245`.

### T5 — Delete the Developer-account protection (brief rule 31)

API:
- `rbac/users.ts`:
  - delete the `if (!isActive && target.role === 'admin') { … }` block (`L151-161`). The `setActive` call already returns
    `last-global-admin` for the sole administrator, inside the UPDATE.
  - Rewrite the file JSDoc `L12-19` to say only that every account minted here is created with the default `users.role`
    value. The column itself leaves in ROADMAP entry 9. Keep `CREATED_ACCOUNT_ROLE`: it is a writer.
- `rbac/assignments.ts`:
  - delete the `if (assignment.scope === GLOBAL_SCOPE) { … }` block (`L114-129`);
  - drop the `GLOBAL_SCOPE` / `SUPER_ADMIN_ROLE_NAME` imports if they become unused (`L6`).
  - `assignmentRepository.delete` keeps the in-statement last-admin refusal.
- `rbac/constants.ts`: delete `DEVELOPER_PROTECTED` and its JSDoc (`L27-28`).

Dashboard:
- `features/rbac/constants.ts:L18`: delete `DEVELOPER_PROTECTED`.
- `users-tab.tsx`:
  - delete both `isDev` computations (`L49-50`, `L91`);
  - `isSwitchDisabled` becomes `isSelf || setUserActive.isPending`;
  - the tooltip chooses between `cannotDeactivateSelf` and `status` only;
  - drop the `isDeveloper` prop at `L171`.
- `assignments-dialog.tsx`:
  - delete the `isDeveloper` prop (interface `L32`, default `L40`);
  - delete `isSuperAdmin` / `cannotDelete` (`L91-93`) and the `cannotDelete` tooltip branch (`L129-136`);
  - the delete button is never disabled by role. Unwrap the per-button `Tooltip` / `TooltipTrigger` if nothing else uses them;
  - drop the imports that become unused (`SUPER_ADMIN_ROLE_NAME`, `Tooltip*`). Check `L88`'s `TooltipProvider` users first.
- `locales/en.json`, `it.json`: delete `rbac.users.cannotDeactivateDev` (`L1722`) and
  `rbac.assignments.cannotRemoveDevSuperAdmin` (`L1771`) in both files.

Tests:
- `apps/api/src/features/rbac/users.test.ts`, unit, existing file:
  - replace `it('refuses deactivating the Developer account even when another admin exists (409)')` (`L127-144`) with:
    "deactivating an account whose users.role is 'admin' succeeds with 200 while another global administrator exists". Same
    arrangement; assert 200 and that `setActive` was reached (the unit tier's repository double). Rename any "Developer"
    wording in the neighbouring last-admin test to "the only global administrator".
- `apps/api/src/features/rbac/assignments.test.ts`, unit:
  - replace `L167-188` with "deleting the SuperAdmin assignment of a users.role 'admin' account succeeds with 204 while
    another global administrator exists".
- `apps/api/src/features/rbac/test/integration/assignments.integration.test.ts`, integration (real D1):
  - `L103`: rename to "refuses removing the only global administrator's assignment with last-global-admin". Body unchanged.
  - `L117-133`: rename to "removes the canonical admin's SuperAdmin assignment with 204 while another global administrator
    exists". Same arrangement. Expect 204 and `countAdminAssignments()` = 0. The helper (`L30-36`) counts the canonical
    admin's own assignments, and the editor's global `manage_users` assignment is what keeps the invariant satisfied.
- `apps/dashboard/src/features/rbac/components/users-tab.test.tsx`, unit:
  - replace `it("disables status switch for a developer account (role === 'admin')")` (`L76`) with: "an account whose role is
    'admin' that is not the caller has an enabled status switch". This regression guard keeps the developer exception from
    coming back.
- `apps/dashboard/src/features/rbac/components/assignments-dialog.test.tsx`, unit:
  - replace `L77` ("disables delete … when isDeveloper is true") with "the SuperAdmin assignment's delete button is enabled";
  - drop the `isDeveloper` prop from every render.

### T6 — Seed Builder actions and the dashboard auth user

- `SeedBuilderPage.tsx:L44-45`:
  - `isAdmin` becomes `canGlobally("manage_seeds")` from `usePermissions()`, imported from
    `@/features/shared/hooks/use-permissions`;
  - drop `useAuth` and its import (`L8`) if `user` has no other reader in the file;
  - keep the local name `isAdmin` → rename it to `canManageSeeds`, so the condition reads as what it is (all uses: `L69`,
    `L100`, `L106`, …, grep).
- `lib/auth-context.tsx`:
  - remove `role` from the user type (`L18`, `L32`, `L34`, `L43`) and from the object built in `decodeUser` (`L35`);
  - after this, nothing in `apps/dashboard/src` reads the JWT `role` claim (§4 cross-cutting criterion).
- Tests:
  - `apps/dashboard/src/test/cross-slice/seed-builder-page.test.tsx`, unit (cross-slice):
    - replace the `mockAuthAdmin` / `mockAuthEditor` / `mockAuthRef` switch (`L20-27`) with a `canGlobally` ref in the existing
      `usePermissions` mock (`L24`);
    - "shows … for admin" (`L86`, `L100`) → "… for a manage_seeds@* holder";
    - "hides create/edit/delete for non-admin" (`L206`) → "hides create/edit/delete without manage_seeds@*";
    - keep the `useAuth` mock only if the page still calls it.
  - `apps/dashboard/src/features/seed-builder/test/unit/seed-builder-page-purge.test.tsx`, unit:
    - replace the `useAuth` admin mock (`L22`) with a `usePermissions` mock whose `canGlobally` returns true;
    - check whether `@/features/shared` (`L23`) is mocked wholesale, and mock the hook path the page now imports;
    - assertions unchanged.

### T7 — Comment-only

- `apps/api/src/middleware/auth.middleware.ts:L101`: the in-slice readers of `jwtPayload` are `actorFromContext` and the
  slices' `sub` reads. Drop "the schema layout gate".

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run in order. Expected results in brackets.

1. `packages/core`: `pnpm run build` [exit 0].
2. `packages/core`: `npx vitest run src/rbac src/oauth src/dashboard-layout` [green; `layout-permissions.test.ts` absent].
3. `apps/api`: `npx tsc --noEmit | grep -c "error TS"` [= the baseline you measure on the branch before T1, 51 at
   sprint 7; 0 hits in `schema.handler`, `upload/index`, `settings.handler`, `stats.handler`, `rbac/`,
   `permission.middleware`, `d1-setup-checklist`].
4. `apps/api`: `npx vitest run --project unit src/middleware src/features/rbac src/features/settings src/features/stats
   src/shared/db/repositories` [green].
5. `apps/api`: `npx vitest run --config vitest.workers.config.ts src/features/schema src/features/settings src/features/rbac
   src/features/upload src/features/seeds` [green, including the new seed-layout cases].
6. `apps/api`: `npx vitest run --project flow test/flow/flow-media-assets.test.ts test/flow/flow-stats.test.ts
   test/flow/flow-rbac-admin.test.ts test/flow/flow-rbac-projections.test.ts` [green; flow-media-assets needs the Docker
   MinIO stack: `pnpm beech dev`, or start Docker Desktop if the daemon is down].
7. `apps/dashboard`: `npx tsc --noEmit` [no errors].
8. `apps/dashboard`: `npx vitest run src/features/entry-editor src/features/seed-builder src/features/rbac
   src/features/shared src/test/cross-slice` [green].
9. `pnpm beech test --diff` [PASS; changed-line coverage met].
10. `pnpm beech lint` [all tasks successful].
11. Greps, excluding `node_modules`, `dist`, `graphify-out`, `docs`, `stages`, `migrations`:
    - `canEditLayout|ROLES_ALLOWED_TO_EDIT_LAYOUT` → 0 in source. `canEditLayoutFlag` (dashboard prop name) is allowed.
    - `legacy-admin|LEGACY_ADMIN` → 0.
    - `developer-protected|DEVELOPER_PROTECTED|cannotDeactivateDev|cannotRemoveDevSuperAdmin` → 0.
    - `role === 'admin'|role === "admin"|role = 'admin'` in `apps/api/src` and `apps/dashboard/src` non-test files → 0.
    - `\.role\b` in `apps/dashboard/src` non-test files → 0 (the `accountUser.role` wire field may remain unread in types only).
12. Manual (`pnpm beech dev`), state in the log if not run:
    - as the setup account, open an entry and use the form layout builder → save works;
    - create a role with `content:*` only, assign it at `*` to a second account, log in → the layout builder button is
      absent;
    - deactivating the setup account while it is the only admin shows the last-admin error, and succeeds once a second
      global admin exists.
13. `graphify update . --force`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PUT` / `DELETE /api/schema/:slug/layout` resolve to `perm('manage_seeds', 'global')`; `RouteRequirement` has
      exactly three kinds; `LEGACY_ADMIN` is gone.
- [ ] A `manage_seeds@*` holder with `users.role = 'editor'` writes and resets a seed form layout. A seed-scoped holder, a
      non-holder, and a `users.role = 'admin'` account without the grant get 403, and nothing is stored or removed.
- [ ] The layout write refusal precedes the 404 and the body parse (existing non-JSON test stays green).
- [ ] Core exports no `canEditLayout` / `ROLES_ALLOWED_TO_EDIT_LAYOUT`; core gains no dependency.
- [ ] Media download/delete and storage-orphan delete admit the uploader or a `manage_users@*` holder only. A non-owner
      with `content:read` + `content:delete` at `'*'` is refused even with a JWT claiming `role: 'admin'`, and the file and
      its row survive.
- [ ] `ISetupChecklistRepository` has no `countAdmins`. `GET /api/content/stats/setup-checklist` returns
      `adminExists: true` to every caller who clears its gate.
- [ ] No `developer-protected` refusal exists. The setup account can be deactivated and lose SuperAdmin while another
      active global administrator exists. `last-global-admin` refusals are unchanged.
- [ ] Dashboard: no `isDeveloper` prop on `AssignmentsDialog`; no developer branch in `users-tab`; the two i18n keys are
      gone from `en.json` and `it.json`.
- [ ] Dashboard: the entry-editor layout builder button and the Seed Builder create/edit/delete actions render iff
      `canGlobally('manage_seeds')`. `auth-context` exposes no `role`, and no non-test dashboard file reads `.role` from
      the JWT user.
- [ ] No new import between `apps/api/src/features/*` or `apps/dashboard/src/features/*` slices.
- [ ] API `tsc` error count ≤ the measured baseline; dashboard `tsc` clean; `beech test --diff` and `beech lint` pass.
- [ ] Every test touched follows `_config/testing_conventions.md`: one act, status first, writes assert state,
      rejections assert nothing changed, and no `any` in new code.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT touch the following:

- **ROADMAP entry 9 (`LegacyRoleAxisRemoval`):**
  - the `users.role` column and its CHECK (no migration in this sprint);
  - `role` in `UserRecord` / `AccountSummary` / `NewUserInput` (`packages/core/src/auth/user.repository.ts`), `JwtClaims`
    (`auth/token-service.ts`), `ActorContext` (`engine/types.ts`), `HookActor` (`common/hooks.ts`) and
    `RepositoryOptions.actor` (`content/content.repository.ts`);
  - the JWT `role` written by `auth.app.ts:L154`, `L212` and `auth.middleware.ts:L114`;
  - the writers `setup/index.ts:L270`, `rbac/users.ts` `CREATED_ACCOUNT_ROLE`, `invitations.public.ts:L120`, and the
    `d1-user` / `d1-invitation` repositories;
  - the actor `role` propagation in the content / draft / widget handlers;
  - `@beechcms/testing` canonical users and `apps/api/test/helpers/seed-fixtures.ts`;
  - every test fixture that merely sets `role`, including `seeds.test.ts`, `d1-user.repository.test.ts` and
    `seed-access.integration.test.ts:L107`;
  - the `role` field still present on `AccountSummary` over the wire (unread by the dashboard after T5).
- **ROADMAP entry 10 (`RbacDashboardDocs`):** every file under `docs/`, plus `packages/mcp/README.md:72`.
- **Not touched:**
  - `setup/index.ts` `isDeveloper` env flag and `SetupPage.tsx` `environment.isDeveloper` (brief §2);
  - the `track: 'developer'` setup flows;
  - `last-admin.integration.test.ts:L55` comment (canonical admin wording, entry 9).
- **No new permission, no requirement kind, no shared "owner-or-admin" helper, no migration.**
- **Product logic not touched:** the per-seed `manage_layout` value and any other entry-editor product change (brief §5).
