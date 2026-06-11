# Dashboard Composer — Sprint 06: Role-based Dashboards (optional)

> **Audience:** an AI coding agent implementing this sprint end-to-end with no prior
> knowledge of the Beech CMS codebase. Everything needed to implement is inline.
> Do not grep beyond what is referenced here unless something disagrees with the
> live code — in that case, trust live code and note the drift.

Depends on [Sprint 02](./02-layout-persistence-and-api.md) (the `scope` PK
already exists) and [Sprint 05](./05-dashboard-builder-ui.md) (the builder this
sprint extends). Small sprint: no migration, no new tables.

Admins can now maintain **one dashboard per role** in addition to the shared
default. An editor logging in sees, in order of precedence:
`role:editor` → `default` → generated default.

---

## 0. ROLE & GROUND RULES

Same as Sprint 02 (API) and Sprint 05 (frontend) — i.e. **Vertical Slice
Architecture** (API changes confined to `features/dashboard-layout/`, frontend
changes confined to `apps/dashboard/src/features/dashboard/`) and **Shadcn/ui +
Tailwind v4** for the scope-switcher UI, no new dependencies. Additionally:

1. **Scopes are a closed set.** `'default' | 'role:admin' | 'role:editor'`.
   Roles come from a new core constant — do not scatter string literals.
2. **Read resolution happens server-side** so the client stays scope-unaware on
   the read path.

---

## 1. WHAT THIS SPRINT BUILDS

1. **Core:** `DASHBOARD_SCOPES` helper module — `KNOWN_DASHBOARD_ROLES =
   ['admin', 'editor']`, `roleScope(role)` → `'role:admin'`,
   `isValidDashboardScope(s)`, `resolveDashboardScopeChain(role)` →
   `['role:<role>', 'default']`.
2. **API — read resolution:** `GET /api/dashboard-layout` walks the caller's
   scope chain (`jwtPayload.role`) and returns the first stored row, with the
   winning `scope` in the response: `{ scope, layout }` (`scope: 'default'`,
   `layout: null` when nothing stored anywhere).
3. **API — scoped writes:**
   - `PUT /api/dashboard-layout/:scope` and `DELETE /api/dashboard-layout/:scope`
     (admin-only, `400` problem on invalid scope).
   - Bare `PUT/DELETE /api/dashboard-layout` keep writing `'default'`
     (backwards compatible — Sprint 05 builder keeps working until updated
     below).
   - `GET /api/dashboard-layout/scopes` (admin-only) → `repo.listScopes()`
     annotated with which are stored.
4. **Builder scope switcher:** a select in the builder header —
   `Default (all roles)`, `Editors`, `Admins`. Switching loads that scope's
   stored layout (or the default-scope layout as starting draft, or the
   generated default), with the usual dirty-draft guard. Save/Reset target the
   selected scope. A badge shows "stored" vs "inherits default".
5. **Renderer note:** end users need no UI change — resolution is invisible.

---

## 2. CURRENT STATE (verbatim reference)

- `dashboard_layouts.scope` PK exists; only `'default'` is written so far.
- `IDashboardLayoutRepository.listScopes()` shipped in Sprint 02.
- `GET` handler currently hardcodes `repo.get('default')` — replace with chain
  walk.
- Roles in the system: `'admin' | 'editor'` (`UserRecord.role`, JWT `role`
  claim). If a third role appears later, `KNOWN_DASHBOARD_ROLES` is the single
  list to extend.

---

## 3. FILES TO TOUCH (checklist)

Core:
- `packages/core/src/dashboard-scopes.ts` (new) + barrel export
- unit tests

API:
- `features/dashboard-layout/dashboard-layout.handler.ts` — chain-walk GET,
  `:scope` routes, scopes listing
- handler tests — resolution matrix (see acceptance)

Dashboard:
- `features/dashboard/builder/dashboard-builder-dialog.tsx` — scope switcher
- `features/dashboard/builder/api/dashboard-layout.api.ts` — scoped mutations
- `features/dashboard/hooks/use-dashboard-layout.ts` — read `scope` from the
  response (informational; e.g. for the builder badge)
- locale files

Docs:
- `docs/api-reference.md` — scoped endpoints + resolution order

---

## 4. ACCEPTANCE

1. Resolution matrix (handler tests, role injected via JWT claims override):

   | Stored rows | Caller role | GET returns scope |
   |---|---|---|
   | none | editor | `default` + `layout: null` |
   | `default` only | editor | `default` |
   | `role:editor` only | editor | `role:editor` |
   | both | editor | `role:editor` |
   | `role:editor` only | admin | `default` + `layout: null` (admin chain ignores editor scope) |

2. `PUT /dashboard-layout/role:editor` as admin → 200; as editor → 403;
   `PUT /dashboard-layout/role:ghost` → 400 problem.
3. Builder: switching scope with a dirty draft prompts; saving under
   `Editors` does not alter what an admin sees on `/`.
4. Bare `PUT/DELETE` still operate on `'default'` (regression test).
5. Build/lint/tests green across packages.

---

## 5. OPEN QUESTIONS (defaults inline)

- **Per-user dashboards?** Explicitly out of scope for the series (decision
  D1). The `scope` string would accommodate `user:<id>` later without
  migration — do not implement it.
- **Should editors get read access to `/scopes`?** *Default: no — it's builder
  furniture, admin-only.*
