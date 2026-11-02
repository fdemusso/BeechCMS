# Sprint Plan — RbacDashboardDocs (ROADMAP entry 10)

Feature brief: `stages/00_ideation/output/feature_brief.md` (§4 "Fase 6. Documentazione").
Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 10, last entry of the series.
Previous sprints shipped: 1 `30473871`, 2 `b64a39d9`, 3 `185b13d1`, 4 `9e47d33c`, 5 `5441a90d`, 6 `26aa6880`,
7 `8a1cd718`, 8 `36100371`, 9 `88238d43` (+ `af94d465` regenerated `docs/api/`).

This sprint is documentation only. No source file, no test, no migration changes.

### Pre-Computation Analysis

**Graph freshness.** `graphify-out/` labels are dated 2026-11-02 10:12, after the last commit (`af94d465`, 01:33).
The graph indexes Markdown headings as `document` nodes, so the doc sections below are graph nodes.

**a) God Nodes (graphify CLI).**

| Node | Source | Degree | Why it matters here |
|---|---|---|---|
| `hasPermission()` | `packages/core/src/rbac/evaluate.ts:L64` | 16 | Every gate the docs describe resolves to it: dashboard audience, widget requirements, `isDashboardLayoutEditor`, `PermissionRoleGuard.arbitrate`, and the `rbac-api.md` "Authorization Layers" / `roles-permissions.md` "Invitation-Based Onboarding" doc nodes reference it. |
| `PERMISSIONS` | `packages/core/src/rbac/permissions.ts:L25` | — | The closed vocabulary. Already holds `manage_layout` and `manage_seeds`. Its JSDoc (L12–23) was already rewritten by sprint 7 as a deliberate decision (brief rule 29). Docs must match it. |
| `PROTECTED_ROUTES` | `apps/api/src/middleware/permission.middleware.ts:L64` | 1 | Single source for every route gate the docs tabulate. Only its containing file links to it, but it is the table every doc row copies. |
| `PermissionRoleGuard` | `packages/core/src/oauth/role-guard.ts:L63` | 7 | OAuth/MCP delegation now requires `manage_seeds@*` (JSDoc L51–62). The MCP docs still say `admin` role. |

**b) Architectural boundaries affected.**

- `@beechcms/core`: none. Read only, to verify the facts below.
- `apps/api`: none. Read only.
- `apps/dashboard`: none. Read only.
- Touched: `docs/**` (tracked Markdown) and `packages/mcp/README.md`.
- `packages/mcp/resources/**`, including `manifest.json`, is **generated and gitignored** (`packages/mcp/.gitignore:1`,
  `git ls-files packages/mcp/resources` = 0). `packages/mcp/scripts/bundle-resources.mjs` wipes it and copies `docs/{api,build,features,manage,reference}` plus
  `start/first-project.md`. The roadmap items `resources/manage/roles-permissions.md:202`,
  `resources/reference/dashboard-layout.md:12` and `manifest.json` (`canEditLayout`) are stale copies. They are fixed
  by editing the `docs/` source and regenerating. Never edit them by hand.
- `docs/api/**` is typedoc output, regenerated in `af94d465`. Verified clean: `JwtClaims.md` has 0 `role` mentions, and
  no file under `docs/api` names `canEditLayout`, `resolveDashboardScopeChain` or `isDeveloper`. Nothing to do.
- `docs/api-reference.md` (named by the brief and roadmap) **does not exist**. It was removed by `4ab5165e` (#379).
  The stats endpoint table it held now lives in `docs/features/analytics.md`. That file replaces it in this sprint.
- `docs/reference/dashboard-layout.md` is already current (sprints 2–6 kept it in step). It is the canonical reference
  for tab audiences and layout permissions. Other docs link to it rather than duplicating it.
- `docs/reference/seed-builder.md:3` and `docs/build/custom-widgets.md:93–109` are already current.

**c) `graphify affected` impact analysis.**

```
$ graphify affected "packages_core_src_rbac_permissions_permissions" --depth 2
- dashboard-layout.test.ts [imports] packages/core/src/dashboard-layout/dashboard-layout.test.ts:L7
- permissions.test.ts [imports] packages/core/src/rbac/permissions.test.ts:L5
$ graphify affected "docs_manage_roles_permissions_the_permission_vocabulary" --depth 2
No affected nodes found.
$ graphify affected "docs_manage_roles_permissions_roles_permissions" --depth 2
No affected nodes found.
$ graphify affected "docs_reference_rbac_api_rbac_administration_api" --depth 2
No affected nodes found.
$ graphify explain "mcp_readme_permission_model"
<-- @beechcms/mcp [contains] packages/mcp/README.md:L69   (degree 1)
```

