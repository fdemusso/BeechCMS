# Sprint Plan — `RbacDashboardSurfaces` (roadmap entry 6, final sprint of the feature)

Feature brief: `stages/00_ideation/output/feature_brief.md`
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`
Predecessor: `docs/Sprints/RbacScopedProjections/` (entry 5, merged — `372e8d8`)

---

### Pre-Computation Analysis

**a) God Nodes identified via the graphify CLI**

| Node | Degree / blast radius | Why it is a god node here |
|---|---|---|
| `AppSidebar` (`apps/dashboard/src/features/navigation/components/app-sidebar.tsx:27`) | degree 18 | `graphify explain "AppSidebar"` — imported by **9 page/feature roots** (`content-list`, `drafts-list`, `widget-lab`, `dashboard-page`, `test-fields`, `settings-page`, `analytics`, `create-new`, `scheduled`) and re-exported by `navigation/index.ts`. It calls `useAuth()`, `useProfile()`, `useSchema()`, `buildContentMenu()`, `getStaticMenu()`, `getContentCategoryMenu()`, `getSettingsMenu()`. **Every navigation visibility rule lands here or in the four builders it calls.** |
| `useProfile()` (`features/settings/hooks/use-settings.ts:37`) | `graphify affected "useProfile" --depth 2` → 18 nodes | The single existing consumer of `GET /api/settings/me`, i.e. of the sprint-5 `permissions` / `isDeveloper` payload. Reached transitively by every page (through `AppSidebar`) and by `ProfileTab`. Any change to its query key or shape ripples app-wide. |
| `getStaticMenu()` (`config/dashboard-menu.ts:33`) | `graphify affected "getStaticMenu" --depth 2` → 12 nodes | Same 9 page roots + `AppSidebar`. Signature change is a 1-call-site edit (`app-sidebar.tsx:75`) but a 12-node typecheck surface. |
| `SettingsDialog` (`features/settings/components/settings-dialog.tsx`) | `graphify affected "SettingsDialog" --depth 2` → 6 nodes (`settings-page.tsx`, `settings/index.ts`, its own test, `App.tsx`) | The app's **tab composition root**: it already imports two foreign slice barrels (`@/features/seed-builder`, `@/features/oauth-consent`) and owns the `SettingsTab` switch. The three RBAC admin screens mount here. |
| `PROTECTED_ROUTES` (`apps/api/src/middleware/permission.middleware.ts:70`) | the closed allowlist for every `/api/*` route | Not modified this sprint, but it is the **authority** the UI mirrors. Every visibility rule below is quoted from a row of this table, never invented. |

**b) Exact architectural boundaries affected**

- `@beechcms/core` — **consumed, not modified. Zero diff.** The dashboard imports `hasPermission`, `hasPermissionAnywhere`, `GLOBAL_SCOPE`, `PERMISSIONS` and the types `Permission`, `Scope`, `EffectivePermissions`, `RoleRecord`, `PermissionAssignment`, `AccountSummary` from the package root (`packages/core/src/index.ts:42-45` re-exports `rbac/*`). Value imports from `@beechcms/core` are already routine in the dashboard (`features/bulk-edit/bulk-edit-dialog.tsx:7`, `features/navigation/components/site-header.tsx:9`, `features/entry-editor/**`), and `@beechcms/core: workspace:^0.8.0` is a declared dependency of `apps/dashboard/package.json:18`. **The authorization decision function is core's, never re-implemented client-side.**
- `apps/api` — **one field on one existing endpoint plus one pure helper.** `GET /api/settings/me` gains `manageableScopes`; `shared/rbac/scoped-projection.ts` gains `manageableScopes()`. No new route, no new middleware row, no repository, no SQL, no migration. Rationale in VETO Audit §4 — this closes a real hole opened by sprint 5's projection, not a convenience.
- `apps/dashboard` — the sprint's real body: one new VSA slice `features/rbac/`, two new shared hooks in `features/shared/`, one unauthenticated page, and permission gating inside `config/dashboard-menu.ts`, `app-sidebar.tsx`, `settings-dialog.tsx`.
- `apps/api/migrations` — **zero diff.** Every table this feature needs already ships in `0000_v040_base.sql`.

**c) `graphify affected` impact analysis (breaking-change proof)**

```
$ graphify affected "useProfile" --depth 2
- AppSidebar [calls]            app-sidebar.tsx:L31
- ProfileTab() [calls]          settings/components/profile-tab.tsx:L29
- settings/index.ts [re_exports] settings/index.ts:L7
+ 15 transitive page/import nodes (dashboard-page, settings-page, analytics,
  content-list, create-new, drafts-list, scheduled, test-fields, widget-lab,
  navigation/index.ts, settings-dialog.tsx, App.tsx, action-selector.tsx)

$ graphify affected "getStaticMenu" --depth 2
- AppSidebar [calls]            app-sidebar.tsx:L75
+ 11 transitive import nodes (same 9 page roots + navigation/index.ts + app-sidebar.tsx)

$ graphify affected "SettingsDialog" --depth 2
- settings-dialog.test.tsx, settings-page.tsx, settings/index.ts, App.tsx,
  action-selector.tsx, app-sidebar.tsx   (6 nodes)

$ graphify affected "useSchema" --depth 1
No affected nodes found.   (name is re-exported from two barrels — resolved by hand:
  consumers import `useSchema` from `@/features/shared` or `@/features/schema`;
  its wire shape is UNCHANGED this sprint, so the empty result is not load-bearing.)
```

**Breaking-change verdict.** Exactly **two** signature changes are proposed, both with a bounded, enumerated call-site set:

1. `useProfile()` — **return type widens only** (the `MeResponse` it now delegates to is a superset of today's `UserProfile`). Its two call sites (`AppSidebar:31`, `ProfileTab:29`) read `name`, `surname`, `email`, `avatarUrl`, `notificationPrefs` — all preserved verbatim. Non-breaking.
2. `getStaticMenu(t)` / `getContentCategoryMenu(t)` — gain a second parameter. **One call site each**, both inside `AppSidebar` (`app-sidebar.tsx:75`, `:76`). The other 11 affected nodes only *import `AppSidebar`* and are untouched. Bounded.

`buildContentMenu()` and `getSettingsMenu()` are **not** touched: content groups are already scope-correct because they are built from `useSchema()`, whose `GET /api/schema` sprint 5 made scope-filtered (`schema.handler.ts` → `filterSeedsByPermission(registry.all(), effective, 'content:read')`), and Settings is `AUTHED` for everyone.

---

### VETO Audit

**§1 — Botanical Invariant (no D1 bypass).** PASS, trivially. `apps/dashboard` contains no database client and issues no SQL; it speaks to `apps/api` over `axios` (`lib/api.ts`, `baseURL: '/api'`). The one API-side change (`manageableScopes`) is a **pure function over `EffectivePermissions` + `seedRegistry.all()`** — an in-memory registry read that `schema.handler.ts:GET /` already performs, not a query. No hardcoded field names, no branch-id handling anywhere in this sprint (RBAC tables are system tables, never `content_{slug}`; `BaseD1Repository` is deliberately not involved — that split was fixed in sprint 1).

**§2 — VSA enforcement (zero cross-slice imports).** PASS, with one pattern explicitly ratified:

- New slice `apps/dashboard/src/features/rbac/` imports only `@/lib/*`, `@/components/ui/*`, `@/features/shared`, `@beechcms/core`, and its own files. **It imports no other feature slice**, and no other slice imports it except the composition root (below).
- `settings-dialog.tsx` will import `@/features/rbac`. This is the **pre-existing composition-root pattern**, not a new violation: the same file already imports `@/features/seed-builder` (`:33`) and `@/features/oauth-consent` (`:34`) for exactly the same reason — it is the app's tab host, the settings equivalent of `App.tsx`. The import is **one-directional**: `features/rbac` must never import `@/features/settings`. Enforced by an acceptance-criteria grep.
- Shared logic goes to `features/shared/`, which exists for this purpose and says so (`features/shared/query-keys.ts`: *"Lives in `features/shared` so no slice has to import from another"*). `use-permissions.ts` joins `use-schema.ts` there — same shape, same rationale.
- The `useProfile` → `useMe` delegation makes `features/settings` depend on `features/shared`. Allowed and already true (`app-sidebar.tsx:16`, `drafts-list.tsx:53`).
- **Rejected alternative:** giving `features/shared` its own second fetch of `/settings/me` alongside `useProfile`'s. Two cache entries for one endpoint, guaranteed to drift. The single-key delegation costs one edited function.

**§3 — Cloudflare purity.** PASS. No worker code added, no background job, no ORM, no migration, no non-deterministic schema change. The dashboard is static assets; the API delta is one JSON field computed in-request.

**§4 — YAGNI arbitration on the one API change (`manageableScopes`).**

*The problem, found during pre-computation:* the scope picker in the assignment/invitation dialogs must offer the scopes the caller may grant on. The obvious source is `useSchema()` — but sprint 5 filtered `GET /api/schema` by **`content:read`**. An account holding `manage_users` at `'*'` through a role that carries **no** `content:read` therefore receives `[]` from `/api/schema` and **cannot assign any seed scope at all**. The admin screens would ship structurally unusable for exactly the narrow-admin persona the anti-escalation model (brief §2, §4) exists to support. SuperAdmin masks the bug because it holds every permission.

*Options weighed:*
- **Widen `/api/schema`'s filter** → VETOED. It would hand seed schemas to a non-reader; `content:read` as the visibility floor is sprint 5's ratified invariant.
- **Client-side guess from `permissions.byScope` keys** → VETOED. `byScope` only lists scopes the caller was *assigned* on; a global `manage_users` holder has an empty `byScope` and would still see nothing.
- **A new `GET /api/rbac/scopes` endpoint** → VETOED. A new route, a new `PROTECTED_ROUTES` row, a new round trip, for one array already derivable inside a payload the screen fetches anyway.
- **One additive field on `/api/settings/me`** → **APPROVED.** It is the endpoint that already exists to emit "who am I and what may I do" (sprint 5), it is already `AUTHED`, the value is a pure fold over data in memory, and the leak surface is exactly correct: a caller without `manage_users` anywhere gets `[]` and learns nothing, a scoped holder learns only their own scopes, a global holder learns the slug list they are by definition entitled to administer.

Ruling: **necessary, minimal, additive, zero-migration. Approved.** Recorded in `ROADMAP.md` so it is not re-litigated downstream.

**§5 — The developer axis, re-confirmed.** `manage_seeds` is not added and is not referenced. The Seed Builder tab (`content-types`) is gated on **`isDeveloper` (`users.role === 'admin'`) and on nothing else**, matching `PROTECTED_ROUTES`' `LEGACY_ADMIN` rows for `/api/seeds/*` and `/api/schema/:slug/layout`. Any attempt to gate it on an RBAC permission is a sprint failure, not a refinement.

**§6 — Fail-closed default in the UI.** While `/settings/me` is in flight, `usePermissions()` returns an empty `EffectivePermissions`, so **every gated surface is hidden**. A surface may only appear after authority is proven, never before. This also removes the "render then retract" flicker that would otherwise leak the existence of surfaces to unauthorized users for one frame.

**§7 — Scope discipline.** Client-side hiding is **cosmetic by construction** and this sprint claims nothing else: every rule below mirrors a `PROTECTED_ROUTES` row that already enforces it server-side (fail-closed since sprint 2). The UI is a projection of the gate, never a substitute for it. Per-entry content-action affordances inside the content slices are deliberately **not** in this sprint — see SECTION 7 and new roadmap entry 7.

**§8 — HIDE vs DISABLE (decided with the user during this planning run — binding on entry 7 too).**

Two distinct axes, never conflated:

| Axis | Question | Treatment |
|---|---|---|
| **Section / seed existence** | *Does this part of the product exist for you at all?* | **HIDE.** No trace, no placeholder. |
| **Action inside a visible surface** | *May you act on something you can already see?* | **DISABLE** + tooltip naming the missing authority. |

Hidden by the first axis: seeds you cannot read (`GET /api/schema` filter, sprint 5),
Analytics, Storage, Site, the Access group, Content Types — each governed by a **dedicated
permission or the developer axis**. This is brief §2's *"l'assenza del permesso nasconde la
sezione, senza eccezioni di default"*, which speaks about non-CRUD **sections**.

Disabled by the second axis: content CRUD verbs (`content:create|update|delete`) inside a
seed the caller can already read. These are not sections; they are actions within one. A
`content:read`-only account is the brief's **demo/sola-visualizzazione persona** (§3): it
should open an entry in view mode and see that editing exists but is not theirs — not be
left guessing whether the product has an editor at all.

No conflict between the two: a caller who cannot read a seed never reaches its actions,
because the seed itself is gone one axis earlier.

**Zero-trust stays hidden.** An account with a given content permission *nowhere* falls
back to axis one: nothing to disable, because there is no readable surface to disable it
on. Brief §2 — *"nessuna visibilità né potere, sempre"*.

Applied in this sprint at T15/T16 (sidebar **Create New**: disabled when the caller can
read something but create nothing; hidden when they can read nothing). Entry 7 inherits
the rule for in-page buttons.

**HANDOFF -> caveman_coder**

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

It does not exist first — it exists **last**, and that ordering is the point.

The dashboard is a *projection* of the caller's effective permission set. It has no
authorization contract of its own to validate: every rule it renders is already decided
and enforced by `permissionMiddleware()` (sprint 2) and by the in-handler scope
projections (sprint 5). Had this sprint landed earlier, it would have been hiding
sections over endpoints that still returned everything to everyone — a cosmetic filter
over a leaking API, which is precisely the "superficie d'attacco extra" the brief (§3)
exists to remove. Sprint 5's split of the original entry 5 into "API projection" then
"UI surfaces" was made for this reason and is honoured here.

Three invariants govern the work:

1. **The API is the authority; the UI mirrors it.** Every visibility rule in SECTION 4
   cites the `PROTECTED_ROUTES` row that enforces it. Nothing is hidden on a rule the
   server does not already apply, and nothing gated server-side is left visible.
2. **The decision function is `@beechcms/core`'s.** The dashboard rehydrates the wire
   payload into `EffectivePermissions` and calls `hasPermission()` / `hasPermissionAnywhere()`
   — the same functions `permissionMiddleware` calls. A second, client-local
   interpretation of the additive scope model would be a parallel authorization seam,
   which the reuse mandate forbids.
3. **Zero-trust while unknown.** No permission payload ⇒ no surface.

VSA adherence: the three admin screens land in **one new slice**, `features/rbac/`, which
owns its api client, hooks, types, components and barrel, and imports no sibling slice.
Cross-cutting permission logic lands in `features/shared/`, the designated home for
exactly that (its `query-keys.ts` header states the rule). The only slice-to-slice edge
added is `settings-dialog.tsx → @/features/rbac`, from the tab composition root, which
already holds two identical edges.

Botanical adherence: no D1 access is added on any tier; the one API-side helper is a pure
fold over `EffectivePermissions` and the in-memory `seedRegistry`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Payload available to the dashboard today** — `apps/api/src/features/settings/settings.handler.ts:117-161`, `GET /api/settings/me` (`{ kind: 'authenticated' }`):

```jsonc
{
  "id": "...", "email": "...", "name": null, "surname": null, "avatarUrl": "...",
  "notificationPrefs": { "contentCreate": true, "contentUpdate": true,
                         "contentDelete": true, "mediaUpload": false },
  "permissions": {                       // serializeEffectivePermissions(), sorted
    "global":  ["content:read", "manage_users"],
    "byScope": { "articles": ["content:update"] }
  },
  "isDeveloper": true                    // users.role === 'admin'
}
```

`permissions` is the **raw** authority — global and scoped kept apart, never pre-flattened
(`shared/rbac/scoped-projection.ts`, `serializeEffectivePermissions` doc-comment): a
scoped grant never satisfies `'*'`, and flattening would destroy that asymmetry.

**Authority table the UI must mirror** — `apps/api/src/middleware/permission.middleware.ts:70-181` (`PROTECTED_ROUTES`, first match wins, fail-closed). Rows relevant to this sprint:

| Surface | Route(s) | Requirement |
|---|---|---|
| Analytics page | `GET /api/content/stats/*`, `POST /api/content/stats/storage/sync` | `perm('view_analytics', 'global')` |
| Settings → Storage tab | `GET /api/settings/storage` | `perm('view_analytics', 'global')` |
| Settings → Site (general) tab | `GET /api/settings` → `AUTHED`; `PUT /api/settings` | `perm('manage_users', 'global')` |
| Settings → Content Types (Seed Builder) | `/api/seeds/*`, `PUT|DELETE /api/schema/:slug/layout` | `LEGACY_ADMIN` (`users.role === 'admin'`) |
| Settings → Profile / Security / Notifications / Connected apps | `/api/settings/{me,profile,password,avatar,sessions,notifications}` | `AUTHED` |
| Sidebar → content groups | `GET /api/schema` | `AUTHED`, **already scope-filtered in-handler** by `content:read` |
| Drafts page | `GET /api/content/drafts` | `AUTHED`, in-handler projection |
| Users / Invitations screens | `/api/rbac/users*`, `/api/rbac/assignments*`, `/api/rbac/invitations*` | `anyScope('manage_users')` |
| Roles screen | `GET /api/rbac/roles` | `anyScope('manage_users','manage_roles')`; write rows `anyScope('manage_roles')` |

**Dashboard structure (verified by `graphify explain "AppSidebar"` + direct reads):**

- `src/App.tsx` — `createBrowserRouter([...], { basename: '/admin' })`. Unauthenticated routes `/login`, `/setup`, `/forgot-password`, `/reset-password` sit as siblings of the `ProtectedRoute`-wrapped ones under a single `RootLayout`. `AuthProvider` wraps everything; `useAuth()` exposes `{ status, user, needsSetup, ... }` where `user` is decoded from the JWT — **it carries `role`, not permissions**, and must not become a permission source.
- `src/features/navigation/components/app-sidebar.tsx:27` — calls `useAuth()`, `useProfile()`, `useSchema()`; renders `getStaticMenu(t)` (`:75`), `getContentCategoryMenu(t)` (`:76`), `buildContentMenu(seeds, …)` (`:46`), `getSettingsMenu(t)` (`:89`).
- `src/config/dashboard-menu.ts` — pure builders returning `NavItem[]` / `NavGroup[]`. `getStaticMenu` = Dashboard + Analytics; `getContentCategoryMenu` = Create New + Drafts + Scheduled; `buildContentMenu` folds seeds by `dashboard.group`.
- `src/features/settings/components/settings-dialog.tsx` — three hardcoded `SettingsGroup`s (`account`, `system`, `models`) and a `TabContent` switch over `SettingsTab`. Already imports `@/features/seed-builder` and `@/features/oauth-consent`.
- `src/features/settings/hooks/use-settings.ts:37` — `useProfile()`, key `SETTINGS_QUERY_KEYS.profile()` = `['settings','profile']`, `staleTime: 5min`.
- `src/features/shared/` — `hooks/use-schema.ts` (fetch + `registerSeeds()`), `query-keys.ts`, `view-registry.ts`, barrel `index.ts`.
- `src/pages/reset-password/ResetPasswordPage.tsx` — the template for the redemption page: reads `token` from `useSearchParams()`, renders an invalid-link card when absent, posts with bare `axios` (**not** the `api` instance — no `/api` prefix, no bearer), `toast` + `navigate('/login')` on success.
- **Placeholder pages:** `pages/analytics.tsx`, `pages/scheduled.tsx`, `pages/create-new.tsx` render static copy and fetch nothing. Gating them is a pure navigation concern this sprint; they acquire no data dependency here.
- Tests: colocated `*.test.tsx` inside slices (`features/oauth-consent/**`, `features/settings/components/settings-dialog.test.tsx`) plus `src/test/**` for pages/lib. Runner: `vitest run` (`apps/dashboard/vitest.config.ts`), `@testing-library/react`, setup in `src/test/setup.ts`.

**Slice template to copy** — `features/oauth-consent/`: `api/*.ts(+.test)`, `components/*.tsx(+.test)`, `hooks/*.ts`, `pages/*.tsx(+.test)`, `types/*.ts`, `index.ts`.

**RBAC wire contracts already shipped** (sprints 3–4, read from the handlers):

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/rbac/users` | — | `{ users: (AccountSummary & { assignments: PermissionAssignment[] })[] }` |
| `POST /api/rbac/users` | `{ email, password, name?, surname? }` | `201 { id, email, name, surname, role:'editor', isActive:true, assignments: [] }` |
| `GET /api/rbac/users/:id` | — | `AccountSummary & { assignments }`, `404` when unadministrable |
| `PATCH /api/rbac/users/:id/active` | `{ isActive: boolean }` | `{ id, isActive }` |
| `GET /api/rbac/users/:id/assignments` | — | `{ assignments: (PermissionAssignment & { active: boolean; roleName: string\|null; permissions: Permission[] })[] }` |
| `POST /api/rbac/assignments` | `{ userId, roleId, scope }` | `201 { id, userId, roleId, scope }` (idempotent) |
| `DELETE /api/rbac/assignments/:id` | — | `204` |
| `GET /api/rbac/roles` | — | `{ roles: RoleRecord[] }` (system roles included) |
| `POST /api/rbac/roles` | `{ name, description?, permissions: Permission[] }` (min 1) | `201 { id }` |
| `PUT /api/rbac/roles/:id` | same | `{ id }` |
| `DELETE /api/rbac/roles/:id` | — | `204` |
| `GET /api/rbac/invitations` | — | `{ invitations: { id, email, roleId, roleName, scope, invitedBy, expiresAt, createdAt, status: 'pending'\|'accepted'\|'expired' }[] }` |
| `POST /api/rbac/invitations` | `{ email, roleId, scope, locale? }` | `201 { id, email, roleId, scope, expiresAt }` — **token is emailed, never returned** |
| `POST /api/rbac/invitations/:id/regenerate` | — | `{ id, expiresAt }` — token emailed |
| `DELETE /api/rbac/invitations/:id` | — | `204` |
| `GET /auth/invitations/:token` (public) | — | `{ email, roleName, scope }`, `404` `invitation-invalid` |
| `POST /auth/invitations/accept` (public) | `{ token, password, name?, surname? }` | success ⇒ log in via `POST /auth/login` |

Errors are RFC 9457 (`apps/api/src/public/problem-details.ts:111`): `{ type: "https://beechcms.dev/problems/<code>", title, status, detail, instance }`. Codes come from `RBAC_ERRORS` (`apps/api/src/features/rbac/constants.ts`) — a **frozen** map, never renamed.

Invitation link built by the API: `` `${baseUrl}/admin/accept-invite?token=<opaque hex>` `` (`apps/api/src/features/rbac/invitations.ts:28`). **The dashboard route must be exactly `/accept-invite` under the `/admin` basename.**

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**A. `apps/api` — 2 files modified, 2 test files extended (no new route, no migration)**

| File | Change |
|---|---|
| `apps/api/src/shared/rbac/scoped-projection.ts` | **MODIFY** — add exported pure function `manageableScopes()`. |
| `apps/api/src/features/settings/settings.handler.ts` | **MODIFY** — `GET /me` emits `manageableScopes`. |
| `apps/api/src/shared/rbac/scoped-projection.test.ts` | **MODIFY** — cases for the new helper. |
| `apps/api/src/features/settings/__tests__/settings.handler.test.ts` | **MODIFY** — assert the new field. |
| `apps/api/test/flow-rbac-projections.test.ts` | **MODIFY** — one step asserting `manageableScopes` for global / scoped / zero-trust callers. |

**B. `apps/dashboard` — shared permission layer (3 files)**

| File | Change |
|---|---|
| `src/features/shared/hooks/use-me.ts` | **NEW** — `ME_QUERY_KEY`, `MeResponse`, `useMe()`. Single owner of `GET /settings/me`. |
| `src/features/shared/hooks/use-permissions.ts` | **NEW** — `hydrateEffectivePermissions()`, `usePermissions()`. |
| `src/features/shared/index.ts` | **MODIFY** — export both. |

**C. `apps/dashboard` — new VSA slice `src/features/rbac/` (all NEW)**

```
features/rbac/
  api/rbac.api.ts              # axios client for /api/rbac/*
  api/rbac.api.test.ts
  constants.ts                 # RBAC_ERROR_CODES mirror + rbacErrorCode() parser
  types/rbac.types.ts          # wire types, built on @beechcms/core types
  hooks/use-rbac.ts            # RBAC_QUERY_KEYS + query/mutation hooks
  components/users-tab.tsx           (+ .test.tsx)
  components/user-form-dialog.tsx
  components/assignments-dialog.tsx  (+ .test.tsx)
  components/roles-tab.tsx           (+ .test.tsx)
  components/role-form-dialog.tsx
  components/invitations-tab.tsx     (+ .test.tsx)
  components/invite-dialog.tsx
  components/scope-select.tsx        # shared inside the slice only
  index.ts
```

**D. `apps/dashboard` — permission-derived chrome (4 files modified)**

| File | Change |
|---|---|
| `src/config/dashboard-menu.ts` | **MODIFY** — `getStaticMenu(t, gates)`, `getContentCategoryMenu(t, gates)`; new `MenuGates` type; `NavItem` gains `disabled` / `disabledReason`. |
| `src/components/nav-main.tsx` | **MODIFY** — render a disabled nav item (greyed, tooltip, no `<Link>`). |
| `src/features/navigation/components/app-sidebar.tsx` | **MODIFY** — call `usePermissions()`, build and pass `MenuGates`. |
| `src/features/settings/components/settings-dialog.tsx` | **MODIFY** — new `access` group (Users / Roles / Invitations), per-item + per-group permission filter, `content-types` gated on `isDeveloper`. |
| `src/features/settings/types/settings.types.ts` | **MODIFY** — widen `SettingsTab` with `'users' \| 'roles' \| 'invitations'`. |

**E. `apps/dashboard` — invitation redemption (2 files, 1 modified)**

| File | Change |
|---|---|
| `src/pages/accept-invite/AcceptInvitePage.tsx` | **NEW** — unauthenticated preview + activation. |
| `src/App.tsx` | **MODIFY** — route `/accept-invite`, sibling of `/reset-password`. |

**F. `apps/dashboard` — settings delegation + i18n + tests**

| File | Change |
|---|---|
| `src/features/settings/hooks/use-settings.ts` | **MODIFY** — `useProfile()` delegates to `useMe()`; `SETTINGS_QUERY_KEYS.profile()` returns `ME_QUERY_KEY`. |
| `src/locales/en.json`, `src/locales/it.json` | **MODIFY** — `rbac.*`, `acceptInvite.*`, `settings.groups.access`, `settings.tabs.{users,roles,invitations}`. |
| `src/features/settings/components/settings-dialog.test.tsx` | **MODIFY** — mock `usePermissions`; assert gated tabs. |
| `src/test/pages/accept-invite.test.tsx` | **NEW** — preview / invalid-token / submit paths. |
| `src/test/lib/use-permissions.test.ts` | **NEW** — hydration + `can`/`canAnywhere`/`canGlobally` semantics. |
| `src/test/config/dashboard-menu.test.ts` | **NEW** — gate filtering of the two builders. |

**Explicitly excluded from this sprint:** `packages/core/**` (zero diff), `apps/api/migrations/**` (zero diff), any new `PROTECTED_ROUTES` row, and per-entry content action buttons (SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `manageableScopes()` in `apps/api/src/shared/rbac/scoped-projection.ts`

Append to the existing file. Widen the existing import line to add `GLOBAL_SCOPE` (a value, so it moves out of the `import type`):

```ts
import type { EffectivePermissions, Permission, Scope, Seed } from '@beechcms/core'
import { GLOBAL_SCOPE, hasPermission } from '@beechcms/core'
```

```ts
/**
 * The scopes a caller may administer — i.e. the legal values of `scope` in
 * `POST /api/rbac/assignments` and `POST /api/rbac/invitations` for THIS caller.
 *
 * Not derivable from `GET /api/schema`: that listing is filtered by `content:read`
 * (the visibility floor for CONTENT), and a `manage_users` holder need not hold
 * `content:read` on the seeds they administer. Not derivable from `byScope` either:
 * a global holder has an empty `byScope` and still administers every seed.
 *
 * A global holder gets `'*'` plus every seed slug. A scoped holder gets exactly the
 * scopes they hold `manage_users` on — never `'*'`, mirroring the asymmetry
 * `canGrant()` enforces server-side. A caller with no `manage_users` anywhere gets
 * `[]` and learns nothing about the seed catalogue.
 */
