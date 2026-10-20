# Architecture Finding — D1 compound-SELECT term limit

**Raised:** rework of Sprint 1 (`harness-foundation`), per review_report.md finding #1.
**File:** `apps/api/migrations/0000_v040_base.sql:538-548` (SuperAdmin `role_permissions` seed).

## Problem

The SuperAdmin permission seed uses a 7-way `UNION ALL` inside a `CROSS JOIN` subquery.
Real D1 (Cloudflare's SQLite backend) enforces `SQLITE_LIMIT_COMPOUND_SELECT` and rejects
this statement with `D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR`. The
`node:sqlite`-based `D1TestDatabase` shim used by the existing `forks` test tier does not
enforce this limit, so the defect was invisible until the new real-D1 integration harness
(`apps/api/vitest.workers.config.ts`, `applyD1Migrations`) ran the migration against actual
D1 and failed.

Reproduced independently during rework by reverting the migration to its original form and
re-running `pnpm --filter @beechcms/api test:integration`:

```
Error: D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR
 ❯ applyD1Migrations .../vitest-pool-workers/dist/worker/lib/cloudflare/test-internal.mjs:34:3
 ❯ test/harness/apply-migrations.ts:8:1
```

## What was done in this rework

Per review finding #1's required fix, the out-of-scope migration edit made during the
original execution pass was **reverted** on this branch (back to the 7-way `UNION ALL`
`CROSS JOIN`). This migration file is out of scope for Sprint 1
(SECTION 7 — OUT OF SCOPE item 11), so the fix is not applied here.

**Consequence:** the pilot suite
(`apps/api/src/features/content/test/integration/content-management.integration.test.ts`)
now fails against real D1 with the error above, because it seeds/queries roles via the
real migration files. This is expected and intentional — it is evidence of the underlying
defect, not a regression introduced by this rework.

## Recommended fix (for human/architect approval, not applied here)

Split the single `INSERT OR IGNORE ... SELECT ... CROSS JOIN (UNION ALL ...)` statement
into 7 separate `INSERT OR IGNORE INTO role_permissions (role_id, permission) SELECT r.id,
'<permission>' FROM roles r WHERE r.name = 'SuperAdmin';` statements — same end state, no
compound SELECT to hit the limit. (This is exactly the fix the original execution pass
applied unilaterally; it appears sound, but per the sprint's OUT OF SCOPE rule it requires
sign-off before landing, since it touches `apps/api/migrations/`.)

## Open question for the architect

Whether editing an already-merged migration file (`0000_v040_base.sql`, applied via
`applyD1Migrations` and never yet run against a production D1 instance) is acceptable
pre-release, or whether the fix must instead ship as a new forward migration.

## Resolution (Sprint 2 `slice-test-layout`, architect sign-off)

Applied: the base migration is edited in place, exactly as the "Recommended fix" section describes.

Rationale for editing `0000_v040_base.sql` rather than shipping a forward migration: both
`applyD1Migrations` (integration tier) and `wrangler d1 execute` (local bootstrap) replay migrations in
order and abort on `0000`, so a forward migration is never reached and cannot repair the failure. The
base migration has never been applied to a production D1 instance — the statement would have failed
there too. Existing local databases already carry the seeded rows and are unaffected (the ledger does
not re-apply `0000`); `pnpm beech db:reset` rebuilds from the corrected file.

Finding closed.