Reading: the vocabulary's only reverse dependents are two core tests, and this sprint does not touch the vocabulary.
The doc nodes have no code dependents. A doc edit cannot break a build. The one runtime consumer of `docs/` is the MCP
resource bundle, and it is regenerated (T12). Inbound Markdown links are checked by `pnpm docs:check` §1.

**Drift sweep (tracked Markdown outside `docs/Sprints/` and `docs/api/`, plus `packages/mcp/README.md`).**
Each hit was checked against live code. Code facts are cited per task.

```
docs/manage/roles-permissions.md:19-40, 96-98, 202, 210-211, 217   vocabulary, "deliberately absent", developer axis,
                                                                    Data Models gate, Developer-account protection
docs/reference/rbac-api.md:75, 96, 304                              "role":"editor", users.role / requireAdmin prose
docs/reference/security-stack.md:39-46                              JwtClaims still lists role?: string
docs/reference/architecture.md:61                                   hook actor { id, role, email? }
docs/manage/environments.md:151                                     jwtPayload claims "(id, email, role)"
docs/reference/media-engine.md:126, 204, 236, 247                   owner-or-`admin`-role override
docs/features/analytics.md:26, 32-38                                no gates, missing routes, "admin user creation"
docs/start/first-project.md:142                                     System group lacks manage_layout/manage_seeds
docs/manage/content-editor.md:295-310                               "Administrator / Owner" persona table
docs/reference/mcp-server.md:354, 374, 400-406                      "admin JWT", "lacks the admin role", actor.role
docs/start/mcp.md:41                                                "account with the `admin` role" prerequisite
docs/testing.md:108                                                 asUser "with specified roles and claims"
packages/mcp/README.md:69-75, 83                                    requireAdmin gate, "admin role"
docs/Sprints/dashboard-composer/06-role-based-dashboards.md         superseded role:* scope design
docs/Sprints/dashboard-composer/00-overview.md:37, 56               index row + D1 decision describe role:* scopes
```

**Code facts used by the tasks (verified, cite them, do not re-research):**

| Fact | Source |
|---|---|
| Vocabulary = 9 permissions, `manage_layout` + `manage_seeds` last | `packages/core/src/rbac/permissions.ts:L25-35` |
| SuperAdmin widened by migrations `0039_manage_layout_permission.sql`, `0040_manage_seeds_permission.sql`; `users.role` dropped by `0041_drop_users_role.sql` | `apps/api/migrations/` |
| `POST /auth/setup` grants `SuperAdmin` (looked up by `SUPER_ADMIN_ROLE_NAME`) | `apps/api/src/features/setup/index.ts:L247` |
| Route gates: `stats/total`, `breakdown`, `recent-activity` = `AUTHED`; `media-library`, `unused-media` = `content:read@*`; `setup-checklist` = `manage_users@*`; `health`, `cloudflare`, `POST storage/sync` = `view_analytics@*` | `permission.middleware.ts` table, `:L114-125` |
| Activity rows with no seed (media, schema, security) need `manage_users@*` (`includeUnscoped`) | `apps/api/src/features/stats/stats.handler.ts:L73-81` |
| `setup-checklist` `adminExists` is always `true`: reaching the handler proves an active global admin | `stats.handler.ts:L194-196` |
| `/api/seeds/*` (all 5 methods) and `PUT`/`DELETE /api/schema/:slug/layout` = `manage_seeds@*`; `GET /api/schema` = `AUTHED` | `permission.middleware.ts:L82-91` |
| Dashboard layout rows: `GET` `AUTHED`; `GET /roles` `manage_roles@*`; `PUT` `anyScope(manage_layout, manage_roles)`; `DELETE` `manage_roles@*` | `permission.middleware.ts:L96-101` |
| Upload: `POST` `content:create@*`, `GET download-url` `content:read@*`, `DELETE` `content:delete@*`; handler adds owner-or-`manage_users@*` | `permission.middleware.ts:L173-175`; `apps/api/src/features/upload/index.ts:L269-272, L301-304` |
| Orphan delete: `content:delete@*` + same owner-or-`manage_users@*` rule | `apps/api/src/features/settings/settings.handler.ts:L419-421` |
| OAuth delegation requires `manage_seeds@*` | `packages/core/src/oauth/role-guard.ts:L51-62` |
| `JwtClaims` = `{ sub, email?, name?, surname?, [key]: unknown }` | `packages/core/src/auth/token-service.ts:L4-10` |
| `HookActor` = `{ id, email? }` | `packages/core/src/common/hooks.ts:L9-12` |
| Account view = `AccountSummary` (`id, email, name, surname, isActive, createdAt`) + `assignments` | `packages/core/src/auth/user.repository.ts:L26-33`; `apps/api/src/features/rbac/users.ts:L12` |
| MCP audit actor = `{ id, email, name }` | `apps/api/src/features/seeds/seeds.helpers.ts:L32-39` (`actorFromContext`) |
| Dashboard: Data Models = `canGlobally('manage_seeds')`; dashboard edit = core `isDashboardLayoutEditor`; entry-editor layout button = `canGlobally("manage_seeds")` | `settings-dialog.tsx:L149`; `dashboard-page.tsx:L25`; `use-entry-editor-dialog.tsx:L241` |
| Roles form System group order: `manage_users, manage_roles, manage_layout, manage_seeds, view_analytics` | `apps/dashboard/src/features/rbac/components/permission-groups.ts:L17-27` |
| Users tab active switch disabled only for self or while pending | `users-tab.tsx:L89` |
| Harness `asUser(CanonicalUserKey \| CanonicalUser)` issues `{ sub, email, name }` only; keys `admin`, `editor`, `viewer`; authority from `grantSuperAdmin` (SuperAdmin @ `*`) | `packages/testing/src/harness.ts:L80-86`; `seeds/canonical.data.ts:L7-49`; `seeds/provision.ts:L86` |

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

