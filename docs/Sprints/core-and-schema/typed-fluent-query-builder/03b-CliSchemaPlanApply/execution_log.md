# Execution Log: CliSchemaPlanApply

## Section 6 — Acceptance Criteria

**Boundaries**
- [x] No file under `packages/cli/src/**` imports any symbol from `apps/api/**`; `graphify path
      "schemaApply" "mcpApp"` reports no directed path.
- [x] `graphify path "createBeechApp" "createControlPlane"` and `graphify path "createBeechApp"
      "readGrant"` both report no directed path — the Worker never reaches Node-only code.
- [x] Exactly one file under `apps/api/src/` is modified: `features/seeds/seeds.mcp.ts`.
- [x] Zero files under `apps/dashboard/` and zero files under `packages/core/src/` are modified.
- [x] Zero migration files are added or edited.

**Botanical invariant**
- [x] `packages/cli/src/commands/schema-plan.ts` and `schema-apply.ts` contain no SQL string, no
      `CREATE`/`ALTER`/`INSERT`/`UPDATE` literal, and no call to `createD1Context`, `loadLiveSeeds`,
      `queryD1` or any `node:sqlite`/wrangler API.
- [x] Every DDL statement executed originates from `planCreateSeed`/`planExtendSeed` inside
      `@beechcms/core`, invoked server-side; the CLI only displays `plan.statements`.
- [x] No physical column name and no branch alias is hardcoded in any new file.

**Shared client extraction**
- [x] `packages/mcp/src/oauth.ts` and `packages/mcp/src/token-store.ts` no longer exist; their content
      lives in `packages/api-client/src/` with unchanged behaviour.
- [x] `packages/mcp/src/client.ts` still exports `request` and `BeechClientError` with unchanged
      signatures, and `packages/mcp/src/index.ts` is **not modified**.
- [x] The token cache path (`~/.beechcms/mcp-tokens.json`), its `BEECH_TOKEN_CACHE` override, its
      `apiUrl|clientId` key and its 0600 permissions are unchanged.
- [x] `@beechcms/api-client` has zero third-party dependencies (`@beechcms/core` only) and is consumed
      by both `@beechcms/mcp` and `@beechcms/cli`; neither of those two imports the other.
- [x] `packages/api-client/tsconfig.json` declares `references: [{ "path": "../core" }]` and
      `packages/mcp/tsconfig.json` adds `{ "path": "../api-client" }`.

**Auth**
- [x] The CLI authorizes as client id `beech-mcp-cli` with callback path `/callback` — the exact values
      seeded in `apps/api/migrations/0000_v040_base.sql:443` — and requests scope
      `schema:read schema:write`.
- [x] No password, no client secret and no long-lived admin JWT is read, prompted for, or written by
      any new file.
- [x] A 403 `insufficient_scope` and a 401 both surface as a `CliError` naming the remedy, not as a
      stack trace.

**Command behaviour**
- [x] `beech schema plan` performs **zero** writes: it issues only `POST …/mcp-plan` requests.
- [x] `beech schema plan` exits 1 when any seed reports `blockedReasons` or a fatal issue, and 0 when
      every seed is applicable.
- [x] `beech schema apply` writes nothing at all when any seed in the run is unappliable.
- [x] `beech schema apply` prompts once and refuses to proceed in a non-interactive shell without
      `--yes`.
- [x] `beech schema apply` re-plans each seed immediately before writing it and aborts that seed when
      the statements differ from the reviewed plan or the server answers 409.
- [x] `beech schema apply` sends `source: 'code'` and one shared `planId` for every seed in the run.
- [x] `beech schema apply` never issues a `DELETE`, a rename or a retype request, and never touches a
      seed that exists in D1 but not in the manifest.
- [x] Relation targets defined in the manifest are applied before the seeds referencing them; a
      relation cycle fails before the first HTTP request with a message naming the slugs.

**API change**
- [x] `POST /api/seeds/:slug/mcp-plan` returns `source: 'code' | 'runtime' | null`; every other field of
      the response is byte-identical to before.
- [x] `POST /api/seeds/:slug/mcp-apply` accepts an optional `source`, rejects any value other than
      `'code'`/`'runtime'` with 400, and defaults to `'runtime'` when absent — so `@beechcms/mcp`'s
      existing tools keep their exact behaviour without being edited.
- [x] Applying with `source: 'code'` over an existing seed leaves `seeds.source` unchanged (proven by
      an integration test, not by reading the SQL).
- [x] The activity-log detail for `mcp-apply` records the resolved `source`.

**Typing and quality**
- [x] `tsc --noEmit` passes in `packages/api-client`, `packages/mcp`, `packages/cli` and `apps/api`.
- [x] No `any` in any new or edited file, tests included; no non-null assertion except the two
      documented `previews.get(slug)!` lookups guarded by the preceding loop.
- [x] `pnpm beech lint` passes.
- [x] Every new test file satisfies `_config/testing_conventions.md` §8: one tier, SPDX header, four
      zones, one act, named act result, status asserted first, typed bodies, no weak or conditional
      assertions.
- [x] `packages/cli/src/test/cli-docs-parity.test.ts` passes with `schema:plan` and `schema:apply`
      registered — i.e. `docs/build/cli-workflows.md` documents both.


## Validation Output

```
$ graphify update . --force
Re-extracting code files in . (no LLM needed)...
...
Graph has 13206 nodes (above 5000 limit). Building aggregated community view...
graph.html written (aggregated: 1034 community nodes, 1238 cross-community edges)
[graphify watch] Rebuilt: 13206 nodes, 23820 edges, 1034 communities
Code graph updated. For doc/paper/image changes run /graphify --update in your AI assistant.

$ pnpm --filter @beechcms/api-client build && pnpm --filter @beechcms/api-client test
Test Files  3 passed (3)
Tests  27 passed (27)

$ pnpm --filter @beechcms/mcp build && pnpm --filter @beechcms/mcp test
Test Files  5 passed (5)
Tests  24 passed (24)

$ pnpm --filter @beechcms/cli build && pnpm --filter @beechcms/cli test
Test Files  23 passed (23)
Tests  116 passed (116)

$ pnpm --filter @beechcms/api test
Test Files  2 passed (2)
Tests  12 passed (12)
```
