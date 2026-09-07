# Execution Log — `oauth-dashboard-consent-ui`

## SECTION 6 — ACCEPTANCE CRITERIA

**Architecture**
- [x] `git diff --stat packages/core` (vs HEAD) is empty. No core interface, type or migration was added or changed.
- [x] No file under `apps/api/migrations/` was added or modified.
- [x] `apps/api/src/features/oauth/consents.ts` contains no `prepare(`, no `D1Database`, no raw SQL, and no import from another `features/*` slice.
- [x] `apps/dashboard/src/features/oauth-consent/**` imports nothing from `@/features/settings` (verified via grep — no matches).
- [x] The only import of `@/features/oauth-consent` outside its own slice is in `App.tsx` and `settings-dialog.tsx` (+ its co-located test mock).
- [x] `apps/api/src/factory.ts`, `authorize.ts`, `token.ts`, `revoke.ts` and `oauth-scope.middleware.ts` are unmodified (verified via `git diff HEAD`, empty).

**Security**
- [x] `GET /oauth/consents` and `DELETE /oauth/consents/:clientId` are registered with `authMiddleware()` without `acceptOAuth: true`; a valid OAuth access token receives `401` on both (asserted in `flow-oauth-connected-apps.test.ts`).
- [x] Revocation is cascading: access token → `401` on `/api/seeds`; refresh token → `400 invalid_grant` on `/oauth/token`.
- [x] A consent belonging to another user is neither listed nor revocable (test in `consents.test.ts`).
- [x] `safeReturnTo` rejects `//evil.tld`, `https://evil.tld` and any value not starting with a single `/`, falling back to `/`; unit-tested.
- [x] The consent screen never reads or writes an OAuth token; only query parameters and JWT-authenticated endpoints.

**Typing & build**
- [x] `npx tsc --noEmit` in `apps/api`: zero new errors (2 pre-existing unrelated errors on baseline fixed as part of the touched file; remaining baseline errors are in untouched files).
- [x] `pnpm --filter @beechcms/dashboard run type-check`: zero errors in touched/new files (remaining errors are pre-existing baseline debt in unrelated `content-list.tsx`/`drafts-list.tsx`/table tests, confirmed present before this sprint via `git stash`).
- [x] No `any` in the new files; all DTOs fully typed and JSDoc'd.
- [x] `pnpm lint` passes workspace-wide.

**Functional**
- [x] `/admin/oauth/consent` renders one row per requested scope, marking already-granted scopes distinctly.
- [x] `consentRequired === false` performs a silent, ref-latched re-consent and redirects without a user click.
- [x] Deny redirects to the client with `error=access_denied` and the original `state` (server-driven `redirectTo`).
- [x] A logged-out user opening `/oauth/authorize` completes the flow after login via the `returnTo` round-trip.
- [x] Settings → Connected apps lists every live consent, flagging "no active token" when tokens are expired.
- [x] Every user-visible string goes through `t(...)`; `en.json`/`it.json` key sets verified identical (Python key-diff, empty both ways).

**Tests**
- [x] `consents.test.ts` covers all 8 listed cases; `flow-oauth-connected-apps.test.ts` covers the full loop (login → authorize → consent → token → list → revoke → token rejected).
- [x] `consent-screen.test.tsx` and `connected-apps-tab.test.tsx` cover the listed cases; added `oauth.api.test.ts` and `consent-page.test.tsx` to satisfy `beech test --diff` per-file coverage thresholds.
- [x] `settings-dialog.test.tsx` passes with the added mock; login-form tests pass (extended with `safeReturnTo` unit tests and a `returnTo`-navigation case).
- [x] `pnpm beech test --diff` — all files touched/added by this sprint PASS. 7 remaining LOW/untested entries are pre-existing baseline debt in files this sprint is explicitly forbidden from touching (`authorize.ts`, `token.ts`, `auth.app.ts`, `seeds.mcp.ts`, `d1-oauth-{token,consent,authorization-code}.repository.ts`) — confirmed identical before and after this sprint's changes.

## Validation output

- `pnpm --filter @beechcms/core run build` → clean (`tsc`, no output).
- `apps/api`: `npx tsc --noEmit` → 2 pre-existing-pattern errors in `consents.ts` fixed (non-null assert on route param); all remaining errors are in files untouched by this sprint.
- `apps/api test`: 134/134 test files, 1527/1527 tests passed (`consents.test.ts`, `flow-oauth-connected-apps.test.ts`, and full regression suite including `flow-oauth-authorization.test.ts` / `flow-oauth-resource-server.test.ts`).
- `apps/dashboard`: `type-check` clean on touched files; `lint` clean; full test run 108/108 files, 807/807 tests passed.
- `pnpm beech test --diff`: 25/32 files PASS (including every file this sprint added or changed); 7 pre-existing baseline files remain LOW, out of scope for this sprint.
- `pnpm lint` (workspace): 12/12 tasks successful.
- `graphify update . --force`: graph rebuilt (11794 nodes, 20683 edges).