1. **Ruthless veto / YAGNI.** The brief §4 Phase 6 asks for this sprint. Every edit removes a statement that is now false,
   or adds a fact the shipped model needs (two permissions, the stats gates, the layout permissions). The plan writes no new
   guide, page or sidebar entry. Rejected during planning:
   - a new "dashboard RBAC" guide (`reference/dashboard-layout.md` already covers it; link to it);
   - documenting `/auth/setup` in `auth-endpoints.md` (it was never documented there; not a regression);
   - rewriting the historical sprint specs `dashboard-composer/01`, `02`, `05` (records of what was planned then).
   Only 06 is rewritten, because the brief names it and its design was replaced, not extended. The 00 index row and its
   D1 decision change with it, so the index does not point at a design that no longer exists.
2. **Botanical invariant.** No code, no D1 access, no field names. The docs describe gates that already go through
   `@beechcms/core` (`hasPermission`, `isDashboardLayoutEditor`, `PermissionRoleGuard`). No doc introduces a hardcoded
   field name or bypass.
3. **VSA.** Zero source imports change, so no cross-slice import is possible. The docs keep the shipped boundary: the
   dashboard slice reads roles through `GET /api/dashboard-layout/roles`, never through the `rbac` slice.
4. **Cloudflare purity.** No runtime, job or schema change. `0041` is only *cited*.
5. **Minimal blueprint.** 15 tracked Markdown files edited and 1 generated directory refreshed. No code tier is touched.

Verdict: **PASS**. No adjustment needed.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–9 changed the authorization model. Stats routes are now scope-projected, tabs are role-targeted, and
`manage_layout` and `manage_seeds` exist. `users.role`, the JWT `role` claim, `requireAdmin`, `isDeveloper` and the
Developer-account protection are gone. The docs still teach the old model, in several places as a security guarantee:
`roles-permissions.md:33` says `manage_seeds` "must never be added", and `mcp-server.md:374` tells agents to "authorize
with an admin account". An operator following them would look for an axis that no longer exists. The MCP server serves
the same text to agents as resources (`beechcms-docs://manage/roles-permissions.md`). This sprint is last because docs
can only describe what has shipped. Sprint 9 removed the last legacy reader and storage, so every statement can now be
checked against final code.

VSA and Botanical invariants hold trivially: no source changes. The docs are rewritten to state the invariants these
sprints enforced: the server gate is the authority and the UI hides as a courtesy (brief §1), per-seed isolation, the
closed vocabulary, and one evaluator (`@beechcms/core`) shared by API and dashboard.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

- **Docs pipeline.** `docs/` is a VitePress site (`docs/.vitepress/config.*`, `srcExclude: ['Sprints/**', 'personal/**',
  'examples/**', 'ci/**']`). `docs/Sprints/**` is therefore not published and not link-checked
  (`scripts/docs-fact-check.mjs` skips `Sprints`).
- **Fact-check.** `pnpm docs:check` (`scripts/docs-fact-check.mjs`) runs 4 checks: internal links, `@beechcms/client`
  imports, the CLI matrix vs `docs/build/cli-workflows.md`, and VitePress sidebar links. It does not check permission
  names. The grep sweep in SECTION 5 covers those.
