# Execution Log — TagOptionsContract

Branch: `feature/tag-options-contract` (from `devs`, no commits).

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Hotfix baseline committed before start (git status clean on `devs`).
- [x] `TagOption` exported; `Branch.options?: TagOption[]`. `grep "options: \['"` hits only deliberate malformed fixtures in `seed-registry.test.ts`, `tag-options.test.ts` (and a `.map` literal in `kanban.test.ts`).
- [x] `tag-options.ts` sole rules implementation; imported by validation, registry, schema-builders, cache, fingerprint, typegen, kanban, public-routes, dashboard.
- [x] `tag-options.ts` imports only `../types.js` and `../validation/primitives.js`.
- [x] Fatal 18 + `SeedRegistry` guard reject text+options, `string[]`, `[]`, duplicates, bad color.
- [x] Writes: `tags(one-of)`, `tags(unique)`, `tags(max:1)`, `expected 'array'` (integration-tested).
- [x] `SCHEMA_FINGERPRINT_VERSION === 2`; color excluded; values and mode included.
- [x] `KanbanAxisBranchType` = `'tags' | 'boolean'`.
- [x] Public schema exposes `options {label,value,color}[]` and `multiple` on tags.
- [x] forms-react submits `string[]` for tags branches.
- [x] `demo-seeds.fixtures.ts` deleted; 7 choice branches `multiple: false` with plan colors.
- [x] Dashboard: `TAG_PALETTE`, `TagsOptionsForm` removed; `FieldEdit` no longer routes on options; no positional colors.
- [x] `CHANGELOG.md`, `schema-modeling.md`, `public-api.md` updated.
- [~] SECTION 5 commands: all exit 0 except the two notes below. No `it.skip`/`it.only`.

## Validation

- core type-check / build / test: 1072 passed
- testing, api, forms-react (43 passed), dashboard type-check: OK; `pnpm run type-check` (turbo, 19 tasks): OK
- `pnpm beech test`: client 121, core 1072, forms-react 43, cli 151, mcp 27, api unit+flow (re-run alone: flow 43 files / 380 passed), api integration 59 files / 324 passed, dashboard 1151 (one load-flaky test passes in isolation)
- `pnpm run lint`: 20 tasks OK; `pnpm run lint:tests`: placement OK
- `graphify update .`: done

## Deviations / notes

- `pnpm beech db:reset` OK. `pnpm beech onboard --yes` fails: `beech init` finds no `worker.ts`/`wrangler.jsonc` at repo root (environment, unrelated to the change). Demo seeds covered by `validate-all-demo-data`, `demo-data-repository`, `flow-setup-race`.
- Manual `pnpm beech dev` check not run (interactive).
- Tests outside plan list updated as direct consequence: `primitives.test.ts` (dedup removed), `cli/generate-types.test.ts` and `public-relation-expansion` (v1→v2), `content-export` (+`priority` non-flat branch).
- `pages/drafts-list.tsx` (not in plan): dropped text `options` + `seedLabelOptions` memo, compile break; branch now groups under "other".
- `packages/testing` needs `pnpm --filter @beechcms/testing build` for integration tests to see `br_11` (dist-resolved).

## REWORK (review_report.md, REWORK_CODE)

- [x] F1 `useBeechForm.test.ts`: helper split into arrange-only `renderTicketForm`; `handleSubmit` is the ACT in each `it()`, result named `success`; `/tickets/add` call asserted defined before body parse; payload named `submitted`.
- [x] F2 `tag-options.test.ts`: inline-asserted ACTs replaced by named `values` / `found`; `tagOptionValues` and `findTagOption` split one behaviour per `it()`; valid-branch case driven by array.

Validation: `tag-options.test.ts` 9 passed; forms-react 43 passed; core + forms-react type-check and lint exit 0; `lint:tests` OK.
