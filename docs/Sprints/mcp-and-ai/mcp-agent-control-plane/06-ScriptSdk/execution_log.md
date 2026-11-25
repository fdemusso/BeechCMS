# Execution log — ScriptSdk

Branch `feature/script-sdk`, cut from `975aaab2` + `0bbd6848` (05b committed first at user request; `devs` lacks sprint 05).

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `AgentIntentPendingResponse` lives in `@beechcms/core`; gate middleware has no local copy; re-export keeps both importers unchanged.
- [x] `ApiClient.send()` exists; all 12 pre-existing `api-client` tests pass unmodified (30 total with 3 new); MCP type-check + tests unchanged.
- [x] `SDK_OPERATIONS` has 108 entries, `satisfies SdkOperationMap`.
- [x] Parity test passes: agent ops = SDK methods ∪ {`intents.approve`, `media.upload`}; every method resolves through `matchOperation` to its own id.
- [x] No SDK method, scope or path can call `POST /api/agent/intents/:id/approve`; `CLI_OAUTH_SCOPE` lacks `agent:approve`.
- [x] Intent detection is by `isAgentIntentPendingResponse`, never status alone (import `202` test green).
- [x] Dry-run sends zero non-read requests (unit + flow).
- [x] Helpers: `listAll` cap and empty-page guard, `uploadFile`, `importFile` (no confirm), `waitForImport` timeout; flow suite green against test D1 + MinIO.
- [x] `@beechcms/cli/sdk` resolves to `dist/sdk/index.js` + `index.d.ts`; d.ts never mentions `@beechcms/api-client`; `package-dependencies.test.ts` green.
- [x] No `any` in SDK source or new tests; SPDX headers (MIT in `packages/*`, BUSL in `apps/api` test).
- [x] `pnpm lint`, `npx tsc --noEmit` in `apps/api`, `pnpm --filter @beechcms/cli build` clean.

## Deviation
- `BulkUpdateResult.updated` typed `number`, not `string[]`: `content.repository.ts:399` returns a count. `BulkTrashResult.succeeded` stays `string[]` (`content.repository.ts:229`).

## SECTION 5 — VALIDATION (all passed)
- `pnpm --filter @beechcms/core build` + `vitest run src/operations/agent-intent.wire.test.ts` → 4 passed
- `@beechcms/api-client` type-check + test → 3 files, 30 passed
- `@beechcms/cli build` → ok; `dist/sdk/index.js`, `dist/sdk/index.d.ts` present; `grep api-client dist/sdk/*.d.ts` → no match
- `@beechcms/cli test` → 33 files, 199 passed
- `@beechcms/mcp` type-check + test → 6 files, 27 passed
- `apps/api` `npx tsc --noEmit` → clean
- flow: `flow-script-sdk`, `flow-agent-intents`, `flow-media-assets` → 3 files, 61 passed
- unit: `agent-intent-gate.middleware.test.ts`, `factory.operations-parity.test.ts` → 21 passed
- `pnpm lint` → 19/19 tasks successful
- `pnpm beech test --diff` → every selected test passed. Coverage gate flags `agent-intents.handler.ts` / `agent-intents.view.ts` (sprint 05 files, diffed against `devs`; not touched here).
- `graphify update .` → 20189 nodes, 47811 edges