- **MCP mirror.** `packages/mcp/package.json` `build` = `tsc --noEmit && node scripts/bundle-resources.mjs && esbuild …`.
  The bundle step is the only producer of `packages/mcp/resources/**` and `manifest.json`. The local copy now in the
  tree is stale and predates `af94d465` (`manifest.json:L741` still lists `canEditLayout.md`).
- **Generated API docs** (`docs/api/**`, `pnpm docs:generate` = `turbo run build && typedoc`): current as of `af94d465`.
- **Canonical layout reference.** `docs/reference/dashboard-layout.md` L1–179 already documents the single `default`
  layout, the permission table (L9–17), versioning and CAS (L19–28), per-caller projection (L30–41), and error codes
  (L144–179). Every other doc links to `/reference/dashboard-layout` instead of restating it.
- **Graph shape.** Doc headings are nodes (`docs_manage_roles_permissions_*`, `mcp_readme_permission_model`) with no
  reverse dependents (Pre-Computation c).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Edited (tracked):

1. `docs/manage/roles-permissions.md` (T1)
2. `docs/reference/rbac-api.md` (T2)
3. `docs/reference/security-stack.md` (T3)
4. `docs/reference/architecture.md` (T3)
5. `docs/manage/environments.md` (T3)
6. `docs/reference/media-engine.md` (T4)
7. `docs/features/analytics.md` (T5)
8. `docs/start/first-project.md` (T6)
9. `docs/manage/content-editor.md` (T6)
10. `docs/reference/mcp-server.md` (T7)
11. `packages/mcp/README.md` (T7)
12. `docs/start/mcp.md` (T7)
13. `docs/testing.md` (T8)
14. `docs/Sprints/dashboard-composer/06-role-based-dashboards.md` (T9, full rewrite)
15. `docs/Sprints/dashboard-composer/00-overview.md` (T9)

`stages/01_sprint_planning/output/backlog/ROADMAP.md` is **not** an executor deliverable (the planner already updated it).

Regenerated locally (gitignored, not committed): `packages/mcp/resources/**` + `manifest.json` (T10).

Excluded: any `.ts`/`.tsx`/`.sql`/`.json` source file, any test, `docs/api/**`, `docs/.vitepress/**`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**Writing rules for every task.** Match the voice of the file being edited: short declarative sentences, backticked
identifiers, tables for gates. Write `perm@scope` as `` `manage_seeds` at `*` `` or `` `manage_seeds@*` ``, matching
the notation already used in the same file (`roles-permissions.md` uses "at `*`"; `dashboard-layout.md` uses `@*`).
State the current model, not how it changed. Keep history to one sentence where the brief asks for it (T1). Never
mention sprint numbers in published docs.

### T1 — `docs/manage/roles-permissions.md`

Approach: edit in place, keeping the page structure. This page is the operator's model, so it gets the new permissions,
the platform gates and the dashboard surfaces. HTTP detail stays in the reference pages it links to.

1. **Vocabulary table (L19–27).** Append two rows after `view_analytics`, in `PERMISSIONS` order:
   - `manage_layout`: edit the content (sections, columns, widgets) of every dashboard tab. Global scope only.
   - `manage_seeds`: change the seed schema (Seed Builder, `/api/seeds/*`, entry-editor form layouts) and delegate
     schema access to OAuth/MCP clients. Global scope only.
2. **Replace L31–40** ("What is deliberately absent" + developer axis) with a subsection `### Global-only permissions`:
   - `manage_layout` and `manage_seeds` are evaluated only at `*`. A seed-scoped grant of either is representable but
     confers nothing, because the gates check `*` exactly.
   - `manage_seeds` is a deliberate decision. Schema mutation used to be reserved to the instance owner through a
     separate account flag. That flag no longer exists, and whoever holds `manage_seeds` (SuperAdmin by default) may
     change the schema. Anti-escalation still applies: nobody can grant a role carrying it without holding it at that
     scope. This is the one sentence of history (brief rule 29).
   - There is one authorization model. Authority comes only from active assignments. Neither the account record nor the
     access token carries a role.