export function manageableScopes(
  effective: EffectivePermissions,
  seeds: readonly Seed[],
): Scope[] {
  if (effective.global.has('manage_users')) {
    return [GLOBAL_SCOPE, ...seeds.map(seed => seed.slug).sort()]
  }
  return [...effective.byScope.entries()]
    .filter(([, permissions]) => permissions.has('manage_users'))
    .map(([scope]) => scope)
    .sort()
}
```

`Permission` stays imported (already used by `filterSeedsByPermission`). Deterministic
ordering, exactly like `serializeEffectivePermissions`.

### T2 — `GET /api/settings/me` emits `manageableScopes`

`apps/api/src/features/settings/settings.handler.ts`:

```ts
// line 10 — widen the existing import
import { manageableScopes, serializeEffectivePermissions } from '../../shared/rbac/scoped-projection'
```

Inside the `/me` handler, after `const effective = await resolveEffectivePermissions(context)`:

```ts
  const seedRegistry = context.get('seedRegistry')
```

and add the field to the returned object, immediately after `isDeveloper`:

```ts
    /** Scopes this caller may ASSIGN on (`'*'` + slugs for a global `manage_users`
     *  holder; own scopes for a scoped one; `[]` otherwise). NOT derivable from
     *  `GET /api/schema`, which is filtered by `content:read`. */
    manageableScopes: manageableScopes(effective, seedRegistry.all()),
