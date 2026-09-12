# Execution Log — `SchemaIntrospectionFingerprint`

## SECTION 6 — ACCEPTANCE CRITERIA (completed)

**Architecture**

- [x] `packages/core/src/engine/introspection.ts` and `schema-fingerprint.ts` import nothing from
      `node:*`, `@cloudflare/*`, or `../schema/**` — verified by grep of their import statements.
- [x] `packages/core/package.json` `dependencies` unchanged — `git diff devs -- packages/core/package.json` empty.
- [x] `@beechcms/core` never opens a database connection: every D1 read goes through `SchemaQueryExecutor`.
- [x] The primitive issues read-only statements only (`PRAGMA` / `SELECT`) — no DDL, no write, no transaction control.
- [x] Nothing under `apps/api/` or `apps/dashboard/` modified; no migration added — `git diff devs --stat` empty for both paths.
- [x] `graphify path "createBeechApp" "queryD1"` reports no directed path after `graphify update . --force`.
- [x] `packages/cli/src/lib/wrangler.ts` unchanged — `git diff devs --stat` empty.

**Canonical serializer move**

- [x] `packages/core/src/schema/canonical.test.ts` passes without a single character edited.
- [x] `schema/canonical.ts` still exports `toCanonicalJson`, `fromCanonicalJson`, `ManifestSerializationError`; `manifest-validation.ts` unmodified.
- [x] `ManifestSerializationError` and `CanonicalSerializationError` are the same class object — verified at runtime (`instanceof` holds both ways).
- [x] Canonical byte output unchanged: sorted keys, preserved array order, two-space indent, trailing newline.

**Fingerprint**

- [x] `computeSchemaFingerprint` matches `/^v1:[0-9a-f]{32}$/`.
- [x] Identical seeds in different order / key insertion order produce identical fingerprints.
- [x] A `label`/`labelPlural`/`hint`/`dashboard`/`layout` edit does not change it.
- [x] A branch `alias`, `type`, `requiredOnCreate`, `targetSeed`, `options`, resolved `visibility` or `public` change does change it.
- [x] `SCHEMA_FINGERPRINT_VERSION` exported and embedded in the returned string.
- [x] Fingerprint computed from `Seed[]` read live via `introspectSeedDefinitions`, never from a manifest file.

**Typing**

- [x] No `any` in production code or tests — verified by grep.
- [x] `SchemaQueryExecutor.all` generic, bounded by `Record<string, unknown>`; bound not relaxed.
- [x] Every exported symbol carries a doc comment stating why.

**CLI refactor**

- [x] `schema-diff.ts` declares no PRAGMA row interface and issues no PRAGMA statement itself.
- [x] `ColumnDiff`, `SeedDiff`, `isSeedClean`, `renderSeedDiff` keep exact shapes; `migration-writer.ts` compiles unmodified (no diff).
- [x] `createWranglerExecutor` adds no caching, retry or statement rewriting.

**Tests**

- [x] New test files unit tier, correctly placed (core: colocated; CLI: `src/test/`), SPDX header, conventions followed.
- [x] All tests pass; no `it.only`/`it.skip`.
- [x] Unstubbed-statement path of the fake executor rejects rather than returning `[]`.
- [x] Error-path tests assert error identity (`IntrospectionError`, `CanonicalSerializationError.path/.found`).

**Build**

- [x] `pnpm --filter @beechcms/core build`, `pnpm --filter @beechcms/cli build`, `pnpm --filter @beechcms/api exec tsc --noEmit` all pass.
- [x] `pnpm beech test --diff` and `pnpm lint` pass.

## Validation output

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/core type-check
$ tsc --noEmit
(exit 0)

$ pnpm --filter @beechcms/core test
 Test Files  44 passed (44)
      Tests  710 passed (710)

$ pnpm --filter @beechcms/cli build
$ tsc --noEmit && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js
  dist/index.js  82.7kb
⚡ Done in 10ms

$ pnpm --filter @beechcms/cli test
 Test Files  16 passed (16)
      Tests  78 passed (78)

$ pnpm --filter @beechcms/api exec tsc --noEmit
(exit 0, no output)

$ pnpm beech test --diff
[packages/core] Test Files 5 passed (5) / Tests 40 passed (40)
  canonical-json.ts       88.9% stmts / 84.2% branch — PASS
  introspection.ts       100.0% stmts / 100.0% branch — PASS
  schema-fingerprint.ts  100.0% stmts / 76.9% branch — PASS
  canonical.ts            88.9% stmts / 75.0% branch — PASS
[packages/cli] Test Files 1 passed (1) / Tests 1 passed (1)
  d1-executor.ts         100.0% stmts / 100.0% branch — PASS
PASS  All 5 changed file(s) meet coverage thresholds.

$ pnpm lint
 Tasks:    17 successful, 17 total
(0 errors; pre-existing dashboard coverage-artifact warnings only, unrelated to this sprint)

$ graphify update . --force
Graph has 12884 nodes, 23302 edges, 1056 communities. Updated.

$ graphify path "createBeechApp" "queryD1"
No directed path found between 'createBeechApp' and 'queryD1'.
```

Manual smoke check of the primitive against real local D1 was skipped: the tiered suites above
(unit tests for `introspectTable`/`introspectSchema`/`introspectSeedDefinitions`/`diffSeed` against
a fake `SchemaQueryExecutor`) are the binding gate per SECTION 5, and no acceptance criterion
depends on the manual run.

## Note beyond the plan's explicit test list

The plan's SECTION 4 test list (8a–8d) did not include a test for `packages/cli/src/lib/d1-executor.ts`
(item 10, new). `pnpm beech test --diff` enforces per-changed-file coverage thresholds, and the
untested adapter failed that gate. Added `packages/cli/src/test/d1-executor.test.ts` — one unit test,
mocking the `queryD1` boundary — to satisfy SECTION 5's `pnpm beech test --diff` requirement. No
production code changed as a result.