3. **"One surface, one permission" (L42–44).** Keep. Append: `manage_layout` follows the rule for dashboard editing.
4. **New section `## Platform Gates`, placed after "The Trash reuses the CRUD vocabulary" (before `## Scopes`).**
   Lead with one sentence: the route gate in `PROTECTED_ROUTES` decides, and the dashboard only hides what the gate
   would refuse. Then one table (columns `Surface`, `Route(s)`, `Requirement`) with these rows, exactly:
   - Dashboard totals, breakdown, recent activity | `GET /api/content/stats/total`, `/breakdown`, `/recent-activity` |
     Any authenticated account. Counts and activity cover only seeds the caller may `content:read`. Activity not tied
     to a seed (media, schema, security) also needs `manage_users` at `*`. A caller with no read scope gets zeros and
     an empty feed, never an error.
   - Media library, unused media | `GET /api/content/stats/media-library`, `/unused-media` | `content:read` at `*`. A
     seed-scoped `content:read` is not enough.
   - Setup checklist | `GET /api/content/stats/setup-checklist` | `manage_users` at `*`.
   - Health, Cloudflare usage, storage resync | `GET …/stats/health`, `GET …/stats/cloudflare`, `POST …/stats/storage/sync` | `view_analytics` at `*`.
   - Media download and delete | `GET /api/upload/download-url/:key`, `DELETE /api/upload/:key`,
     `POST /api/settings/storage/orphans/delete` | The route permission at `*` (`content:read` / `content:delete`),
     plus: the uploader, or a holder of `manage_users` at `*`.
   - Seed schema | `/api/seeds/*`, `PUT`/`DELETE /api/schema/{slug}/layout` | `manage_seeds` at `*`.
   - Dashboard layout | `/api/dashboard-layout` | See the next subsection.
5. **New subsection `### Dashboard tabs and layout` (inside Platform Gates).** Five bullets, no table, then a link to
   [Dashboard Layout API](/reference/dashboard-layout):
   - One layout. Each tab may list target role **ids**. No list, or an empty one, means everyone. Otherwise a caller sees
     the tab when they hold at least one listed role through an active assignment, at any scope. A caller with several
     roles sees the union of their tabs.
   - The server filters before serving. Widgets on seeds the caller cannot read are dropped, and so are tabs or
     sections left with nothing usable. The layout is never the authority: data routes enforce RBAC on their own.
   - A role id that does not exist is refused at save (`422`). A role deleted later leaves an orphan id that grants
     nothing. No cleanup runs (fail-closed).
   - `manage_layout` at `*` edits the content of every tab. Structure (add, remove or reorder tabs, label/slug/icon,
     target roles), the first save and reset need `manage_roles` at `*`. That holder also sees every tab. Widgets an
     editor cannot use appear as opaque placeholders and are preserved on save.
   - Every write carries the version the editor loaded. A stale save is refused (`409 layout-conflict`) and the editor
     reloads.
6. **System roles (L94–98).** Keep L96. Replace "with the full permission set" so the text stays true:
   SuperAdmin carries every permission in the vocabulary, and the migrations that widen the vocabulary grant the new
   permission to SuperAdmin in the same step. Keep L98. Add: holding SuperAdmin from setup is the only thing that sets
   the first account apart.
7. **"In the Dashboard" (L192–202).** Replace L202 with a short table (`Surface`, `Visible when`) placed after the
   Access tabs table, or merge into it if the executor keeps one table. Rows:
   - **Data Models** (Seed Builder): `manage_seeds` at `*`.
   - **Edit dashboard** button: `manage_layout` or `manage_roles` at `*` (core `isDashboardLayoutEditor`).
   - **Entry-editor form layout** button: `manage_seeds` at `*`.
   L200's sentence ("the same `@beechcms/core` evaluator") already covers how. Do not repeat it.
8. **Users tab (L206–211).** L210: the switch is disabled only for your own row. Delete "and for the Developer account".
   Delete L211 entirely. Add after L210: no account is special. The only protection is the `last-global-admin` invariant
   (link to the System Invariants anchor on the same page).
9. **Roles tab (L215–217).** State the System group contents in form order: `manage_users`, `manage_roles`,
   `manage_layout`, `manage_seeds`, `view_analytics`.

Edge: after the edit, the page must contain zero matches for `users.role`, `requireAdmin`, `isDeveloper`,
`developer/owner axis`, `Developer account`, `must never be added`.

### T2 — `docs/reference/rbac-api.md`

Approach: three surgical edits. The rest of the page was verified against `PROTECTED_ROUTES` and the error map and is
correct.

- L73–76 JSON sample: remove `"role": "editor",`. Add `"createdAt": …` after `isActive` to match `AccountSummary`.
  Keep the existing `…` placeholder style.
- L96: replace with one paragraph. The account carries no authority of its own. Only an assignment confers any. The
  sole account created with authority is the first one, through `POST /auth/setup`, which receives `SuperAdmin` at
  `*`. No mention of `users.role` or `requireAdmin`.
- L304: `redeem()`: "create the account". Drop the parenthetical `(users.role = 'editor')`. The rest of the step is
  unchanged.