```

`seedRegistry` is already on `Variables` and `.all()` is the same call
`schema.handler.ts:GET /` makes. **Every pre-existing key stays byte-identical**; this is
purely additive.

### T3 — `features/shared/hooks/use-me.ts` (NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import type { Permission, Scope } from "@beechcms/core"
import { api } from "@/lib/api"

/** Single cache entry for `GET /api/settings/me`. `features/settings` re-uses this key
 *  through `SETTINGS_QUERY_KEYS.profile()` so the endpoint is fetched exactly once. */
export const ME_QUERY_KEY = ["settings", "profile"] as const

/** Wire mirror of `apps/api/src/shared/rbac/scoped-projection.ts#EffectivePermissionsPayload`. */
export interface EffectivePermissionsPayload {
  global: Permission[]
  byScope: Record<Scope, Permission[]>
}

export interface MeNotificationPrefs {
  contentCreate: boolean
  contentUpdate: boolean
  contentDelete: boolean
  mediaUpload: boolean
}

/** Full `GET /api/settings/me` payload. Superset of the legacy `UserProfile`. */
export interface MeResponse {
  id: string
  email: string
  name: string | null
  surname: string | null
  avatarUrl: string | null
  notificationPrefs: MeNotificationPrefs
  permissions: EffectivePermissionsPayload
  /** `users.role === 'admin'` — the developer/owner axis, NOT an RBAC permission. */
  isDeveloper: boolean
  manageableScopes: Scope[]
}

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<MeResponse>("/settings/me")
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

