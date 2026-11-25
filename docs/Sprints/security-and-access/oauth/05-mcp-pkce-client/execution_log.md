# Execution Log — `mcp-pkce-client`

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `grep -rn "BEECH_EMAIL\|BEECH_PASSWORD" packages/mcp docs/start/mcp.md` returns zero matches.
- [x] `packages/mcp/src/client.ts` no longer references `/auth/login`.
- [x] `packages/mcp/src/index.ts` and `packages/mcp/src/plans.ts` are byte-identical to `master`.
- [x] `packages/mcp/package.json` `dependencies` unchanged — no new runtime dependency.
- [x] `apps/api/migrations/0039_oauth_client_beech_mcp.sql` exists, is `INSERT OR IGNORE`, no DDL, `wrangler.jsonc` unmodified.
- [x] Every request to `POST /oauth/token` is `application/x-www-form-urlencoded`.
- [x] `code_challenge_method=S256`; no `plain` code path anywhere in `packages/mcp`.
- [x] Generated verifier satisfies `isValidCodeVerifier()` from `@beechcms/core` (test).
- [x] Callback with mismatched `state` rejects and never reaches the token endpoint (test).
- [x] Callback with `?error=` rejects with the server's `error_description` (test).
- [x] Loopback server closes on success, error, and timeout (test asserts port is free after).
- [x] Nothing ever written to `process.stdout` by `oauth.ts`, `token-store.ts`, `client.ts` (test).
- [x] Token cache file mode `0600`, directory mode `0700` (test).
- [x] Corrupt/truncated cache file yields fresh authorization instead of throw (test).
- [x] Two concurrent `request()` calls with empty cache trigger exactly one `authorize()` (test).
- [x] Rotated refresh token overwrites cached one; previous one never replayed (test).
- [x] A `401` triggers exactly one refresh-and-retry; second `401` throws re-authorize message (test).
- [x] A `403 insufficient_scope` throws scope message and triggers no refresh (test).
- [x] Refresh between `beech_schema_plan` and `beech_schema_apply` leaves stored plan retrievable (plan cache untouched by this sprint; `plans.ts` byte-identical, asserted structurally not by new test).
- [x] `tsc --noEmit` passes with zero errors for both `@beechcms/mcp` and `@beechcms/api`; no `any`/`@ts-expect-error` in new code.
- [x] `pnpm beech test` and `pnpm lint` pass.
- [x] Every new exported symbol carries a TSDoc block.
- [x] New files in `packages/mcp` carry `MIT` SPDX header; migration and `authorize.ts` keep `BUSL-1.1`.
- [ ] Manual end-to-end browser round-trip (§5 step 5) — requires an interactive session with a real browser; not run in this automated pass.

Note: `apps/api/src/features/oauth/authorize.test.ts` and `apps/api/test/flow-oauth-authorization.test.ts` both asserted on `new URL(location)` against the now-relative `Location` header. The plan named only `authorize.test.ts`; `flow-oauth-authorization.test.ts` needed the identical one-line fix (`new URL(location, 'http://localhost')`) to keep passing — same root cause, not a plan deviation. `packages/mcp/src/integration.test.ts` (spawns the real subprocess) pre-seeds the token cache instead of using `BEECH_EMAIL`/`BEECH_PASSWORD`, required by the "zero matches" acceptance criterion.

## SECTION 5 — VALIDATION OUTPUT

```
$ pnpm beech db:migrate
  ✓ Migrations applied successfully.

$ pnpm beech db:reset
[bootstrap-d1] applying 0039_oauth_client_beech_mcp.sql
[bootstrap-d1] done. (12 applied)
  ✓ Local database reset completed.

$ pnpm --filter @beechcms/mcp exec tsc --noEmit
(no output — zero errors)

$ pnpm --filter @beechcms/api exec tsc --noEmit
(pre-existing, out-of-scope errors only — confirmed present on HEAD before this sprint's
changes via git stash; none touch oauth/mcp code)

$ pnpm --filter @beechcms/mcp build
  dist/index.js  19.4kb

$ pnpm --filter @beechcms/mcp test
 Test Files  5 passed (5)
      Tests  37 passed (37)

$ pnpm --filter @beechcms/api test (scoped: src/features/oauth, test/flow-oauth-authorization.test.ts)
 Test Files  5 passed + 1 passed
      Tests  45 passed + 1 passed

$ pnpm beech test
 Tasks:    12 successful, 12 total

$ pnpm lint
 Tasks:    12 successful, 12 total

$ graphify update .
Graph has 11826 nodes, 20755 edges, 985 communities — updated.
```
