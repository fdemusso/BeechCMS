# Verdict
PASS

# Findings
None blocking.

# Verification Evidence

Reviewed plan: `stages/01_sprint_planning/output/RbacDashboardDocs.md`. Executor made no commit, so the sprint lives in the working tree. `git diff devs...HEAD` is unusable here (734 files, it holds sprints 1–9 which are not in `devs`). I audited `git diff HEAD` instead: 15 `.md` files (+103/−161), exactly the 15 files of SECTION 3. Nothing from `docs/api/**`, `docs/.vitepress/**`, `reference/dashboard-layout.md`, `seed-builder.md`, `custom-widgets.md`, `dashboard-composer/01|02|05` was touched.

**SECTION 5 re-run (independent):**

| # | Command | Observed |
|---|---|---|
| 1 | `pnpm docs:check` | PASSED: 4672 links, 18 SDK imports, 37 CLI aliases, 66 sidebar links |
| 2 | `pnpm exec vitepress build docs` | First run FAILED: `ENOENT stat node_modules/vue` (dangling symlink -> `vue@3.5.39`, installed `vue@3.5.44`). Env drift, confirmed. I repointed the gitignored symlink to `vue@3.5.44`, re-ran: `build complete in 7.13s`, all pages rendered. Symlink restored to its original target afterwards. Executor's "BLOCKED" was real, not a skip. |
| 3 | legacy-model sweep (`git ls-files … xargs grep -nE …`) | No output (grep exit 1) |
| 4 | `grep manage_layout / manage_seeds / content:read` at `*` | Matches in all expected files (roles-permissions, first-project, mcp, mcp-server, mcp README) |
| 5 | `role:admin\|role:editor\|…` on 06 + 00-overview | 1 hit: the allowed Status sentence at `06:5`. 0 in 00-overview |
| 6 | `bundle-resources.mjs` then grep `resources/` | wrote 842 resources. ONE hit: `resources/api/@beechcms/core/variables/PERMISSIONS.md:20` (see Note A). `git ls-files packages/mcp/resources` = 0 tracked |
| 7 | `git diff --name-only \| grep -v '\.md$'` | `pnpm-lock.yaml` only (see Note B) |

**Fact audit against live code (doc claim -> source read):**
- Platform Gates rows and `analytics.md` table vs `PROTECTED_ROUTES` (`permission.middleware.ts:L64-175`): stats `total/breakdown/recent-activity` = AUTHED; `media-library`, `unused-media` = `content:read` global; `setup-checklist` = `manage_users` global; `health`, `cloudflare`, `POST storage/sync` = `view_analytics` global; `/api/seeds/*` x5 and `PUT/DELETE /api/schema/:slug/layout` = `manage_seeds` global; layout GET/roles/PUT/DELETE as documented. All nine routes present, order matches.
- `activityVisibility` (`stats.handler.ts`): global `content:read` -> all seeds, else readable seeds; `includeUnscoped` = `manage_users@*`. Matches docs.
- Owner-or-`manage_users@*` rule: `upload/index.ts` (download + delete) and `settings.handler.ts` orphan delete. Matches all four `media-engine.md` spots; route perms `content:read`/`content:delete` match.
- `JwtClaims` (`token-service.ts:L4-10`), `HookActor` (`hooks.ts:L9-12`), `AccountSummary` (`user.repository.ts:L26-33`, has `createdAt`), `actorFromContext` (`{id,email,name}`), `PermissionRoleGuard` JSDoc (`manage_seeds@*`), `harness.asUser` (token `{sub,email,name}`), canonical `grantSuperAdmin` admin=true/editor=false/viewer=false. All match the edited docs.
- Dashboard surfaces: `dashboard-page.tsx:25` `isDashboardLayoutEditor`, `settings-dialog.tsx:149` `canGlobally('manage_seeds')`, `use-entry-editor-dialog.tsx:241` same. Match the "Visible when" table.
- `PERMISSIONS` order (`permissions.ts`): 9 entries, `manage_layout`, `manage_seeds` last. Docs table matches.
- `dashboard-layout.md` error table confirms `409 layout-conflict` and `422 invalid-layout`/unknown role id. Anchors `#platform-gates` and `#last-global-administrator` exist.
- All five archived-plan folders linked from 06 exist under `docs/Sprints/`. `06` is 19 lines. 00-overview row 06 and D1 match 06.