### T4 — `features/shared/hooks/use-permissions.ts` (NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMemo } from "react"
import {
  GLOBAL_SCOPE,
  hasPermission,
  hasPermissionAnywhere,
  type EffectivePermissions,
  type Permission,
  type Scope,
} from "@beechcms/core"
import { useMe, type EffectivePermissionsPayload } from "./use-me"

/** Zero-trust default: no payload ⇒ no authority ⇒ every gated surface hidden. */
const NO_AUTHORITY: EffectivePermissions = {
  global: new Set<Permission>(),
  byScope: new Map<Scope, ReadonlySet<Permission>>(),
}

/** Rebuilds the Sets/Maps `@beechcms/core`'s evaluator expects from the JSON payload.
 *  Exported for tests; the hook is the only production caller. */
export function hydrateEffectivePermissions(
  payload: EffectivePermissionsPayload | undefined,
): EffectivePermissions {
  if (!payload) return NO_AUTHORITY
  return {
    global: new Set<Permission>(payload.global),
    byScope: new Map<Scope, ReadonlySet<Permission>>(
      Object.entries(payload.byScope).map(([scope, permissions]) => [
        scope,
        new Set<Permission>(permissions),
      ]),
    ),
  }
}

export interface PermissionsApi {
  /** The caller's authority, in the exact shape `permissionMiddleware` evaluates. */
  effective: EffectivePermissions
  /** May the caller do `permission` on `scope`? Delegates to core's `hasPermission`. */
  can: (permission: Permission, scope: Scope) => boolean
  /** Held on at least one scope — mirrors the API's `permission-any-scope` gate kind. */
  canAnywhere: (permission: Permission) => boolean
  /** Held at `'*'` — mirrors `perm(x, 'global')` rows in `PROTECTED_ROUTES`. */
  canGlobally: (permission: Permission) => boolean
  /** `users.role === 'admin'`. Gates the Seed Builder and NOTHING else. */
  isDeveloper: boolean
  /** Legal `scope` values for assignment/invitation creation by this caller. */
  manageableScopes: Scope[]
  isLoading: boolean
}

/**
 * The single source of UI visibility truth.
 *
 * Never re-implements the additive scope model: it rehydrates the payload and calls
 * `@beechcms/core`'s evaluator, the same functions `permissionMiddleware()` calls.
 * Client-side hiding is cosmetic — the server gate stays the enforcement point.
 */
