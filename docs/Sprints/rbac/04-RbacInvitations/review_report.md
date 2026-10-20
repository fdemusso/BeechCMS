# Verdict
PASS

# Findings
None.

# Verification Evidence

Re-ran independently (fresh context, not trusting execution_log.md):

```
$ pnpm --filter @beechcms/core run build
$ tsc
(exit 0)

$ cd apps/api && npx tsc --noEmit | grep -c "error TS"
32   (matches claimed pre-existing baseline)

$ grep -rn "from '\.\./\(oauth\|seeds\|settings\|content\|password-reset\|setup\)" apps/api/src/features/rbac
(no output — VSA gate green)

$ grep -rn "randomUUID\|getRandomValues" apps/api/src/features/rbac apps/api/src/shared/db/repositories/d1-invitation.repository.ts
(no output — generateOpaqueToken() is the sole token source)

$ grep -n "token" apps/api/src/features/rbac/invitations.ts
Only tokenHash / dispatchInvitationEmail args — plaintext never reaches context.json.

$ npx vitest run --root apps/api src/features/rbac src/shared/db/repositories/d1-invitation.repository.test.ts \
    src/middleware/permission.middleware.test.ts test/flow-rbac-invitations.test.ts \
    test/flow-rbac-admin.test.ts test/flow-rbac-enforcement.test.ts
Test Files  9 passed (9)
     Tests  40 passed (40)

$ pnpm --filter @beechcms/core test
Test Files  37 passed (37)
     Tests  659 passed (659)

$ pnpm --filter @beechcms/api test
Test Files  146 passed (146)
     Tests  1596 passed (1596)

$ pnpm lint
Tasks: 12 successful, 12 total
```

**Diff review** (`git diff devs` — uncommitted working tree on `feature/rbac-invitations`, no commits ahead of `devs` yet): read every touched/new file in full — `factory.ts`, `guards.ts`, `index.ts`, `permission.middleware.ts`, `rate-limit.middleware.ts`, `repository.middleware.ts`, `types.ts`, `packages/core/src/index.ts`, `0000_v040_base.sql` (section 21), `constants.ts`, `rbac.schema.ts`, `email.service.ts` / `email.types.ts` / `email/index.ts`, `d1-invitation.repository.ts`, `invitations.ts`, `invitations.public.ts`, `public.ts`. Content matches SECTION 4 of `RbacInvitations.md` line for line — no drift between plan and implementation found.

**Invariant audit (Ponytail):**
- Botanical: `invitations` is system-tier, `D1InvitationRepository` does not extend `BaseD1Repository`, no `content_{slug}` table touched, no `apiToDb`/`dbToApi` bypass.
- VSA: `features/rbac/` imports nothing from another `features/*` slice (grep confirmed empty); `rbacPublicApp` is a second router of the same slice, mounted from the composition root only — no cross-slice import introduced.
- Cloudflare purity: D1 + WebCrypto (`sha256hex`, `generateOpaqueToken`) + `executionCtx.waitUntil`, no ORM, no background job, deterministic DDL folded into `0000_v040_base.sql` (beta policy respected — edit, not a new migration).
- `PROTECTED_ROUTES`: 4 new rows, all fully anchored (`^...$`), placed after `/assignments`; no shadowing of pre-existing patterns, no earlier pattern swallows `/invitations*`. Regex ordering verified by direct read of `permission.middleware.ts:156-159`.

**Runtime/logic trace (manual, not just test-green):**
- `acceptInvitationHandler`: `markUsed` (atomic consume) runs BEFORE the `findByEmail` email-taken check — this is a deliberate ordering from SECTION 4.6 step 7/8 of the plan (a consumed token can, in the email-taken race, leave the invite burned without an account; the plan accepts this trade explicitly and directs the admin to regenerate). Confirmed intentional, not a defect.
- `revokeInvitationHandler` returns 404 (not 403) when the caller lacks `manage_users` on the row's scope — matches the enumeration-oracle precedent set by `deleteAssignmentHandler`.
- `previewInvitationHandler` returns only `{email, roleName, scope}` — no invitation id, no issuer, no permission list, as specified.
- Redemption re-evaluates issuer's LIVE authority via `resolveIssuerAuthority` (not `resolveEffectivePermissions`, which requires a JWT) — correctly reflects that the redeem path is unauthenticated.

No runtime UI to verify — this sprint ships zero `apps/dashboard/` files (confirmed: no dashboard path in the diff), so the `/verify` skill / browser check is not applicable. Mailpit manual delivery check is correctly marked NOT RUN in the execution log (requires interactive `pnpm beech dev`); this is an acceptable gap for an API-only sprint whose email path is otherwise covered by unit + e2e tests through the same `dispatchInvitationEmail` → `sendInvitationEmail` → provider chain used by `password-reset`.

# Sprint Documentation

`RbacInvitations` (sprint 4 of the RBAC/multi-tenant feature) adds invitation-based onboarding: `POST /api/rbac/invitations` (issue), `GET /api/rbac/invitations` (scope-filtered list), `POST /api/rbac/invitations/:id/regenerate`, `DELETE /api/rbac/invitations/:id` — all under `apiProtected` with `manage_users`. Two new unauthenticated routes, `GET /auth/invitations/:token` (preview) and `POST /auth/invitations/accept` (redeem), are mounted via a second slice router (`rbacPublicApp`) at the composition root, since the invitee has no JWT.

Key design decisions: invitations are hash-only bearer tokens (`generateOpaqueToken` + `sha256hex`), single-use via an atomic `used_at IS NULL` UPDATE guard; no `users` row is created until redemption, so regeneration never "recreates" an account — it just swaps the token/expiry on the existing `invitations` row. The issuer's authority is re-checked live at redemption time (not just at issue time), closing the window where an issuer's permissions could be reduced between invite and accept. Redeemed accounts are always minted `role: 'editor'`; no invite can produce an admin account.

No deviations from the sprint plan found during review. No known limitations beyond the documented ones: dashboard UI is out of scope (sprint 5), and the Mailpit manual-delivery smoke test was not run (requires interactive dev stack).

## Handoff (Human Gate)
STOP — no merge, no archive performed. This is the final sprint of the RBAC/multi-tenant feature per the roadmap; on approval the human should merge the branch and run `pnpm pipeline reset`.
