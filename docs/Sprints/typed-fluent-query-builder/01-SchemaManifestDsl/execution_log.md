# Execution Log — SchemaManifestDsl (#381)

## SECTION 6 — ACCEPTANCE CRITERIA

**Module boundaries**

- [x] `packages/core/src/schema/` contains no import from `apps/`, from `packages/cli`, from `packages/client`, from `node:*`, or from any Cloudflare type.
- [x] `packages/core/src/schema/` performs no I/O: no `fetch`, no filesystem, no D1, no `console`.
- [x] `packages/core/src/index.ts` is **unchanged** — `grep -n "schema/" packages/core/src/index.ts` returns nothing.
- [x] `packages/core/package.json` exposes `"./schema"` and the two pre-existing subpath exports are byte-identical to before.
- [x] `packages/core/src/engine/define-seed.ts` is **unchanged**.
- [x] No new dependency in any `package.json`. `zod` is not imported by the new module.

**Typing**

- [x] No `any` in any file added or modified by this sprint, tests included.
- [x] `pnpm --filter @beechcms/core build` emits `dist/schema/index.d.ts`.
- [x] `defineField.relation` does not compile without `targetSeed`; `defineField.repeater` does not compile without `fields`. Proven via `// @ts-expect-error` in `define.test.ts`.
- [x] `ManifestSeed` has no `layout` property.
- [x] No unused export and no unused type alias survives in the new module (`pnpm --filter @beechcms/core lint` clean).

**Canonical form**

- [x] `toCanonicalJson` is stable across object key insertion order and across seed declaration order (proven by byte-equality test).
- [x] Branch array order is preserved.
- [x] A function, `Date`, `Map`, `Set` or `RegExp` anywhere in the manifest raises `ManifestSerializationError` carrying the dotted path.
- [x] `toCanonicalJson(fromCanonicalJson(s)) === s` holds for a two-seed manifest with a relation.

**Ownership guard**

- [x] `rejectManifestOwned` is called on exactly seven routes: `PUT /:slug`, `POST /:slug/branches`, `DELETE /:slug`, `DELETE /:slug/hard`, `DELETE /:slug/branches/:branchId`, `PATCH /:slug/branches/:branchId/rename`, `PATCH /:slug/branches/:branchId/retype`.
- [x] It is called on **none** of: `POST /api/seeds`, `mcp-plan`, `mcp-apply`, `fts/rebuild`, any `GET`.
- [x] A manifest-owned seed rejects every one of the seven with 409 and `type: 'seed-manifest-owned'`, each proven by an unchanged-state assertion.
- [x] A `source = 'runtime'` seed is unaffected on all seven (proven for `PUT`; the guard is a single shared function, so the same `return null` path covers the other six).
- [x] `mcp-apply` against a manifest-owned seed succeeds and leaves `source = 'code'`.
- [x] No change to `apps/api/migrations/`.
- [x] No change to `apps/dashboard/`.

**Tests**

- [x] Every new test file declares exactly one tier and sits in the placement that tier mandates.
- [x] `pnpm lint:tests` passes.
- [x] `describe`/`it` names follow §1.4–1.6; no `should`; no `// ARRANGE`/`// ACT`/`// ASSERT`.
- [x] Nothing from `_config/testing_conventions.md` §7 appears.
- [x] The direct-SQL `source='code'` arrangement carries the §6.2.1 coupling comment.
- [x] `packages/core` coverage thresholds (statements 80 / branches 75 / functions 80 / lines 80) still pass; the new module is not added to the vitest coverage `exclude` list.

**Build**

- [x] `pnpm build`, `pnpm lint`, `pnpm beech test --diff` all green.

## Validation output

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/core test
 Test Files  41 passed (41)
      Tests  682 passed (682)

$ pnpm --filter @beechcms/api type-check
$ tsc -p tsconfig.build.json --noEmit
(exit 0)

$ pnpm --filter @beechcms/api test
 Test Files  148 passed (148)   [unit/flow]
      Tests  1600 passed (1600)
 Test Files  2 passed (2)       [integration]
      Tests  10 passed (10)

$ pnpm beech test --diff
[packages/core] unit — 4 source files, 23 tests passed, coverage PASS
[apps/api] unit — 3 source files, 164 tests passed, coverage PASS
[apps/api] integration — 2 files, 10 tests passed
PASS  All 7 changed file(s) meet coverage thresholds.

$ pnpm lint
 Tasks:    17 successful, 17 total

$ pnpm lint:tests
 test placement — OK

$ pnpm build
 Tasks:    10 successful, 10 total
```

## Notes

- Implemented on branch `feature/schema-manifest-dsl` off `devs`, per the stage's repository rule. Not committed — commits are the user's call.
- `manifest-validation.test.ts`'s duplicate-alias case asserts a non-fatal issue, not fatal: the engine's `validateSeedDefinitions` treats a duplicate branch alias as a warning (Warning 8), not a fatal rejection. `validateManifest` reuses that function verbatim rather than reimplementing it, so the test was written to match the real, verified engine behavior instead of the plan's paraphrase of it.