export function usePermissions(): PermissionsApi {
  const { data, isLoading } = useMe()

  return useMemo(() => {
    const effective = hydrateEffectivePermissions(data?.permissions)
    return {
      effective,
      can: (permission: Permission, scope: Scope) => hasPermission(effective, permission, scope),
      canAnywhere: (permission: Permission) => hasPermissionAnywhere(effective, permission),
      canGlobally: (permission: Permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
      isDeveloper: data?.isDeveloper === true,
      manageableScopes: data?.manageableScopes ?? [],
      isLoading,
    }
  }, [data, isLoading])
}
```

`features/shared/index.ts` — append:

```ts
export * from "./hooks/use-me"
export * from "./hooks/use-permissions"
```

### T5 — `useProfile()` delegates to `useMe()`

`features/settings/hooks/use-settings.ts`:

```ts
import { ME_QUERY_KEY, useMe } from "@/features/shared"
```

```ts
export const SETTINGS_QUERY_KEYS = {
  all: ['settings'] as const,
  /** Same key as `features/shared`'s `useMe()` — one cache entry for `/settings/me`. */
  profile: () => ME_QUERY_KEY,
  sessions: () => [...SETTINGS_QUERY_KEYS.all, 'sessions'] as const,
  // ...unchanged
}

/** @deprecated for new code — prefer `useMe()` from `@/features/shared`.
 *  Kept as the profile-shaped view onto the same query. */
export function useProfile() {
  return useMe()
}
```

`settingsApi.getProfile` becomes unused by `useProfile` — **leave it in place** (it is
part of the slice's api surface and its test `settings.api.test.ts` covers it). Do not
delete it in this sprint.

`features/settings/types/settings.types.ts` — `UserProfile` stays as-is (it remains
structurally satisfied by `MeResponse`); only widen the tab union:

```ts
export type SettingsTab =
  | 'profile' | 'interface' | 'security' | 'storage' | 'notifications'
  | 'general' | 'content-types' | 'connected-apps'
  | 'users' | 'roles' | 'invitations'
```

### T6 — `features/rbac/types/rbac.types.ts` (NEW)

Reuse core types; declare only what the API adds on top.

```ts
import type { AccountSummary, Permission, PermissionAssignment, RoleRecord, Scope } from "@beechcms/core"

export type { Permission, RoleRecord, Scope }

/** `GET /api/rbac/users` row: account + its RAW (non-decayed) assignments. */
export type AccountView = AccountSummary & { assignments: PermissionAssignment[] }

/** `GET /api/rbac/users/:id/assignments` row. `active: false` = the scope's seed is
 *  currently deleted/inactive: the row still exists and must stay removable. */
export type AssignmentView = PermissionAssignment & {
  active: boolean
  roleName: string | null
  permissions: Permission[]
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired'

export interface InvitationView {
  id: string
  email: string
  roleId: string
  roleName: string | null
  scope: Scope
  invitedBy: string
  expiresAt: number
  createdAt: number
  status: InvitationStatus
}

export interface CreateUserPayload {
  email: string
  password: string
  name?: string | null
  surname?: string | null
}

export interface RoleBodyPayload {
  name: string
  description?: string | null
  permissions: Permission[]   // min 1 — server rejects an empty array (422)
}

export interface CreateAssignmentPayload { userId: string; roleId: string; scope: Scope }
export interface CreateInvitationPayload { email: string; roleId: string; scope: Scope; locale?: string }
```

### T7 — `features/rbac/constants.ts` (NEW)

Mirrors `apps/api/src/features/rbac/constants.ts`. **The dashboard must not import from
`apps/api`**; this local frozen map is the sanctioned duplication (same rule the slice
conventions already apply to error maps).

```ts
/** Mirror of the API's frozen `RBAC_ERRORS`. Codes are never renamed once shipped. */
export const RBAC_ERROR_CODES = {
  INVALID_JSON: 'invalid-json',
  VALIDATION_FAILED: 'validation-failed',
  NOT_FOUND: 'not-found',
  FORBIDDEN: 'forbidden',
  ESCALATION_REFUSED: 'escalation-refused',
  EMAIL_TAKEN: 'email-taken',
  ROLE_NAME_TAKEN: 'role-name-taken',
  SYSTEM_ROLE_IMMUTABLE: 'system-role-immutable',
  LAST_GLOBAL_ADMIN: 'last-global-admin',
  UNKNOWN_SCOPE: 'unknown-scope',
  EMAIL_UNAVAILABLE: 'email-unavailable',
  INVITATION_INVALID: 'invitation-invalid',
  INVITATION_REVOKED: 'invitation-revoked',
  INVITATION_ALREADY_USED: 'invitation-already-used',
} as const

export type RbacErrorCode = (typeof RBAC_ERROR_CODES)[keyof typeof RBAC_ERROR_CODES]

/**
 * Extracts the slice error code from an RFC 9457 body.
 * The API emits `type: "https://beechcms.dev/problems/<code>"`
 * (`apps/api/src/public/problem-details.ts#normalizeProblemType`).
 */
export function rbacErrorCode(error: unknown): RbacErrorCode | null {
  const type = (error as { response?: { data?: { type?: unknown } } })?.response?.data?.type
  if (typeof type !== 'string') return null
  const code = type.split('/').pop() ?? ''
  return (Object.values(RBAC_ERROR_CODES) as string[]).includes(code)
    ? (code as RbacErrorCode)
    : null
}
```

Every mutation's `onError` maps the code to `t("rbac.errors.<code>")`, falling back to
`t("rbac.errors.generic")`. **`escalation-refused` and `last-global-admin` must render
their own explicit message** — they are the two the operator most needs to understand.

### T8 — `features/rbac/api/rbac.api.ts` (NEW)

```ts
import { api } from "@/lib/api"
import type {
  AccountView, AssignmentView, CreateAssignmentPayload, CreateInvitationPayload,
  CreateUserPayload, InvitationView, RoleBodyPayload, RoleRecord, Scope,
} from "../types/rbac.types"

export const rbacApi = {
  listUsers: async (): Promise<AccountView[]> =>
    (await api.get<{ users: AccountView[] }>("/rbac/users")).data.users,

  createUser: async (payload: CreateUserPayload): Promise<AccountView> =>
    (await api.post<AccountView>("/rbac/users", payload)).data,

  setUserActive: async (userId: string, isActive: boolean): Promise<void> => {
    await api.patch(`/rbac/users/${userId}/active`, { isActive })
  },

  listAssignments: async (userId: string): Promise<AssignmentView[]> =>
    (await api.get<{ assignments: AssignmentView[] }>(`/rbac/users/${userId}/assignments`)).data.assignments,

  createAssignment: async (payload: CreateAssignmentPayload): Promise<{ id: string }> =>
    (await api.post<{ id: string }>("/rbac/assignments", payload)).data,

  deleteAssignment: async (assignmentId: string): Promise<void> => {
    await api.delete(`/rbac/assignments/${assignmentId}`)
  },

  listRoles: async (): Promise<RoleRecord[]> =>
    (await api.get<{ roles: RoleRecord[] }>("/rbac/roles")).data.roles,

  createRole: async (payload: RoleBodyPayload): Promise<{ id: string }> =>
    (await api.post<{ id: string }>("/rbac/roles", payload)).data,

  updateRole: async (roleId: string, payload: RoleBodyPayload): Promise<void> => {
    await api.put(`/rbac/roles/${roleId}`, payload)
  },

  deleteRole: async (roleId: string): Promise<void> => {
    await api.delete(`/rbac/roles/${roleId}`)
  },

  listInvitations: async (): Promise<InvitationView[]> =>
    (await api.get<{ invitations: InvitationView[] }>("/rbac/invitations")).data.invitations,

  createInvitation: async (payload: CreateInvitationPayload): Promise<{ id: string; expiresAt: number }> =>
    (await api.post<{ id: string; expiresAt: number }>("/rbac/invitations", payload)).data,

  regenerateInvitation: async (invitationId: string): Promise<{ id: string; expiresAt: number }> =>
    (await api.post<{ id: string; expiresAt: number }>(`/rbac/invitations/${invitationId}/regenerate`, {})).data,

  revokeInvitation: async (invitationId: string): Promise<void> => {
    await api.delete(`/rbac/invitations/${invitationId}`)
  },
}
```

`Scope` is imported for the payload types only; drop it from the import list if the
linter flags it as unused.

### T9 — `features/rbac/hooks/use-rbac.ts` (NEW)

```ts
export const RBAC_QUERY_KEYS = {
  all: ["rbac"] as const,
  users: () => [...RBAC_QUERY_KEYS.all, "users"] as const,
  assignments: (userId: string) => [...RBAC_QUERY_KEYS.all, "assignments", userId] as const,
  roles: () => [...RBAC_QUERY_KEYS.all, "roles"] as const,
  invitations: () => [...RBAC_QUERY_KEYS.all, "invitations"] as const,
}
```

Hooks — all `useQuery` / `useMutation`, following `features/settings/hooks/use-settings.ts`:

| Hook | Query key / mutation | Invalidates on success |
|---|---|---|
| `useRbacUsers()` | `users()` | — |
| `useCreateUser()` | `rbacApi.createUser` | `users()` |
| `useSetUserActive()` | `({userId,isActive})` | `users()` |
| `useUserAssignments(userId, enabled)` | `assignments(userId)`, `enabled: !!userId` | — |
| `useCreateAssignment()` | `rbacApi.createAssignment` | `assignments(userId)` **and** `users()` |
| `useDeleteAssignment()` | `({assignmentId,userId})` | `assignments(userId)` **and** `users()` |
| `useRbacRoles()` | `roles()`, `staleTime: 5min` | — |
| `useCreateRole()` / `useUpdateRole()` / `useDeleteRole()` | — | `roles()`; delete also `users()` + open `assignments(*)` (role deletion cascades to assignments) |
| `useInvitations()` | `invitations()` | — |
| `useCreateInvitation()` / `useRegenerateInvitation()` / `useRevokeInvitation()` | — | `invitations()` |

**Self-authority refresh:** `useCreateAssignment` and `useDeleteAssignment` must also
`qc.invalidateQueries({ queryKey: ME_QUERY_KEY })` — an operator editing their own
assignments must see their own chrome update without a reload.

`useCreateInvitation` sends `locale: i18n.language` (the API validates `max(8)` and falls
back to `'en'`), matching `ResetPasswordPage`'s existing `locale` behaviour.

### T10 — `features/rbac/components/scope-select.tsx` (NEW)

```tsx
/**
 * Scope picker for assignments and invitations.
 *
 * Options come from `usePermissions().manageableScopes` — the server's own answer to
 * "what may this caller grant on". NOT from `useSchema()`: `GET /api/schema` is filtered
 * by `content:read`, which a `manage_users` holder need not have on the seeds they
 * administer. Labels are enriched from `useSchema()` when the seed happens to be
 * visible, and fall back to the raw slug otherwise.
 */
```

- `'*'` renders as `t("rbac.scope.global")` ("All seeds (global)").
- A slug renders as `seed?.labelPlural ?? seed?.label ?? slug`.
- Empty list ⇒ render a disabled select plus `t("rbac.scope.none")`; the caller holds
  `manage_users` nowhere and reached the screen through another route.
- Built on `@/components/ui/select`.

### T11 — `features/rbac/components/users-tab.tsx` + `user-form-dialog.tsx` + `assignments-dialog.tsx` (NEW)

**`users-tab.tsx`** — table of `useRbacUsers()`: Email · Name · Roles (badges of
`assignment.roleName @ scope`, muted when `active === false`) · Status
(`Active`/`Disabled`) · Actions.

- Header button **Create account** → `user-form-dialog` (email, password, name, surname).
  Copy must state that the account is created with **no role and no access** until
  assigned (brief §2, zero-trust). On `email-taken` show `t("rbac.errors.email-taken")`.
- Row action **Manage roles** → `assignments-dialog`.
- Row action **Deactivate / Reactivate** → `useSetUserActive`. Deactivation opens an
  `AlertDialog` stating that all active sessions are revoked immediately. A
  `last-global-admin` refusal renders `t("rbac.errors.last-global-admin")` and the row
  stays unchanged.
- The caller's own row is always present (the API guarantees it); render a
  `t("rbac.users.you")` badge on it and **hide its own Deactivate action** — the server
  refuses self-lockout anyway, but offering it is a trap.

**`assignments-dialog.tsx`** — `useUserAssignments(userId)`:
- list of `AssignmentView` rows: role name, scope label, permission badges, an
  `t("rbac.assignments.inactiveScope")` marker when `active === false`, and a Remove button;
- an add form: role `<Select>` from `useRbacRoles()` + `<ScopeSelect>` + Add;
- **client-side anti-escalation pre-check, advisory only:** disable the Add button when
  `!role.permissions.every(p => can(p, scope))`, with a tooltip
  `t("rbac.errors.escalation-refused")`. The server's `canGrant()` remains the decision;
  this only stops a request that is guaranteed to 403.
- `POST /api/rbac/assignments` is idempotent — a duplicate triple returns the existing id
  and must render as success, not as an error.

### T12 — `features/rbac/components/roles-tab.tsx` + `role-form-dialog.tsx` (NEW)

- Table of `useRbacRoles()`: Name · Description · Permissions (badges) · `System` badge
  when `isSystem` · Actions.
- **`isSystem` rows have Edit and Delete hidden** — the server returns
  `system-role-immutable` (409) and `IRoleRepository.update()` changes nothing.
- Edit/Create are hidden entirely unless `canAnywhere('manage_roles')`
  (`GET /roles` only needs `manage_users` **or** `manage_roles`, so a `manage_users`-only
  operator legitimately sees the catalogue read-only in order to assign from it).
- `role-form-dialog`: name (1–80), description (≤400, nullable), and a checkbox group over
  `PERMISSIONS` imported from `@beechcms/core` — **never a hardcoded string list**; the
  enum is closed and core owns it. Submit disabled while zero permissions are selected
  (server: `min(1)`).
- Only permissions the actor holds somewhere are selectable; the rest render disabled with
  `t("rbac.errors.escalation-refused")` as the title (server rule: `holdsAll()`).
- Delete: `AlertDialog` warning that every assignment through the role is removed by
  cascade. `last-global-admin` ⇒ show the message, keep the role.

### T13 — `features/rbac/components/invitations-tab.tsx` + `invite-dialog.tsx` (NEW)

- Table of `useInvitations()`: Email · Role · Scope · Status badge
  (`pending` / `accepted` / `expired`) · Expires (relative time) · Actions.
- **Invite** button → `invite-dialog`: email, role `<Select>`, `<ScopeSelect>`; same
  advisory `canGrant` pre-check as T11. On success, a toast saying the invitation was
  **emailed** — the token is never returned by the API and must never be rendered or
  reconstructed client-side.
- Row action **Regenerate** — visible only when `status !== 'accepted'`; keeps the same
  role+scope pre-assignment (brief §4). `invitation-already-used` (409) ⇒ show
  `t("rbac.errors.invitation-already-used")` and refetch the list.
- Row action **Revoke** (`DELETE`, 204) behind an `AlertDialog`.
- `email-unavailable` (the email service is not configured) must render the explicit
  `t("rbac.errors.email-unavailable")` — otherwise the operator cannot tell why nobody
  receives invitations.

### T14 — `features/rbac/index.ts` (NEW)

```ts
export { UsersTab } from "./components/users-tab"
export { RolesTab } from "./components/roles-tab"
export { InvitationsTab } from "./components/invitations-tab"
export { RBAC_QUERY_KEYS } from "./hooks/use-rbac"
```

Nothing else leaves the slice.

### T15 — `config/dashboard-menu.ts` — gates

```ts
/**
 * Permission answers the sidebar needs, resolved once by `AppSidebar` from
 * `usePermissions()`. The builders stay pure and testable: they receive answers,
 * never the evaluator.
 *
 * Each flag mirrors a `PROTECTED_ROUTES` row and hides nothing the server allows:
 *  - `viewAnalytics`  → perm('view_analytics','global')  (`/api/content/stats/*`)
 *  - `readContent`    → content:read on at least one seed (`GET /api/content/drafts`,
 *                       whose in-handler projection returns [] for a caller with none)
 *  - `createContent`  → content:create on at least one seed (`POST /api/content/:slug`)
 */
export interface MenuGates {
  viewAnalytics: boolean
  readContent: boolean
  createContent: boolean
}
```

Widen `NavItem` with the disabled state (VETO Audit §8, axis two):

```ts
export interface NavItem {
  title: string
  url: string
  icon: IconComponent
  isActive?: boolean
  items?: { title: string; url: string }[]
  /** Rendered greyed and unclickable instead of hidden: the caller can see the surface
   *  this belongs to, but may not perform the action. Section-level absence is HIDDEN
   *  instead — the two are never mixed. */
  disabled?: boolean
  /** Tooltip shown on a disabled item; must name the missing authority. */
  disabledReason?: string
}
```

```ts
export function getStaticMenu(t: (key: string) => string, gates: MenuGates): NavItem[] {
  const items: NavItem[] = [
    { title: "Dashboard", url: "/", icon: LayoutDashboard, isActive: true },
  ]
  // Analytics owns a dedicated permission → axis one: hidden, not disabled.
  if (gates.viewAnalytics) {
    items.push({ title: t("sidebar.analytics"), url: "/analytics", icon: BarChart2 })
  }
  return items
}

export function getContentCategoryMenu(t: (key: string) => string, gates: MenuGates): NavItem[] {
  // Axis one: no readable seed anywhere ⇒ the whole content axis is absent for this
  // account (zero-trust, brief §2). Nothing to disable, because nothing is visible.
  if (!gates.readContent) return []

  return [
    {
      title: t("sidebar.createNew"),
      url: "/content/create-new",
      icon: Plus,
      // Axis two: the caller sees content, so the feature is shown to exist and is
      // greyed rather than removed (the demo/read-only persona, brief §3).
      disabled: !gates.createContent,
      disabledReason: gates.createContent ? undefined : t("sidebar.disabled.createContent"),
    },
    { title: t("sidebar.drafts"), url: "/drafts", icon: PenLine },
    { title: t("sidebar.scheduled"), url: "/scheduled", icon: Calendar },
  ]
}
```

`buildContentMenu()` and `getSettingsMenu()` are **unchanged**: seeds already arrive
scope-filtered from `GET /api/schema` (axis one, applied server-side), and Settings is
`AUTHED` for every account. Dashboard (`/`) stays unconditional
(`/api/dashboard-layout` GET is `AUTHED`).

### T15b — `components/nav-main.tsx` — render the disabled state

`NavMainItem` currently always renders `<SidebarMenuButton asChild><Link …>`. Widen the
local type with `disabled?: boolean` and `disabledReason?: string` (structurally
compatible with `NavItem`) and branch:

```tsx
  if (item.disabled) {
    return (
      <SidebarMenuItem ref={itemRef}>
        <SidebarMenuButton
          disabled
          aria-disabled="true"
          tooltip={item.disabledReason ?? item.title}
          className="cursor-not-allowed opacity-50"
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }
```

placed before the existing `Collapsible` return. A disabled item renders **no `<Link>`**,
so it is not keyboard-navigable to a route the caller cannot use, and no sub-items — a
disabled parent with an expandable child is a dead end. Everything else in the file is
untouched.

### T16 — `app-sidebar.tsx` — wire the gates

```tsx
import { useSchema, usePermissions } from "@/features/shared"
```

```tsx
  const { canGlobally, canAnywhere } = usePermissions()

  const gates: MenuGates = React.useMemo(() => ({
    viewAnalytics: canGlobally('view_analytics'),
    readContent: canAnywhere('content:read'),
    createContent: canAnywhere('content:create'),
  }), [canGlobally, canAnywhere])
```

Render sites become `getStaticMenu(t, gates)` (`:75`) and `getContentCategoryMenu(t, gates)`
(`:76`). **`NavMain` must not render an empty section** — the content group is empty only
for an account that can read no seed at all (axis one), so wrap the second call:

```tsx
  const contentCategoryItems = getContentCategoryMenu(t, gates)
  ...
  {contentCategoryItems.length > 0 && (
    <NavMain items={contentCategoryItems} groupLabel={t("sidebar.contentGroup")} />
  )}
```

Everything else in the file (header, `NavUser`, `useProfile`, logout) is untouched.

### T17 — `settings-dialog.tsx` — access group + gating

Add imports:

```tsx
import { Users, ShieldCheck, Mail } from "reicon-react"
import { usePermissions } from "@/features/shared"
import { UsersTab, RolesTab, InvitationsTab } from "@/features/rbac"
```

(Confirm the three icon names exist in `reicon-react` before use; substitute the nearest
available glyphs rather than adding an icon dependency.)

Extend `TabContent`:

```tsx
    case "users":       return <UsersTab />
    case "roles":       return <RolesTab />
    case "invitations": return <InvitationsTab />
```

Gate the groups. Inside the component:

```tsx
  const { canGlobally, canAnywhere, isDeveloper } = usePermissions()
```

Group definitions become filtered:

| Group | Item | Condition | Mirrors |
|---|---|---|---|
| `account` | profile, security, connected-apps, notifications | always | `AUTHED` rows |
| `system` | general (Site) | `canGlobally('manage_users')` | `PUT /api/settings` |
| `system` | interface | always | client-only (theme/density) |
| `system` | storage | `canGlobally('view_analytics')` | `GET /api/settings/storage` |
| `access` **(new)** | users | `canAnywhere('manage_users')` | `anyScope('manage_users')` |
| `access` **(new)** | roles | `canAnywhere('manage_users') \|\| canAnywhere('manage_roles')` | `GET /api/rbac/roles` |
| `access` **(new)** | invitations | `canAnywhere('manage_users')` | `anyScope('manage_users')` |
| `models` | content-types | **`isDeveloper`** | `LEGACY_ADMIN` on `/api/seeds/*` |

Implementation shape (keep the existing `SettingsGroup` type):

```tsx
  const groups: ReadonlyArray<SettingsGroup> = [
    { id: "account", title: t("settings.groups.account", "Account"), items: [ /* unchanged 4 */ ] },
    {
      id: "system",
      title: t("settings.groups.system", "System & UI"),
      items: [
        ...(canGlobally('manage_users')
          ? [{ id: "general" as const, label: t("settings.tabs.general", "Site"), icon: Settings }] : []),
        { id: "interface" as const, label: t("settings.tabs.interface", "Interface"), icon: Palette },
        ...(canGlobally('view_analytics')
          ? [{ id: "storage" as const, label: t("settings.tabs.storage", "Storage"), icon: HardDrive }] : []),
      ],
    },
    {
      id: "access",
      title: t("settings.groups.access", "Access"),
      items: [
        ...(canAnywhere('manage_users')
          ? [{ id: "users" as const, label: t("settings.tabs.users", "Users"), icon: Users }] : []),
        ...(canAnywhere('manage_users') || canAnywhere('manage_roles')
          ? [{ id: "roles" as const, label: t("settings.tabs.roles", "Roles"), icon: ShieldCheck }] : []),
        ...(canAnywhere('manage_users')
          ? [{ id: "invitations" as const, label: t("settings.tabs.invitations", "Invitations"), icon: Mail }] : []),
      ],
    },
    {
      id: "models",
      title: t("settings.groups.models", "Data Models"),
      items: isDeveloper
        ? [{ id: "content-types" as const, label: t("seedBuilder.page.navTitle", "Content Types"), icon: Layers }]
        : [],
    },
  ].filter(group => group.items.length > 0)
