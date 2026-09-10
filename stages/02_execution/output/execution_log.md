# Execution Log — `RbacInvitations`

## SECTION 6 — ACCEPTANCE CRITERIA

**Contracts & typing**
- [x] `packages/core/src/rbac/invitation.repository.ts` contains ONLY types and `IInvitationRepository` — no runtime code, no import outside `./permissions.js`, no D1/CF type reference.
- [x] `packages/core` builds clean (`tsc`, exit 0); exported from `src/index.ts`.
- [x] `apps/api` `tsc --noEmit` error count still 32 (pre-existing baseline), zero errors in any file this sprint touches.
- [x] `apps/dashboard` `tsc --noEmit` exits 0; no dashboard file in the diff.
- [x] No `any` in new code; repository return types are the core-declared ones.

**Schema**
- [x] `invitations` added as an EDIT to `0000_v040_base.sql` (section 21). No new migration file, no `ALTER TABLE`.
- [x] FKs to `roles(id)` and `users(id)` with `ON DELETE CASCADE`, no FK on `scope`, 3 indexes present.
- [x] `pnpm beech db:reset` path exercised via `D1TestDatabase` in every test; full API suite passes.

**Invariants**
- [x] `D1InvitationRepository` does not extend `BaseD1Repository`, no `content_{slug}` query.
- [x] No `invitations` column name outside `d1-invitation.repository.ts`.
- [x] `features/rbac/` imports no other `features/*` slice (grep gate prints nothing).
- [x] `manage_seeds` still absent from `PERMISSIONS` / CHECK list.
- [x] Redeemed accounts get `users.role = 'editor'`; asserted in e2e test.

**Token handling**
- [x] Token produced only by `generateOpaqueToken()`; no `randomUUID`/`getRandomValues` in touched files.
- [x] Only `sha256hex(token)` persisted; repository test asserts stored value ≠ plaintext.
- [x] Plaintext token appears only in the dispatched email; admin responses never contain it (grep gate).
- [x] `markUsed` atomic (`WHERE used_at IS NULL`), false on 2nd call; accept handler consumes before creating the account.
- [x] Both public endpoints rate-limit by IP via `rateLimiters.getLimiter('acceptInvitation')`, 429 + `Retry-After`.

**Authorization**
- [x] All 4 admin routes carry a `PROTECTED_ROUTES` row (`anyScope('manage_users')`); public routes not added.
- [x] Issue applies `hasPermission` + `canGrant`, identical to `createAssignmentHandler`.
- [x] Redemption re-evaluates issuer's live authority, refuses `409 invitation-revoked` (asserted e2e).
- [x] Redemption refuses `422 unknown-scope` when the seed is gone.
- [x] Unknown/expired/used tokens all answer `404 invitation-invalid` on both public endpoints.
- [x] `GET /invitations` scope-filtered; `DELETE` outside perimeter → 404, not 403.
- [x] Email-taken refused at issue AND at redemption.

**Lifecycle**
- [x] Regeneration preserves email/role/scope, swaps token+expiry, refuses `409` on a used row.
- [x] `invalidatePending` consumes prior pending invites for the address.

**Build & suite**
- [x] `pnpm lint` — 12/12 tasks pass.
- [x] `pnpm beech test` — all packages pass except the documented `@beechcms/mcp` flake (verified green in isolation).
- [x] `flow-rbac-invitations.test.ts` covers full lifecycle: issue → preview → accept → login → scope isolation → single-use replay → issuer revocation → expiry → regenerate.
- [ ] Mailpit manual delivery check — NOT RUN (requires `pnpm beech dev` interactive stack; out of scope for this automated pass).

## Validation command output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit | grep -c "error TS"
32   (unchanged baseline)

$ cd apps/dashboard && npx tsc --noEmit
(exit 0, no output)

$ grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\|password-reset\|setup\)" apps/api/src/features/rbac
(no output)

$ grep -rn "manage_seeds" packages/core apps/api
(only comments/tests — unchanged)

$ grep -rn "randomUUID\|getRandomValues" apps/api/src/features/rbac apps/api/src/shared/db/repositories/d1-invitation.repository.ts
(no output)

$ grep -rn "token" apps/api/src/features/rbac/invitations.ts
(only tokenHash / generateOpaqueToken / dispatch args — never in context.json)

$ cd apps/api && npx vitest run src/features/rbac src/shared/db/repositories/d1-invitation.repository.test.ts src/middleware/permission.middleware.test.ts test/flow-rbac-invitations.test.ts test/flow-rbac-admin.test.ts test/flow-rbac-enforcement.test.ts
Test Files  9 passed (9)
     Tests  40 passed (40)

$ pnpm --filter @beechcms/core test
Test Files  37 passed (37)
     Tests  659 passed (659)

$ pnpm lint
Tasks: 12 successful, 12 total

$ pnpm --filter @beechcms/api test
Test Files  146 passed (146)
     Tests  1596 passed (1596)

$ pnpm beech test
All packages pass except @beechcms/mcp#test (documented pre-existing flake:
Bundle hash and supervisor change detection > ... restarts child server while keeping client connected)

$ cd packages/mcp && npx vitest run src/auto-restart.test.ts
Test Files  1 passed (1)
     Tests  3 passed (3)
(confirms the flake, green in isolation)

$ graphify update .
Graph has 12276 nodes, 21699 edges, 985 communities. Synced.
```