### T3 — Token and actor shapes

Approach: copy the live interfaces exactly. These snippets are what integrators type against.

- `docs/reference/security-stack.md` L38–46: the `JwtClaims` block loses `role?: string;`. Add one sentence after the
  block: the token identifies the account only, and authority is resolved from the account's assignments on every
  request (`resolveEffectivePermissions` in the permission middleware). So a role change takes effect without
  re-issuing tokens, and any extra claim a token carries is ignored.
- `docs/reference/architecture.md` L61: `actor`: the JWT-derived `{ id, email? }` context (`HookActor`).
- `docs/manage/environments.md` L151: comment becomes `// Authenticated user claims (sub, email, name, surname)`.

### T4 — `docs/reference/media-engine.md`

Approach: replace the `admin`-role override with the shipped rule in all four places, same wording each time.

- L126 (download URL) and L204 (delete): the caller must be the original uploader (`uploaded_by === userId`) or hold
  `manage_users` at the global scope (`*`). Others receive `403 Forbidden`. Keep the route-permission sentence if one
  exists nearby. If not, prefix: "Requires `content:read` at `*`" (L126) or "`content:delete` at `*`" (L204).
- L236: "A caller without `manage_users` at `*` may delete only their own uploads, …" (rest unchanged).
- L247 table cause: "The caller did not upload the file and does not hold `manage_users` at `*`."

### T5 — `docs/features/analytics.md` (stands in for the removed `docs/api-reference.md`)

Approach: this page owns the stats endpoint table, so the gates live here. One `Required` column and the missing rows.

- L26: "admin user creation" → "a global administrator (`manage_users` at `*`)". Reaching the endpoint already proves
  one exists.
- L32–38 table: add a `Required` column. Then list all nine stats routes from the code-facts table (Pre-Computation),
  in route-table order (`total`, `breakdown`, `recent-activity`, `media-library`, `unused-media`, `setup-checklist`,
  `health`, `cloudflare`, `POST storage/sync`), with one-line purposes. For the three new purpose lines, use the
  existing handler names in `stats.handler.ts` as the source.
- Add one sentence under the table: `total`, `breakdown` and `recent-activity` are scope-projected per caller (link
  `/manage/roles-permissions#platform-gates`).
- Leave the rest of the page (pipeline, examples) untouched.

### T6 — Onboarding and editor guides

- `docs/start/first-project.md` L142: System group becomes (`manage_users`, `manage_roles`, `manage_layout`,
  `manage_seeds`, `view_analytics`). Leave the rest of the walkthrough as it is.
- `docs/manage/content-editor.md` L295–306: rename the column `Administrator / Owner` to `Administrator` (no owner
  axis exists any more). No cell changes. Add one sentence after the table: the protected areas map to permissions an
  administrator can grant. Dashboard layout = `manage_layout` (content) or `manage_roles` (tabs); Seed & Branch
  Builder = `manage_seeds`. Link to [Roles & Permissions](/manage/roles-permissions). Do not map the
  "API Keys, Webhooks" row. Its gate is outside this feature.

### T7 — MCP docs

Approach: both MCP pages describe the same gate. Write it the same way in both.

- `docs/reference/mcp-server.md`
  - L354: "the dashboard admin JWT" → "the dashboard access JWT". After the paragraph, add: every `/api/seeds` route
    also requires `manage_seeds` at `*` from the route gate (`GET /api/schema` needs only authentication). The OAuth
    consent screen issues a grant only to an account holding `manage_seeds` at `*` (`PermissionRoleGuard`). A
    seed-scoped collaborator cannot mint an MCP token.
  - L374 row: Cause = "The account lacks `manage_seeds` at `*`, or the OAuth token's scope does not cover the route
    (e.g. `schema:read` calling `mcp-apply`)." Remediation = "Authorize with an account whose role carries
    `manage_seeds` at `*` (SuperAdmin does), or re-authorize with a wider `BEECH_OAUTH_SCOPE`."
  - L400–406 `actor` sample: `{ "id": "usr_admin_01", "email": "admin@example.com", "name": "Ada Admin" }`. `role`
    removed, `name` added (shape of `actorFromContext`).
- `docs/start/mcp.md` L41: prerequisite **Admin Account** becomes an account holding `manage_seeds` at `*`. The first
  account created at setup holds `SuperAdmin`, which carries it.
