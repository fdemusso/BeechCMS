# ROADMAP — Multi-Stakeholder RBAC / Multi-Tenant Portal

Feature brief: `stages/00_ideation/output/feature_brief.md`

The brief does not fit one sprint: it requires sequential merges across three tiers
(`@beechcms/core` contracts + D1 schema → `apps/api` enforcement → `apps/api` admin
surfaces → `apps/dashboard` UI). Each boundary must be validated independently before
the next lands. Detailed Task Details exist ONLY for the sprint currently in flight.

| # | Slug | Goal (one line) | Deliverables summary | Depends on |
|---|------|-----------------|----------------------|------------|
| 1 | `RbacCorePrimitives` | Land the closed permission vocabulary, the ABAC evaluator and the D1 tables, with zero behaviour change. | `packages/core/src/rbac/*` (enum, types, pure evaluator, repository interfaces), schema folded into `migrations/0000_v040_base.sql`, D1 repositories, `Variables` wiring. No routes, no UI, no enforcement. | — (first) |
| 2 | `RbacRequestEnforcement` | Turn the evaluator into the single authorization gate on every protected request. | `permission.middleware.ts` on `apiProtected` (fail-closed route table, scope from the seed slug in the route), `shared/rbac/effective-permissions.ts` resolver, `PermissionRoleGuard` replacing `AllowAllRoleGuard` (**widening `arbitrate()` to take `EffectivePermissions` — 1 production call site, `features/oauth/authorize.ts:222`**), `is_active` refusal on login/refresh/OAuth + every gated request, **and the SuperAdmin grant at `POST /auth/setup` (see lockout warning)**. **PLANNED, detail in `output/RbacRequestEnforcement.md`.** | Sprint 1 (evaluator + tables must exist and be queryable) |
| 3 | `RbacUserRoleAdminApi` | Expose account/role/assignment administration with anti-escalation and the last-SuperAdmin guardrail. | New VSA slice `apps/api/src/features/rbac/` (accounts create/list/read/activate-deactivate, roles CRUD, assignment create/delete/list), `canGrant` enforcement, guardrail refusing revocation of the last active global admin, new `permission-any-scope` gate kind, and closure of the `is_system` guard gap in `D1RoleRepository.update()` flagged by the sprint-1 review. Route gating and `RBAC_ERRORS` follow the `features/oauth/index.ts` + `oauth/constants.ts` conventions. No migration (every table already exists). **PLANNED, detail in `output/RbacUserRoleAdminApi.md`.** | Sprint 2 (endpoints must be gated by the middleware they configure) |
| 4 | `RbacInvitations` | Invite-only onboarding: single-use expiring tokens carrying a pre-assigned role+scope. | `invitations` table, invite issue/list/regenerate/revoke inside the `rbac` slice plus an unauthenticated preview/redeem router mounted next to `passwordResetApp`, email dispatch via **`apps/api/src/shared/email` (`sendInvitationEmail`)**, activation flow setting credentials via the existing `IHashProvider`. Token handling reuses `generateOpaqueToken()` + `sha256hex()`; the repository mirrors `IPasswordResetTokenRepository`. **PLANNED, detail in `output/RbacInvitations.md`.** | Sprint 3 (an invite pre-assigns a role that must already be creatable) |
| 5 | `RbacScopedProjections` | Make every LISTING endpoint return exactly what the caller could open one by one, and emit the caller's authority. | Shared `apps/api/src/shared/rbac/scoped-projection.ts`; scope-filtered `GET /api/schema`, `GET /api/content/drafts`, `GET /api/search` (the last two move from a global `content:read` gate to `authenticated` + in-handler projection); `GET /api/settings/me` gains `permissions` + `isDeveloper`. No migration, zero dashboard files. **PLANNED, detail in `output/RbacScopedProjections.md`.** | Sprint 4 (the projection is layered on the gate and slice conventions sprints 2–4 established) |
| 6 | `RbacDashboardSurfaces` | Make the dashboard reflect exactly the caller's effective permissions. | `apps/dashboard/src/features/rbac/` (users, roles, invites screens mounted as Settings → Access tabs), the `/accept-invite` redemption page next to `ResetPasswordPage`, shared `features/shared/hooks/use-{me,permissions}.ts` (rehydrates the payload and delegates to core's `hasPermission`), permission-derived navigation (`AppSidebar` / `dashboard-menu.ts`) and settings-tab visibility (`settings-dialog.tsx`). Seed Builder visibility keys off `isDeveloper`, never off an RBAC permission. **One additive API field** (`manageableScopes` on `GET /api/settings/me`) — see the scope-picker decision below. No migration, zero core diff. **PLANNED, detail in `output/RbacDashboardSurfaces.md`.** | Sprint 5 (the UI is a projection of a payload that must exist and already be scope-correct) |
| 7 | `RbacContentActionGating` | **Disable** — never hide — per-entry content affordances the caller cannot exercise, and give the entry editor a read-only mode. | Permission-derived `disabled` state for create/edit/delete/bulk/kanban/gallery actions across `features/content-*`, `features/entry-editor`, `features/bulk-edit`, `features/drafts`, `features/automations`, driven by the sprint-6 `usePermissions()` hook; entry editor opens in view mode with a greyed Edit control when `content:update` is absent on that seed. Purely cosmetic: every one of these is already enforced server-side by `perm('content:*','capture1')` since sprint 2. Split out of sprint 6 (decided in sprint 6's planning run) because it is a wide mechanical sweep over eight slices that would make sprint 6's diff unreviewable. | Sprint 6 (`usePermissions()` and the `disabled` nav pattern must exist) |

## Ordering rationale

- Schema and vocabulary first: every later sprint reads `Permission` and the assignment
  triple. Introducing them alongside enforcement would make the enforcement diff
  unreviewable.
- Enforcement before administration: an admin API that creates roles must itself be
  protected by the gate it feeds, otherwise sprint 3 ships a privilege hole that
  sprint 2 later closes.
- Invitations after administration: an invite is a deferred assignment. It cannot
  pre-assign a role+scope that no endpoint can create yet.
- UI last: the dashboard is a projection of the effective permission set. It has no
  independent contract to validate before the API emits one.
- **Sprint 5 split (decided in sprint 5's planning run).** The original entry 5 bundled
  the API's scope-filtered projections with the dashboard screens that render them.
  Those merge sequentially — the API must emit a scope-correct listing and a permission
  payload before any UI can consume one — so they are now entries 5 and 6. Hiding
  sections client-side over an unfiltered `/api/schema` would have been a cosmetic
  filter over a leaking endpoint, which is the extra attack surface the brief (§3)
  exists to remove.

## HIDE vs DISABLE (decided with the user in sprint 6's planning run — binding on every later sprint)

Two axes, never conflated:

| Axis | Question | Treatment |
|---|---|---|
| Section / seed existence | Does this part of the product exist for you at all? | **HIDE** — no trace, no placeholder |
| Action inside a visible surface | May you act on something you can already see? | **DISABLE** + tooltip naming the missing authority |

**Hidden:** unreadable seeds (`GET /api/schema` filter), Analytics, Storage, Site, the
Access group, Content Types — each governed by a dedicated permission or by the developer
axis. This is brief §2's *"l'assenza del permesso nasconde la sezione"*, which speaks about
non-CRUD **sections**.

**Disabled:** content CRUD verbs (`content:create|update|delete`) inside a seed the caller
can already read. Those are actions within a section, not sections. A `content:read`-only
account is the brief's demo/read-only persona (§3): it must open an entry in view mode and
see that editing exists but is not theirs, rather than be left guessing whether the product
has an editor at all.

The two never collide: a caller who cannot read a seed never reaches its actions, because
the seed is gone one axis earlier. **Zero-trust stays fully hidden** — with no readable
surface there is nothing to disable an action on (brief §2, *"nessuna visibilità né potere,
sempre"*).

## The scope-picker gap (decided in sprint 6's VETO audit §4 — binding)

Sprint 5 filtered `GET /api/schema` by **`content:read`**, so it cannot be the source for
an assignment/invitation scope picker: a `manage_users` holder need not hold `content:read`
on the seeds they administer, and a **global** `manage_users` holder whose role carries no
`content:read` receives `[]` — leaving the admin screens structurally unusable for exactly
the narrow-admin persona anti-escalation exists to support. `permissions.byScope` cannot
substitute either (a global holder's `byScope` is empty).

**Decided:** `GET /api/settings/me` emits an additive `manageableScopes: string[]`,
computed by a new pure `manageableScopes()` in the existing
`apps/api/src/shared/rbac/scoped-projection.ts`. Global holder ⇒ `'*'` + every seed slug;
scoped holder ⇒ own `manage_users` scopes, never `'*'`; nobody else ⇒ `[]`.
Rejected: widening `/api/schema`'s filter (would leak seed schemas to non-readers, breaking
sprint 5's visibility floor) and a new `GET /api/rbac/scopes` route (a route and a round
trip for an array derivable inside a payload the screen already fetches).

## Scope refinements refused permanently (sprint 5 VETO audit §6)

`/api/upload*`, `/api/automations*` and `/api/dashboard-layout` writes stay **global-only**.
This is a decision, not deferred debt, and no sprint inherits it:
- R2 media carries no seed ownership column; partitioning it is a data-model feature.
- An automation rule is cross-seed by construction (trigger seed ≠ action seed).
- `dashboard-layout` is one global document per installation.

`/api/content/stats/*` and `/api/settings/{activity,storage}` likewise stay
`view_analytics` at `'*'`.

## The developer axis (decided in sprint 2's VETO audit — binding on every later sprint)

`manage_seeds` does not exist and must never exist (brief §2), so **no RBAC permission may gate
`/api/seeds/*` or `/api/schema/:slug/layout`**. Sprint 2 therefore classes those routes `legacy-admin`
in its permission table: the gate requires authentication and defers to the in-slice
`requireAdmin()` / `requireLayoutEditPermission()`, which read `users.role === 'admin'`.

That keeps `users.role` alive **as the developer/owner axis** — orthogonal to RBAC, not a rung above
it.

**DECIDED in sprint 3's VETO audit §5 — binding, supersedes the earlier "drop it in sprint 3" note:
`users.role` is RETAINED PERMANENTLY.** Dropping it would leave `/api/seeds/*` and
`/api/schema/:slug/layout` with no gate at all, since no RBAC permission may ever cover them
(`manage_seeds` does not exist). No sprint in this feature inherits its removal;
`requireAdmin()` and `requireLayoutEditPermission()` stay as they are.

The one hardening sprint 3 does add on this axis: accounts created through `POST /api/rbac/users`
are always minted `users.role = 'editor'`. `POST /auth/setup` stays the sole producer of
`role = 'admin'`, so no dashboard path at any privilege level can mint an account that clears
`requireAdmin()`.

## Migration policy for this feature (beta)

The project is in beta and the database is disposable. **Schema changes are folded into
`apps/api/migrations/0000_v040_base.sql`, not added as new numbered migrations.** This
supersedes the "never edit an already-applied migration" rule still written in
`_config/database_workflow.md` — that file should be updated so the next planning stage
does not re-derive the old rule.

Consequences for every sprint here:
- `pnpm beech db:migrate` is a no-op against an edited `0000`. **`pnpm beech db:reset`
  is the only command that applies the change** — locally and in any deployed
  environment.
- Column changes are edits to the existing `CREATE TABLE`, never `ALTER TABLE`.
- Data backfills against pre-existing rows are meaningless: `0000` runs on an empty
  database. Anything a live account needs must be granted at runtime.
- Dropping a column (e.g. the legacy `users.role` in sprint 2) is just an edit plus a
  reset. No down-migration, no deprecation window.

> **Lockout warning.** `user_role_assignments` ships empty. When enforcement lands in
> sprint 2, nobody holds any permission until `POST /auth/setup` grants `SuperAdmin` at
> `'*'` to the account it creates. That grant MUST ship in the same PR as the gate.

## Reuse mandate (applies to every sprint)

The identity tier already exists. No sprint in this feature may re-implement any of it:

- **Entropy / bearer credentials** — `generateOpaqueToken()`
  (`apps/api/src/shared/utils/opaque-token.ts`) is the single CSPRNG source for every
  bearer credential in the API, by its own explicit contract. Invitation tokens go
  through it. No second helper, ever.
- **Hashing at rest** — `sha256hex()` (`packages/core/src/engine/policies.ts`). Every
  token table stores hash-only, like `oauth_tokens`, `refresh_tokens` and
  `password_reset_tokens` already do.
- **Password hashing** — the existing `IHashProvider` (`apps/api/src/auth/providers/`).
- **Outbound email** — `apps/api/src/shared/email` (its `index.ts` is the only importable
  entry point; one `templates/<name>.ts` + one `send<Name>Email()` per message, dispatched
  through `executionCtx.waitUntil`). **Corrected in sprint 4's pre-computation: NOT
  `INotificationService`** (`packages/core/src/notifications/notification-service.ts`,
  degree 2, zero API call sites) — that interface backs in-dashboard notification rows,
  not email.
- **Single-use expiring token repository** — mirror `IPasswordResetTokenRepository`
  (`invalidatePending` / `create` / `findValidByHashWithEmail` / `markUsed`) and the
  `password_reset_tokens` DDL. It is already the invitation lifecycle.
- **Ids** — `IIdGenerator.uuid()`; validate with `isValid()`, never an inline regex.
- **Role arbitration** — extend the existing `IRoleGuard` seam
  (`packages/core/src/oauth/role-guard.ts`). Do not add a parallel authorization seam.
- **Slice conventions** — per-route gating as in `features/oauth/index.ts` (note:
  admin surfaces use bare `authMiddleware()`, never `acceptOAuth: true`), and a frozen
  error-code map per slice as in `auth/constants.ts` / `oauth/constants.ts`.
- **Test-user authority** — `seedTestUsers()` (`apps/api/test/helpers/seed-fixtures.ts`) is the single
  choke point through which all 19 authenticated suites hydrate users (`graphify affected
  "seedTestUsers" --depth 1`). Sprint 2 makes it grant `SuperAdmin` at `'*'` for `role === 'admin'`.
  Later sprints seed narrower authority through the same helper (`grantSuperAdmin: false` plus
  hand-built assignments) — never by adding a second seeding path, and never by weakening production
  code to keep a test green.
- **Test doubles** — `apps/api/src/auth/__fixtures__/` (`in-memory-hash-provider.ts`,
  `static-token-service.ts`), `shared/services/id-generator/sequential-id-generator.ts`,
  `shared/services/clock/fixed-clock.ts`, `test/mocks/` — instead of new ad-hoc doubles.
- **Database-backed tests** — `D1TestDatabase` (`test/helpers/d1-test-database.ts`)
  runs real SQLite with every numbered migration applied. Any test asserting SQL
  behaviour uses it; mocked `prepare`/`bind` stubs cannot verify a query.
- **Repository base class** — `BaseD1Repository` is content-tier
  (`getTableName` → `content_{slug}`, `SlugConflictError` mapping). System-table
  repositories do not extend it; RBAC repositories follow that split.
- **Migrations are globally applied in tests** — `D1TestDatabase` picks up every
  `^\d{4}_.+\.sql$` file, so a broken migration in any RBAC sprint fails the whole
  suite, not just its own specs.

## Sprint 7 — `RbacContentActionGating` Pre-Exploration & Architectural Fact-Sheet
*(BINDING FOR PLANNING & EXECUTION: Do NOT re-explore or re-audit these points; they are verified ground truth.)*

> [!NOTE]
> **To the AI Planner/Agent:** The codebase sweep for Sprint 7 has already been performed in detail.
> Do NOT spend time re-investigating whether view mode exists, searching how tooltips are rendered, or locating button call sites.
> Everything below reflects the exact verified state of the code.

### 1. The Entry Editor Read-Only Mode (Already 95% Built)
- **Props & State**: `EntryEditorDialogProps` already declares `readonly?: boolean` (`entry-editor-dialog.tsx:13`). `useEntryEditorDialog` (`use-entry-editor-dialog.tsx:216`) already initializes `const [isReadOnly, setIsReadOnly] = React.useState(readonly ?? false)` and exposes both to `SchemaFormViewModel`.
- **Field Disabling**: `LayoutRenderer` (`layout-renderer.tsx:103`) wraps all form fields in `<fieldset disabled={isReadOnly} className="contents">`, which natively and recursively disables all native controls, inputs, textareas, and selects. It also passes `isReadOnly` down to each widget in `layout-elements.tsx:115-116`.
- **Action Buttons Hidden**: `SchemaFormShell` (`schema-form-shell.tsx:277`) already hides Save, Publish, Discard, and Delete buttons when `vm.isReadOnly` is true (`{activeTabId !== "__danger_zone__" && !vm.isReadOnly && (...) }`).
- **The ONLY 2 things Sprint 7 needs to do in Entry Editor**:
  1. In `pages/content-list.tsx:1051`, pass `readonly={!canUpdate}` where `canUpdate = hasPermission('content:update', target.schemaSlug)`.
  2. In `schema-form-shell.tsx:165`, the `Pencil` icon button (which switches readonly back to edit mode via `vm.setIsReadOnly(false)`): when `!canUpdate`, render it `disabled` with a Radix Tooltip explaining that `content:update` is missing, rather than allowing the edit toggle.

### 2. Gating Points Across the Remaining Slices
All actions inside visible surfaces follow the **DISABLE + Tooltip** rule (never hide):

1. **`features/content-toolbar`**:
   - `+ Nuova Voce` (`content-toolbar.tsx:276-285`, `Button variant="default"` with `Plus` icon): if `!canCreate` (`content:create` on seed), render `disabled` wrapped in Tooltip.
   - Empty State CTA (`content-list.tsx:814`, "Crea il primo contenuto"): `disabled` with Tooltip if `!canCreate`.

2. **`features/content-management` / Table (`apps/dashboard/src/lib/dynamic-columns.tsx` & `content-list.tsx`)**:
   - Single row dropdown menu (`dynamic-columns.tsx:370, 377`): `Modifica` disabled if `!canUpdate`; `Elimina` disabled if `!canDelete`.
   - Bulk action dropdown menu (`dynamic-columns.tsx:345, 350`): `Modifica massiva` disabled if `!canUpdate`; `Elimina selezione` disabled if `!canDelete`.
   - Row ContextMenu (`content-list.tsx:785-793`): `Edit` disabled if `!canUpdate`; `Delete` disabled if `!canDelete`.

3. **`features/content-gallery`**:
   - `gallery-peek-panel.tsx:183` (`Modifica` button with `Pencil` icon): `disabled` with Tooltip if `!canUpdate`.
   - Card click opens `EntryEditorDialog` with `readonly={!canUpdate}`, letting read-only users inspect the card without editing.

4. **`features/content-kanban`**:
   - Card Drag & Drop: in `kanban-column-virtualizer.tsx:29`, pass `disabled: !canUpdate` to `useSortable({ id: model.entryId, disabled: !canUpdate })` to lock drag interaction natively.
   - Column `+` button in `kanban-column.tsx:77` & empty column CTA (line 103): `disabled` with Tooltip if `!canCreate`.

5. **`features/bulk-edit`**:
   - Dialog triggers disabled if `!canUpdate`.

6. **`features/drafts` (`pages/drafts-list.tsx`)**:
   - Row actions (`drafts-list.tsx:141-161`): `Pubblica bozza` disabled if `!canUpdate`; `Scarta bozza` disabled if `!canDelete` (or `content:update`).
   - Seed Picker dialog for new draft (`drafts-list.tsx:447`): buttons for seeds lacking `content:create` disabled with Tooltip.

7. **`features/automations` (`features/automations`)**:
   - API middleware (`permission.middleware.ts:137-141`) requires global `content:update` / `content:delete` at `'*'`.
   - In UI: trigger toggles, create rule, and delete rule disabled if user lacks global authority.

8. **`features/content-delete-dialog`**:
   - Confirm button disabled if `!canDelete`.

### 3. Established Radix Tooltip Pattern for Disabled Buttons
Native HTML `<button disabled>` suppresses pointer events in standard browsers. To ensure tooltips display reliably on disabled buttons, use the established pattern in `schema-form-shell.tsx:283`:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span className="inline-flex">
      <Button disabled ...>
        ...
      </Button>
    </span>
  </TooltipTrigger>
  <TooltipContent side="bottom">
    Manca il permesso '{requiredPermission}'
  </TooltipContent>
</Tooltip>
```

