## 2026-11-21 — AgentEvals.md (stage 02 rejection)

1. **`@beechcms/testing` cannot be imported at runtime under Node.** `stack.ts` (T4) and `tasks.ts` (T9) rely on
   `CANONICAL_SEEDS` / `CANONICAL_USERS` from `@beechcms/testing`, run through `node src/cli.ts`. `packages/testing/dist/index.js`
   re-exports extensionless relative paths (`./harness`, `./seeds/canonical.seeds`), so Node ESM fails with
   `ERR_MODULE_NOT_FOUND ... packages/testing/dist/harness`. Playwright (e2e precedent) bundles it; plain Node does not.
   The plan must name a Node-loadable source for the canonical seeds and admin user (e.g. relative `.ts` imports of
   `packages/testing/src/seeds/canonical.*.ts`, if those load under type stripping) or inline fixtures.
2. **Preflight pointer `apps/dashboard/dist/index.html` does not exist.** The built dashboard lives under
   `apps/dashboard/dist/` with its entry under `admin/` (or no root `index.html`). T4 `preflight` must name the real file.
3. **Plan sections that need small corrections (not blocking):** `preflight` must be `async` (port check uses `fetch`,
   T4 says `void`); `startFreshStack(repoRoot)` has no stamp, so the `wrangler.log` path needs a defined source;
   `grants.test.ts` importing `packages/cli/src/lib/control-plane` breaks `tsc` (strict flags + `erasableSyntaxOnly`
   fire inside `packages/cli`), so the plan must define how type-check sees that constant.