- `packages/mcp/README.md`
  - L69–75 "Permission model": every route sits behind `apiProtected` and the `manage_seeds`-at-`*` route gate on
    `/api/seeds/*`. The OAuth consent requires the same permission. Keep the known limitation, reworded: read-only tools
    (`beech_list_seeds`, `beech_get_seed`) need `manage_seeds` at `*` like the write tools, because the gate covers
    `/api/seeds/*` as a whole. The OAuth scope (`schema:read` / `schema:write`) is the only read/write split. Keep the
    Issue #328 sentence.
  - L83: `403` | "Account lacks `manage_seeds` at `*`" | "Ask an administrator for a role carrying `manage_seeds` at `*`".

### T8 — `docs/testing.md`

- L108: method signature `harness.asUser('admin' | 'editor' | 'viewer' | CanonicalUser, options?)`. Description:
  returns an authenticated `TestClient` with a token carrying only `sub`, `email` and `name`. Authority comes from the
  users' RBAC assignments, provisioned at seed time: a user with `grantSuperAdmin: true` gets `SuperAdmin` at `*`
  (`admin` does, `editor` and `viewer` do not). Supports `{ ttlSeconds }`.
- L155, 222, 282, 298 examples (`asUser('admin')`, `asUser('editor')`) stay valid. No change.

### T9 — Dashboard-composer series

- `docs/Sprints/dashboard-composer/06-role-based-dashboards.md`: **full rewrite**, ≤ 60 lines. Keep the filename (inbound
  links from 00, 02, 05). Title: `# Dashboard Composer — Sprint 06: Role-targeted Tabs (superseded design)`. Sections:
  1. *Status*: the original design (per-role layout scopes `role:admin` / `role:editor` resolved from the JWT `role`
     claim, a scope switcher in the builder) was not kept. It was replaced by a single `default` layout whose tabs carry
     target role ids. Rows stored under `role:*` are ignored.
  2. *Shipped model*: five bullets mirroring T1.5 (audience, server-side filtering, role-id validation and orphans,
     `manage_layout` / `manage_roles` split with locked placeholders, mandatory compare-and-swap).
  3. *Where to read more*: links to `../../reference/dashboard-layout.md`, `../../manage/roles-permissions.md`, and the
     archived plans `../DashboardTabAudienceApi/`, `../DashboardTabAudienceUi/`, `../WidgetPermissionRequirements/`,
     `../ManageLayoutPermissionApi/`, `../ManageLayoutPermissionUi/`.
  Drop the old sections 0–5 (role/ground rules, build list, current state, files, acceptance, open questions). No code
  blocks.
- `docs/Sprints/dashboard-composer/00-overview.md`:
  - L37 row: `[06 — Role-targeted Tabs](./06-role-based-dashboards.md)` | "Superseded. Per-role scopes replaced by one
    layout whose tabs carry target role ids; see the file."
  - L55–57 decision D1: "Sprint 02 ships a single `default` scope shared by everyone. Sprint 06 adds per-role scopes."
    becomes "There is a single `default` scope shared by everyone; tabs are targeted to roles inside it (Sprint 06)."
    Keep the rest of D1.
  - Leave 01, 02, 05 untouched (historical specs; SECTION 7).

### T10 — Regenerate the MCP resource bundle (local verification only)

Run `node packages/mcp/scripts/bundle-resources.mjs` after T1–T8. It wipes and rebuilds `packages/mcp/resources/` from
`docs/`. Do not commit the output (gitignored). This proves the stale copies named in the roadmap
(`resources/manage/roles-permissions.md:202`, `resources/reference/dashboard-layout.md:12`, `manifest.json`
`canEditLayout`) are gone and nothing in `docs/` reintroduces them.

### Tests

None. The sprint changes no executable code, so `_config/testing_conventions.md` imposes no test. The SECTION 5 sweep
and `pnpm docs:check` are the oracle.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root.