**Invariant audit:** no source, test, migration or config file in the sprint diff, so no D1 bypass, hardcoded field name or cross-slice import is possible. SECTION 7 respected (checked file list above). Test audit: no test file in diff, §8 not applicable. Runtime verification: not applicable, no behaviour change (docs only); the rendered site build is the runtime check.

**Notes (non-blocking, for the human):**
- **A. Plan check 6 is unsatisfiable as written.** `PERMISSIONS.md` is typedoc output of the `permissions.ts` JSDoc, which sprint 7 wrote on purpose ("replaces the former developer axis (`users.role = 'admin'`) as a deliberate decision", brief rule 29). Both are SECTION 7 out-of-scope. The plan's own pre-computation claimed `docs/api` clean but only grepped `isDeveloper`/`canEditLayout`/`resolveDashboardScopeChain`, not `users.role`. Executor correctly left it and reported it. Not a code defect, not worth REWORK_PLAN. If the hit bothers you, reword that JSDoc sentence in a later sprint and run `pnpm docs:generate`.
- **B. `pnpm-lock.yaml` is modified (+48/−1).** It was already dirty in the initial git status before stage 02, and is not part of this sprint. Do not commit it with this work.
- **C. Env drift:** `node_modules/vue` dangling. `pnpm install` needed before anyone can build the site. I did not run it (would touch the lockfile).
- **D. Trivial residue outside the sweep:** `docs/public/images/confidential-data-pipeline.svg:66` still says "JWT Role verification". Generic marketing graphic, no `role` claim named. Left alone.
- **E.** Plan paths `dashboard-page.tsx` cited without `pages/` dir; no effect.

# Sprint Documentation
RbacDashboardDocs (ROADMAP 10, last of the series): docs-only sprint that brings published docs in line with the shipped RBAC dashboard model. 15 Markdown files edited, no code, test, migration or config touched.
- `manage/roles-permissions.md` now lists all 9 permissions, a "Global-only permissions" section (`manage_layout`, `manage_seeds` evaluated at `*` only; `manage_seeds` recorded as a deliberate decision in one sentence), a "Platform Gates" table of route requirements (stats, media, seed schema, dashboard layout) and a "Dashboard tabs and layout" subsection. The developer axis, Developer-account protection, `isDeveloper` and `requireAdmin` are gone from published docs and `packages/mcp/README.md`.
- Token and actor shapes copied from live types: `JwtClaims`, hook `actor` and the environments claims comment lose `role`; the `rbac-api.md` account sample matches `AccountSummary` + `assignments`; the MCP audit `actor` sample is `{id,email,name}`.
- Media access rule is now "uploader or `manage_users` at `*`" in all four `media-engine.md` places. `features/analytics.md` stands in for the removed `api-reference.md` and lists all nine stats routes with gates. MCP docs state `manage_seeds` at `*` for the `/api/seeds` gate and OAuth consent.
- `dashboard-composer/06` rewritten as a 19-line "superseded design" note; `00-overview` row 06 and D1 updated. Historical specs 01, 02, 05 intentionally keep the old role-scope design.
- Deviations: none from the plan's decisions. Limitation: `docs/api/**/PERMISSIONS.md` still quotes the sprint 7 JSDoc ("former developer axis (`users.role = 'admin'`)"), so the MCP resource bundle carries one legacy phrase. The site build needs `pnpm install` locally (stale `vue` symlink); it builds clean once the link is fixed.
