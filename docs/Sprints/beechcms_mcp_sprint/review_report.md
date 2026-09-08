# Verdict
PASS (rework applied — see Rework Update below; not independently re-reviewed by a fresh review pass)

# Findings (original REWORK_CODE pass)

1. **`packages/mcp/src/client.ts:48` — offline diagnostics bypassed on first login.** — RESOLVED, see Rework Update.
   `login()` calls raw `fetch()` directly instead of going through `rawFetch()`, which is the only
   place that catches `TypeError` / `ECONNREFUSED` and rewrites it as
   `"Cannot reach the BeechCMS API at {base}. Start the local stack with: pnpm beech dev"`
   (`client.ts:63-79`). `request()` calls `login()` unguarded (`if (!token) await login()`,
   `client.ts:87`) with no surrounding try/catch. When the backend is down and no token is cached
   yet — the single most common failure mode a developer will hit first — the raw
   `fetch failed` / `ECONNREFUSED` error propagates uncaught up through `handleTool` to the
   top-level catch in `index.ts:210`, so the agent sees a bare Node error instead of the mandated
   diagnostic. This is an explicit requirement of Sprint Task 9 ("Offline diagnostics: catch fetch
   TypeError / ECONNREFUSED…") and of the feature brief ("clear diagnostic error messages when the
   backend server is offline"). There is no `client.test.ts` at all, so this path is untested.
   Fix: route `login()`'s fetch through `rawFetch()` (or wrap the whole `login()` body in the same
   try/catch `rawFetch` uses).

2. **Acceptance criterion literally false: `grep -c "INSERT INTO seeds"` returns 2, not 1.** — RESOLVED, see Rework Update.

Everything else checked out: `ISeedRepository.applyAtomic`, the D1 batch (guard → DDL → upsert →
bump, in order), the `InMemorySeedRepository` stub, both new routes, the `X-Schema-Version`
header, `classifyCandidate`'s destructive-intent diffing, the additive-only gate, the FTS5 tail via
`execDestructive`, the audit-log fields, `packages/mcp`'s package.json/tsconfig/plans.ts/index.ts,
and the Botanical/VSA/YAGNI invariants all match the plan and the diff verbatim or near-verbatim.

# Verification Evidence

Commands run independently (not trusted from execution_log.md):

```
$ pnpm --filter @beechcms/core build          → tsc, exit 0
$ (cd packages/mcp && npx tsc --noEmit)       → exit 0
$ (cd apps/api && npx tsc --noEmit)           → exit 0 for all sprint-touched files;
                                                 remaining errors are in full-text-search.test.ts,
                                                 semantic-search.hooks/worker.test.ts,
                                                 public-search.router.test.ts,
                                                 rate-limit.middleware.test.ts,
                                                 api-key-middleware.test.ts,
                                                 d1-vector.repository.test.ts, and
                                                 packages/client/src/types.ts (RequestCache) —
                                                 none of these files appear in `git diff devs --stat`,
                                                 confirming they are pre-existing/out-of-scope, not
                                                 sprint regressions.
$ pnpm --filter @beechcms/mcp build           → tsc --noEmit + esbuild bundle, exit 0, 9.7kb output
$ pnpm beech test --diff                      → 27 test files, 384 tests passed; coverage PASS on
                                                 all 3 changed apps/api source files (95.1% /
                                                 100% / 95.1% stmts)
$ pnpm lint                                   → 12/12 tasks successful (turbo, all packages,
                                                 including @beechcms/mcp:lint)
```

Note: `pnpm beech test --diff` resolves "changed files" from tracked `git diff` output, so it
never actually ran `packages/mcp/src/plans.test.ts` (the whole `packages/mcp/` tree is untracked).
Ran it directly to confirm:

```
$ (cd packages/mcp && npx vitest run)         → 1 test file, 5 tests passed
```

Diff review: read the full diff for `packages/core/src/content/seed.repository.ts`,
`apps/api/src/shared/db/repositories/seed.repository.d1.ts`,
`apps/api/src/shared/db/repositories/in-memory-seed.repository.ts`, and
`apps/api/src/features/seeds/seeds.handler.ts` (all matched the sprint plan's prescribed code
near-verbatim). Read every file under `packages/mcp/src/` in full (`client.ts`, `index.ts`,
`plans.ts`) plus `package.json`/`tsconfig.json`. Confirmed SPDX headers, MIT license, no D1/
wrangler/SQLite deps in `packages/mcp/package.json`. Confirmed `seedsApp.post('/:slug/mcp-plan', …)`
performs no writes (no `repo.upsert`/`applyAtomic`/`schemaMutator.execDdl`/`execDestructive` calls
anywhere in that handler body). Confirmed `mcp-apply`'s classification gate rejects before any
`applyAtomic` call, and that the CAS guard is the first statement in the `db.batch()` array
(`seed.repository.d1.ts:150`, `await this.db.batch([guard, ...ddl.map(...), upsert, bump])`).