```bash
# 1. Docs fact-check: internal links (incl. new #platform-gates anchors), SDK imports, CLI matrix, sidebar
pnpm docs:check

# 2. Render the published site (catches broken Markdown/tables); docs/api is committed, so typedoc is not needed
pnpm exec vitepress build docs

# 3. Legacy-model sweep over published docs + MCP README: MUST print nothing
git ls-files docs packages/mcp/README.md \
  | grep -v '^docs/Sprints/' | grep -v '^docs/api/' \
  | xargs grep -nE "users\.role|requireAdmin|isDeveloper|canEditLayout|canEditDashboard|legacy-admin|resolveDashboardScopeChain|developer/owner axis|Developer account|must never be added|role\?: string|\{ id, role|lacks the .admin. role|lacks .admin. role|\"role\": \"(admin|editor)\"|the .admin. role|not an admin|email, role\)|specified roles and claims"

# 4. New permissions documented where operators look: each command MUST print a match
grep -n "manage_layout" docs/manage/roles-permissions.md docs/start/first-project.md
grep -n "manage_seeds"  docs/manage/roles-permissions.md docs/start/first-project.md docs/start/mcp.md docs/reference/mcp-server.md packages/mcp/README.md
grep -n "content:read\` at \`\*\`" docs/manage/roles-permissions.md

# 5. Superseded design no longer described as live in the series
grep -nE "role:admin|role:editor|KNOWN_DASHBOARD_ROLES|jwtPayload\.role" docs/Sprints/dashboard-composer/06-role-based-dashboards.md docs/Sprints/dashboard-composer/00-overview.md
#    allowed: only the single historical "Status" sentence in 06; zero in 00-overview

# 6. MCP bundle regenerated from docs and clean (local, gitignored)
node packages/mcp/scripts/bundle-resources.mjs
grep -rlE "canEditLayout|resolveDashboardScopeChain|isDeveloper|requireAdmin|users\.role" packages/mcp/resources   # MUST print nothing

# 7. No source changed
git diff --name-only | grep -vE '\.md$'   # MUST print nothing
```

`pnpm beech test` and `pnpm beech lint` are not required. No executable file changes, and check 7 proves it.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `docs/manage/roles-permissions.md` lists all 9 permissions in `PERMISSIONS` order. It states that `manage_layout`
      and `manage_seeds` are global-only and records `manage_seeds` as a deliberate decision, in one historical sentence.
- [ ] It has a Platform Gates table whose rows match `PROTECTED_ROUTES` for stats, media, seeds/schema-layout and
      dashboard layout. It has a tab-audience subsection linking to `/reference/dashboard-layout`.
- [ ] The Developer-account protection, the developer axis, `isDeveloper` and `requireAdmin` appear nowhere in published
      docs or `packages/mcp/README.md` (sweep 3 empty).
- [ ] `rbac-api.md` account sample matches `AccountSummary` + `assignments` (no `role`, has `createdAt`).
- [ ] `security-stack.md` `JwtClaims`, `architecture.md` hook actor and `environments.md` claims comment match
      `token-service.ts:L4-10` and `hooks.ts:L9-12`.
- [ ] `media-engine.md` states the owner-or-`manage_users@*` rule in all four places.
- [ ] `features/analytics.md` lists all nine stats routes with their gates.
- [ ] MCP docs (`mcp-server.md`, `packages/mcp/README.md`, `start/mcp.md`) state `manage_seeds@*` for the route gate and OAuth consent, and the actor sample has no `role`.
- [ ] `testing.md` `asUser` row matches `harness.ts` (keys `admin`/`editor`/`viewer`, claims `sub`/`email`/`name`,
      authority from `grantSuperAdmin`).
- [ ] `06-role-based-dashboards.md` is ≤ 60 lines and marked superseded, and `00-overview.md` row 06 and decision D1
      match it.
- [ ] `pnpm docs:check` passes. `vitepress build docs` succeeds.
- [ ] Regenerated `packages/mcp/resources` holds no legacy term (check 6). Nothing under it is committed.
- [ ] `git diff --name-only` lists only `.md` files from SECTION 3.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT touch the following:

- **Any source, test, migration or config file.** This includes `packages/core/src/rbac/permissions.ts` (JSDoc
  already rewritten in sprint 7), `role-guard.ts`, the route table, `worker-configuration.d.ts`, and every
  `.ts`/`.tsx`/`.sql`/`.json` file.
- **Generated output.** Do not hand-edit `docs/api/**` (typedoc, current since `af94d465`; do not regenerate either),
  `packages/mcp/resources/**`, `manifest.json` (regenerate in T10, never commit), or `docs/.vitepress/dist/**`.
- **Historical records.** `docs/Sprints/**` except the two dashboard-composer files in T9. This covers
  `dashboard-composer/01`, `02`, `05` (they still mention `canEditLayout`, `role:admin`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD`
  as the plan of their time) and every archived sprint folder.
- **Not added:** no new docs page, no sidebar entry, no `/auth/setup` section in `auth-endpoints.md`, no permission
  mapping for API keys/webhooks in `content-editor.md`, no change to the `setup/index.ts` `isDeveloper` env flag or its
  docs (brief §2).
- **Already current, leave as is:** `docs/reference/dashboard-layout.md`, `docs/reference/seed-builder.md`,
  `docs/build/custom-widgets.md`, `docs/features/media-engine.md` (its "ownership and role-based access control" phrase
  stays true), `README.md`.
- **Pipeline bookkeeping.** `stages/**` and `ROADMAP.md`. The planner updated the roadmap. The executor records its
  run in its own stage output.