```

**Deep-link guard.** `SettingsPage` reads `?tab=` from the URL, so an unauthorized tab id
is reachable by hand. Add, after the groups are built:

```tsx
  const visibleTabs = new Set(groups.flatMap(g => g.items.map(i => i.id)))
  const safeTab: SettingsTab = visibleTabs.has(activeTab) ? activeTab : "profile"
```

and drive both the header and `<TabContent tab={safeTab} />` from `safeTab`. Without this,
`/settings?tab=users` renders the admin screen for anyone — the API would refuse every
request behind it, but the surface itself must not appear.

### T18 — `pages/accept-invite/AcceptInvitePage.tsx` (NEW)

Copy the structure of `pages/reset-password/ResetPasswordPage.tsx` exactly: same card
layout, same `Field`/`FieldGroup` primitives, same show/hide password affordance, bare
`axios` (these endpoints are **not** under `/api`, carry no bearer, and must not go
through the `api` instance or its refresh interceptor).

```tsx
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
```

Flow:

1. `const token = useSearchParams()[0].get("token")`. No token ⇒ the invalid-link card
   (mirroring `ResetPasswordPage`'s early return), linking to `/login`.
2. Preview:

```tsx
  const { data: preview, isError, isLoading } = useQuery<{ email: string; roleName: string; scope: string }>({
    queryKey: ["invitation-preview", token],
    queryFn: async () => (await axios.get(`/auth/invitations/${token}`)).data,
    enabled: !!token,
    retry: false,
  })