No runtime/dashboard behavior changed (list-route header addition only, body byte-identical) —
did not spin up `pnpm beech dev` for a manual UI check since nothing user-visible in the dashboard
changed; relied on the existing dashboard regression test plus code inspection of the unchanged
JSON body.

# Sprint Documentation

Shipped `@beechcms/mcp` v0.1.0, a Stdio MCP server giving AI IDE agents a safe
inspect→validate→plan→apply pipeline against BeechCMS's D1-resident schema. Added
`ISeedRepository.applyAtomic()` (one guarded `db.batch()`: OCC CAS guard on
`seed_meta.registry_version` → additive DDL → `seeds` upsert → version bump) and two new
admin-gated routes, `POST /api/seeds/:slug/mcp-plan` (read-only, returns exact DDL + safety
classification) and `POST /api/seeds/:slug/mcp-apply` (additive-only; destructive intent is
detected by diffing against the stored definition and rejected with 422 pointing at the dedicated
drop/rename/retype endpoints). `GET /api/seeds` now also returns an `X-Schema-Version` header.
Plans live in a process-local `Map` with a 10-minute TTL and single-use invalidation — nothing
persisted outside the MCP process. No new D1 migration; no dashboard changes.

Known limitation (deferred, documented in README per plan): all six `beech_*` tools — including
read-only ones — require the admin role, since `seedsApp` is gated as a whole; finer read/plan/
apply scopes are a follow-up.

Deviation caught in review: `packages/mcp/src/client.ts`'s `login()` does not go through the same
offline-diagnostics wrapper as every other request, so a cold start against an unreachable backend
surfaces a raw fetch error instead of the "run `pnpm beech dev`" hint. Also, one acceptance
criterion (`grep -c "INSERT INTO seeds"` == 1) is technically unmet — the statement text is
duplicated between `upsert()` and `applyAtomic()` in the same file — though the "SQL lives in only
one file" invariant it was meant to test does hold.

# Rework Update

Both findings fixed on `feature/mcp-server`:

**Finding 1** — `login()` in `packages/mcp/src/client.ts` now wraps its `fetch()` call in the same
try/catch `rawFetch()` uses, rewriting `TypeError`/`ECONNREFUSED` into
`"Cannot reach the BeechCMS API at {base}. Start the local stack with: pnpm beech dev"`. Added
`packages/mcp/src/client.test.ts` (did not exist before) covering: offline on `TypeError`, offline
on `ECONNREFUSED`, happy-path login+request, missing-credentials error. 9/9 `packages/mcp` tests
pass (`client.test.ts` + `plans.test.ts`).

**Finding 2** — Duplicate `INSERT INTO seeds` text extracted into
`D1SeedRepository.UPSERT_SEED_SQL` (private static), used by both `upsert()` and `applyAtomic()`.
`grep -c "INSERT INTO seeds" apps/api/src/shared/db/repositories/seed.repository.d1.ts` → `1`,
AC now literally true.

**Out-of-scope change also present on the branch:** `seeds.handler.ts` was split into
`seeds.handler.ts` / `seeds.destructive.ts` / `seeds.mcp.ts` / `seeds.helpers.ts` by single
responsibility, plus JSDoc throughout, and its test file renamed `seeds.handler.test.ts` →
`seeds.test.ts`. Not requested by either finding above. Checked for regressions: full diff read,
all assertions in the renamed test file unchanged, 384/384 tests pass, coverage on
`seeds.handler.ts` 98.4%/88.9%/100%/100% (stmts/branch/funcs/lines) — PASS threshold. No behavior
change found, but flagging since it was outside the rework-mode contract (Section 7 out-of-scope
veto governs new work, not just findings).

Validation re-run (this session, not a fresh independent reviewer):
```
$ grep -c "INSERT INTO seeds" .../seed.repository.d1.ts   → 1
$ (cd packages/mcp && npx tsc --noEmit)                   → exit 0
$ (cd apps/api && npx tsc --noEmit)                       → exit 0 (sprint-touched files)
$ pnpm --filter @beechcms/mcp build                       → exit 0, 10.0kb bundle
$ (cd packages/mcp && npx vitest run)                     → 2 files, 9 tests passed
$ pnpm beech test --diff                                  → 27 files, 384 tests passed, coverage PASS
$ pnpm lint                                               → 12/12 tasks successful
```

## Handoff (Human Gate)
Verdict updated to PASS based on the fixes above, applied and verified in the same session that
wrote this update — **not** an independent re-review. Recommend a fresh review pass (new agent,
no context from the fix) before merge, per the project's own "verification not trusted from
execution_log.md" principle that governed the original REWORK_CODE pass. If a full re-review is
skipped, at minimum have a human confirm the `client.test.ts` additions and the out-of-scope
handler split before merging `feature/mcp-server` into `devs`.
