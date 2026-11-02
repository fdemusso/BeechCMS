# Execution Log — RbacDashboardDocs

## SECTION 6 — Acceptance Criteria

- [x] `roles-permissions.md` lists all 9 permissions in `PERMISSIONS` order; `manage_layout` / `manage_seeds` global-only; `manage_seeds` recorded as deliberate decision in one historical sentence.
- [x] Platform Gates table (stats, media, seeds/schema-layout, dashboard layout) + `Dashboard tabs and layout` subsection linking `/reference/dashboard-layout`.
- [x] Developer-account protection, developer axis, `isDeveloper`, `requireAdmin` gone from published docs and `packages/mcp/README.md` (sweep 3 empty).
- [x] `rbac-api.md` account sample matches `AccountSummary` + `assignments` (no `role`, has `createdAt`).
- [x] `security-stack.md` `JwtClaims`, `architecture.md` hook actor, `environments.md` claims comment match `token-service.ts:L4-10` / `hooks.ts:L9-12`.
- [x] `media-engine.md` states owner-or-`manage_users@*` rule in all four places.
- [x] `features/analytics.md` lists all nine stats routes with gates.
- [x] MCP docs (`mcp-server.md`, `packages/mcp/README.md`, `start/mcp.md`) state `manage_seeds@*` for route gate and OAuth consent; actor sample has no `role`.
- [x] `testing.md` `asUser` row matches `harness.ts`.
- [x] `06-role-based-dashboards.md` is 19 lines, marked superseded; `00-overview.md` row 06 and D1 match.
- [x] `pnpm docs:check` passes.
- [ ] `vitepress build docs` — BLOCKED: `node_modules/vue` is a dangling symlink (-> `vue@3.5.39`, installed `vue@3.5.44`). Env drift, needs `pnpm install`. Not run.
- [~] Regenerated `packages/mcp/resources` — one hit: `api/@beechcms/core/variables/PERMISSIONS.md:20` ("former developer axis (`users.role = 'admin'`)"). Source is the `permissions.ts` JSDoc (sprint 7, deliberate, brief rule 29) via `docs/api/**`. Both out of scope (SECTION 7). Nothing committed under `resources/`.
- [~] `git diff --name-only` non-`.md`: `pnpm-lock.yaml` only — modified before this run (present in initial git status), not touched by this stage.

## Validation output

```
$ pnpm docs:check
✓ All 4672 internal links are valid and resolve to existing pages or assets.
✓ Verified 18 SDK imports across framework guides against actual compiled exports.
✓ All 37 CLI command aliases in bin/cli.mjs are documented in cli-workflows.md.
✓ All 66 sidebar navigation links resolve to valid markdown files.
✔ DOCUMENTATION FACT-CHECK PASSED

$ sweep 3 (legacy-model grep)         -> no output
$ grep manage_layout / manage_seeds / content:read` at `*`   -> matches in all expected files
$ sweep 5 (role:admin|role:editor…)    -> 1 hit: the allowed Status sentence in 06; 0 in 00-overview
$ node packages/mcp/scripts/bundle-resources.mjs -> wrote 842 resources
$ graphify update .                    -> 18358 nodes, 42494 edges, 1035 communities
```

Branch: stayed on `feature/legacy-role-axis-removal` (user decision; sprints 1–9 not in `devs`). No commit made.
