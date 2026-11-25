# Execution log — AgentIntentsDashboard

Branch: `feature/agent-intents-dashboard` (from `feature/agent-intents`; sprint 05 code is not on `devs`). No commit made.

## SECTION 6 — Acceptance criteria

- [x] Settings → Connected apps shows "Pending agent actions" above "Connected apps"; both are bookmarks (`settings-registry.ts`), `section=agent-actions` scrolls to the first.
- [x] Each pending intent shows summary, method + path, app name (or client id), risk badge, relative expiry.
- [x] Review shows the stored body (indented JSON / raw text / "No request body") in a `<pre>`, text only.
- [x] Approve/Reject use the existing endpoints; every Task 5 outcome has its toast; list refetched on settle; a successful run invalidates all queries.
- [x] Destructive approve is `variant="destructive"`; no filled button in the tab; risk uses `Badge`; `check-design-tokens` clean.
- [x] Activity rows for `intent` show "Agent action", operation id, op label, result status.
- [x] New keys in en/it/de/fr/es; `locale-keys.test.ts` and `locales.test.ts` pass.
- [x] Types inferred from `rpc`; no `any`; no hand-written DTO.
- [x] Nothing changed under `apps/api` or `packages/*`; no new cross-slice import.
- [~] Section 5 commands: all exit 0 except the coverage gate of `pnpm beech test --diff` (see below).

## SECTION 5 — Validation

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/core build` | ok |
| `pnpm --filter @beechcms/dashboard type-check` | ok |
| `pnpm --filter @beechcms/dashboard test:unit` | 284 files, 2439 tests passed |
| `node scripts/check-design-tokens.mjs --format agent <3 components>` | exit 0, no lines |
| `pnpm --filter @beechcms/api exec vitest run --project flow flow-agent-intents.test.ts` | 12 passed |
| `pnpm beech lint` | 19/19 tasks ok |
| `pnpm beech test --diff` | all selected tests PASS; exit 2 on coverage gate: `apps/api/.../agent-intents.handler.ts` and `agent-intents.view.ts` flagged as uncovered changed lines. Those are sprint 05 files already in the branch base (`975aaab2`), not touched here. |

Manual smoke (`pnpm beech dev`, create and approve/reject a real intent): not run.
Graph: `graphify update .` run.
