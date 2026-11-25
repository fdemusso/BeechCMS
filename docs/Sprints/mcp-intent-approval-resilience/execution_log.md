## SECTION 6 — ACCEPTANCE CRITERIA
- [x] `beech_intents` accepts optional `intentIds` and returns `checked` with exact `outcome` (`awaiting_result`, `executed`, `failed`, `rejected`, `expired`, `not_found`).
- [x] `beech_confirm` never retries `POST .../approve` on transport failure; readback distinguishes lost-response-after-result from interruption-before-persistence (`awaiting_result`).
- [x] `beech_confirm` fallback instruction includes the retained `intentIds` and directs the agent to `beech_intents({ intentIds })`.
- [x] `beech-mcp-cli` remains without `agent:approve` scope (`sdk-parity.test.ts` continues to pass).
- [x] All unit and integration tests in `packages/mcp` and `packages/cli` pass, and TypeScript builds succeed.

## Validation Output
- `pnpm --filter @beechcms/mcp build`: exited 0 (`tsc --noEmit`, `bundle-resources` 874 resources, `esbuild` `dist\index.js` 62.9kb).
- `pnpm --filter @beechcms/cli build`: exited 0 (`tsc --noEmit`, `esbuild` `dist\index.js` 151.4kb, `dist\sdk\index.js` 1.8kb).
- `pnpm --filter @beechcms/mcp test`: 9 test files passed, 73 tests passed.
- `pnpm --filter @beechcms/cli test`: exited 0 (all tests passed, including `sdk-parity.test.ts`).
- `pnpm beech test --diff`: PASS — Tests: every selected test run passed; Coverage: all 3 changed file(s) meet the changed-line threshold (`packages/cli/src/commands/run.ts` 100.0%, `packages/mcp/src/agent-tools.ts` 89.7%).