```

   `isError` (404 `invitation-invalid`, or 429 from the endpoint's own IP rate limit) ⇒
   the invalid-link card with `t("acceptInvite.invalidOrExpired")`. **Never distinguish
   unknown from expired from already-used** — the API deliberately collapses them.
3. On success render "You were invited as **{roleName}** on **{scopeLabel}**" (scope
   `'*'` ⇒ `t("rbac.scope.global")`), the invitee's email read-only, and the form:
   name, surname, password, confirm.
4. Submit:

```tsx
  await axios.post("/auth/invitations/accept", { token, password, name, surname })
```

   then `toast.success(t("acceptInvite.success"))` and
   `navigate("/login", { replace: true })`. **No session is issued** — the activated
   account logs in normally (`invitations.public.ts:63-66`).
5. Error mapping via `rbacErrorCode` semantics: `invitation-invalid` (404) and
   `invitation-revoked` (409) ⇒ the invalid-link card; `email-taken` (409) ⇒ inline
   "account already exists, sign in instead" with a `/login` link;
   `validation-failed` (422) ⇒ inline field error; anything else ⇒ generic.

`App.tsx` — add next to `/reset-password`, **outside** `ProtectedRoute`:

```tsx
      {
        path: "/accept-invite",
        element: <AcceptInvitePage />,
      },
```

The path must stay `/accept-invite`: `apps/api/src/features/rbac/invitations.ts:28` emails
`` `${baseUrl}/admin/accept-invite?token=…` `` and the router's basename is `/admin`.

### T19 — i18n

`src/locales/en.json` and `src/locales/it.json` gain a top-level `rbac` and
`acceptInvite` namespace and three `settings` additions. Minimum key set:

```
sidebar.disabled.createContent                   # "You cannot create content here"
settings.groups.access
settings.tabs.users | settings.tabs.roles | settings.tabs.invitations
rbac.users.{title,create,email,name,status,active,disabled,roles,you,deactivate,
            reactivate,manageRoles,zeroTrustHint,deactivateWarning}
rbac.roles.{title,create,edit,delete,name,description,permissions,system,deleteWarning}
rbac.invitations.{title,invite,status,expires,regenerate,revoke,emailSent,revokeWarning}
rbac.assignments.{title,add,remove,role,scope,inactiveScope}
rbac.scope.{global,none}
rbac.permissions.<one per PERMISSIONS entry>     # human labels for the 7 permissions
rbac.errors.{generic,validation-failed,not-found,forbidden,escalation-refused,
             email-taken,role-name-taken,system-role-immutable,last-global-admin,
             unknown-scope,email-unavailable,invitation-invalid,invitation-revoked,
             invitation-already-used}
acceptInvite.{title,desc,invitedAs,onScope,invalidOrExpired,password,confirm,mismatch,
              tooShort,tooLong,submit,success,accountExists,genericError}
```

Both files must receive the **same key set** — a missing Italian key renders the raw key
path in the UI.

### T20 — Tests

**API (3 files touched):**
1. `apps/api/src/shared/rbac/scoped-projection.test.ts` — `manageableScopes`:
   global holder ⇒ `['*', ...sorted slugs]`; seed-scoped holder ⇒ own scopes only, and
   **never `'*'`**; `manage_users` absent ⇒ `[]`; holder of a *different* permission on a
   scope ⇒ that scope is excluded.
2. `apps/api/src/features/settings/__tests__/settings.handler.test.ts` — `/me` returns
   `manageableScopes` and every pre-existing key is unchanged.
3. `apps/api/test/flow-rbac-projections.test.ts` — one added step over the real
   `D1TestDatabase`: SuperAdmin, a seed-scoped `manage_users` holder, and a zero-trust
   account each get the correct array. Seed users only through `seedTestUsers()` /
   the existing admin-API path — **no second seeding path**.

**Dashboard (5 files):**
4. `src/test/lib/use-permissions.test.ts` — `hydrateEffectivePermissions` round-trip;
   `can('content:read','articles')` true for a scoped grant and **false at `'*'`** (the
   asymmetry); `canAnywhere` true for a scoped-only grant; `undefined` payload ⇒ every
   answer false.
5. `src/test/config/dashboard-menu.test.ts` — the HIDE/DISABLE split (VETO §8):
   `readContent: false` ⇒ `getContentCategoryMenu` returns `[]` (axis one, zero-trust);
   `readContent: true, createContent: false` ⇒ **3 items**, with Create New carrying
   `disabled: true` and a non-empty `disabledReason` (axis two) — asserting it is
   *present*, not filtered; both true ⇒ 3 items, none disabled.
   `viewAnalytics: false` ⇒ `getStaticMenu` returns Dashboard only and **no disabled
   Analytics entry** (Analytics is axis one).
   Plus one `nav-main` render test: a disabled item renders no anchor
   (`queryByRole('link')` is null) and carries `aria-disabled="true"`.
6. `src/features/settings/components/settings-dialog.test.tsx` — mock
   `@/features/shared`'s `usePermissions` (and `@/features/rbac` tabs, as the file already
   mocks `@/features/seed-builder`): zero-trust ⇒ only the `account` group renders and
   `?tab=users` falls back to Profile; `manage_users` global ⇒ Access group + Site tab;
   `isDeveloper: false` ⇒ **no** Content Types tab even with every RBAC permission.
7. `src/features/rbac/components/*.test.tsx` — one per tab: renders rows from a mocked
   hook; a system role exposes no Edit/Delete; an accepted invitation exposes no
   Regenerate; the escalation pre-check disables Add.
8. `src/test/pages/accept-invite.test.tsx` — missing token ⇒ invalid card; preview 404 ⇒
   invalid card; happy path ⇒ `POST /auth/invitations/accept` with the token and a
   redirect to `/login`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. core must be untouched and still build (it is a dependency of both apps)
pnpm --filter @beechcms/core run build
git diff devs --stat -- packages/core          # MUST be empty

# 2. migrations must be untouched
git diff devs --stat -- apps/api/migrations    # MUST be empty

# 3. typecheck both apps (baseline is 0 errors on both — see the sprint-5 execution log)
cd apps/api        && npx tsc --noEmit | grep -c "error TS"   # expect 0
cd apps/dashboard  && npx tsc --noEmit                        # expect clean

# 4. VSA gates
grep -rn "features/" apps/dashboard/src/features/shared/            # expect: no import
grep -rn "@/features/" apps/dashboard/src/features/rbac/            # only @/features/shared
grep -rn "@/features/settings" apps/dashboard/src/features/rbac/    # MUST be empty
grep -rn "apps/api\|from '.*apps/api" apps/dashboard/src/features/rbac/  # MUST be empty

# 5. the developer axis is intact
grep -rn "manage_seeds" packages/core apps/api apps/dashboard   # comments/tests only

# 6. no second authorization implementation on the client
grep -rn "byScope" apps/dashboard/src | grep -v "use-permissions\|use-me\|\.test\."
# expect: no hand-rolled scope logic outside the shared hook

# 7. tests
pnpm --filter @beechcms/core test
pnpm --filter @beechcms/api test
pnpm --filter @beechcms/dashboard test
pnpm lint

# 8. targeted suites
cd apps/api && npx vitest run \
  src/shared/rbac/scoped-projection.test.ts \
  src/features/settings/__tests__/settings.handler.test.ts \
  src/middleware/permission.middleware.test.ts \
  test/flow-rbac-projections.test.ts test/flow-rbac-admin.test.ts \
  test/flow-rbac-invitations.test.ts test/flow-rbac-enforcement.test.ts

cd apps/dashboard && npx vitest run \
  src/test/lib/use-permissions.test.ts \
  src/test/config/dashboard-menu.test.ts \
  src/test/pages/accept-invite.test.tsx \
  src/features/settings/components/settings-dialog.test.tsx \
  src/features/rbac

# 9. runtime smoke — REQUIRED this sprint (sprint 5 legitimately skipped it because it
#    shipped no UI; this sprint is UI, so an E2E test cannot stand in for it)
pnpm beech db:reset
pnpm beech dev
#   a. log in as the SuperAdmin created by POST /auth/setup
#   b. Settings shows Access (Users/Roles/Invitations) + Site + Storage + Content Types
#   c. create a role "SeedEditor" = [content:read, content:update]
#   d. invite an address at scope <one seed>; check the mail in Mailpit (pnpm beech logs mailpit)
#   e. open the emailed /admin/accept-invite?token=… link in a private window,
#      set a password, then log in as that account
#   f. that account must see: only its own seed in the sidebar; Create New present but
#      GREYED with a tooltip (it has content:read+update, not content:create — axis two);
#      NO Analytics, NO Access group, NO Content Types, NO Site tab (axis one)
#   f2. create a second, content:read-ONLY account on the same seed (the demo persona):
#      same chrome, Create New still greyed, seed opens and lists entries
#   g. hand-type /admin/settings?tab=users as that account → falls back to Profile
#   h. back as SuperAdmin: deactivate the account; its next request 403s account_disabled
#   i. try to remove the SuperAdmin's own global assignment → refused, last-global-admin

# 10. refresh the graph after merge
graphify update . --force
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Boundaries**
- [ ] `packages/core/**` has zero diff.
- [ ] `apps/api/migrations/**` has zero diff.
- [ ] `PROTECTED_ROUTES` has zero diff — no row added, removed or reordered.
- [ ] The only `apps/api` production changes are `shared/rbac/scoped-projection.ts`
      (one added export) and `features/settings/settings.handler.ts` (one added field).
- [ ] `apps/dashboard/src/features/rbac/**` imports no feature slice other than
      `@/features/shared`, and nothing from `apps/api`.
- [ ] `apps/dashboard/src/features/shared/**` imports no feature slice.
- [ ] The only new slice-to-slice edge is `settings-dialog.tsx → @/features/rbac`, in the
      same composition-root position as its existing `@/features/seed-builder` and
      `@/features/oauth-consent` imports. No reverse edge exists.

**Contracts**
- [ ] `GET /api/settings/me` returns every pre-existing key byte-identical, plus
      `manageableScopes: string[]`.
- [ ] `manageableScopes` = `['*', ...sorted slugs]` for a global `manage_users` holder;
      the caller's own `manage_users` scopes (never `'*'`) for a scoped holder; `[]`
      otherwise.
- [ ] `GET /api/settings/me` is fetched under exactly one query key: `useProfile()` and
      `useMe()` share `ME_QUERY_KEY`.
- [ ] The dashboard performs **no** permission arithmetic of its own: every decision goes
      through `hasPermission` / `hasPermissionAnywhere` imported from `@beechcms/core`.
- [ ] `AccountView`, `AssignmentView`, role and permission types are built on core's
      `AccountSummary`, `PermissionAssignment`, `RoleRecord`, `Permission` — not
      re-declared.
- [ ] The role editor's permission list is rendered from `PERMISSIONS` imported from
      `@beechcms/core`; no hardcoded permission string array exists in the dashboard.

**Behaviour**
- [ ] While `/settings/me` is loading, every gated surface is hidden (fail-closed) — no
      flash of an unauthorized surface.
- [ ] A zero-trust account (no assignment) sees: Dashboard, Settings → Profile /
      Security / Connected apps / Notifications / Interface, and nothing else. No 500,
      no blank screen, no error toast.
- [ ] Analytics appears only with `view_analytics` at `'*'`; Storage tab likewise; Site
      tab only with `manage_users` at `'*'`.
- [ ] Content Types (Seed Builder) appears **only** when `isDeveloper === true`, and is
      gated on no RBAC permission. `manage_seeds` appears nowhere in the dashboard.
- [ ] `/settings?tab=<unauthorized>` falls back to Profile instead of rendering the tab.
- [ ] Sidebar content groups reflect the scope-filtered `GET /api/schema` with no extra
      client-side filtering added.
- [ ] **HIDE vs DISABLE (VETO §8) is applied exactly:** an account that can read at least
      one seed but create nothing sees Create New **present and greyed** with a tooltip,
      not removed; an account that can read no seed sees the whole content group absent.
- [ ] A disabled nav item renders no `<Link>` / anchor and carries `aria-disabled="true"`.
- [ ] Analytics, Storage, Site, the Access group and Content Types are **hidden, never
      disabled** — each is governed by a dedicated permission or the developer axis.
- [ ] No empty nav group is rendered.
- [ ] `POST /api/rbac/assignments` returning an existing id (idempotent replay) renders
      as success.
- [ ] System roles expose no Edit/Delete; accepted invitations expose no Regenerate; the
      caller's own row exposes no Deactivate.
- [ ] `escalation-refused`, `last-global-admin` and `email-unavailable` each render a
      distinct, explicit message.
- [ ] The invitation token is never rendered, logged, or reconstructed in the dashboard.
- [ ] `/accept-invite?token=…` previews the invitation, activates the account, and routes
      to `/login`; unknown / expired / used tokens are indistinguishable in the UI.

**Build & tests**
- [ ] `pnpm --filter @beechcms/core run build` clean.
- [ ] `apps/api` `npx tsc --noEmit` → **0** errors (the sprint-5 baseline is 0; it must
      not regress).
- [ ] `apps/dashboard` `npx tsc --noEmit` → 0 errors.
- [ ] `pnpm --filter @beechcms/{core,api,dashboard} test` all green; `pnpm lint` green.
- [ ] Every SECTION 5 item 9 runtime step (a–i) executed and reported in the execution
      log, or the deviation explicitly approved by the user.
- [ ] No production code was weakened to keep a pre-existing test green; every adapted
      test is listed in the execution log with its reason.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:

1. **Add any RBAC permission**, in `packages/core/src/rbac/permissions.ts` or anywhere
   else. The vocabulary is closed (brief §4). `manage_seeds` must never exist
   (brief §2, roadmap "developer axis").
2. **Touch `PROTECTED_ROUTES`.** If a screen appears to need a route that is not in the
   table, the screen is wrong, not the table.
3. **Touch per-entry content action buttons** (create / edit / delete / bulk / kanban /
   gallery affordances inside `features/content-*`, `features/entry-editor`,
   `features/bulk-edit`, `features/drafts`, `features/automations`), or add a read-only
   mode to the entry editor. Those surfaces are already enforced server-side by
   `perm('content:*', 'capture1')` — a scoped user who presses one gets a 403, safe but
   poor UX. Deferred whole to **roadmap entry 7, `RbacContentActionGating`**, which will
   **disable, not hide** them per VETO §8; it is a wide mechanical sweep across eight
   slices and would make this diff unreviewable. The only disabled affordance this sprint
   ships is the sidebar's Create New item (T15/T15b).
4. **Add row-level filtering** of any kind. Isolation is per-seed (brief §5).
5. **Re-scope `/api/upload*`, `/api/automations*`, `/api/dashboard-layout`,
   `/api/content/stats/*` or `/api/settings/{activity,storage}`.** These stay global-only
   by the permanent decision recorded in the roadmap ("Scope refinements refused
   permanently").
6. **Build a new API endpoint.** The one API change permitted is the additive
   `manageableScopes` field on `GET /api/settings/me` (T1–T2). Anything more is a plan
   deviation requiring approval.
7. **Add a migration or edit `0000_v040_base.sql`.** Every table already exists.
8. **Delete or repurpose `users.role`.** It is retained permanently as the developer axis
   (roadmap, sprint-3 VETO §5).
9. **Render, log, or reconstruct invitation tokens** in the dashboard, or add a
   "copy invite link" affordance. The API returns the token to the mail transport only.
10. **Implement analytics, scheduling or quick-create content** behind the pages this
    sprint gates. `analytics.tsx`, `scheduled.tsx` and `create-new.tsx` remain the
    placeholders they are today; only their menu visibility changes.
11. **Add a second `/settings/me` fetch**, a second permission cache, or a client-local
    reimplementation of the additive scope model.
12. **Change `useSchema()`'s wire shape or its `registerSeeds()` side effect.**
13. **Add an eslint boundary plugin or restructure existing slices.** The VSA rules here
    are enforced by the SECTION 5 greps and review, not by a new toolchain.
