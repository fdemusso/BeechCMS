# Verdict
PASS

Re-review after the REWORK_CODE round. Both blocking test-convention findings (F1 `useBeechForm.test.ts`, F2 `tag-options.test.ts`) are fixed. No correctness bug, invariant violation or plan deviation found. One residual item for the human gate: the manual dashboard check was not performed (see Verification Evidence).

# Findings

None blocking. Carried-over non-blocking notes (no action needed for PASS):
- `apps/dashboard/src/components/fields/registry.ts:62` comment still says the `select` editor reads `branch.options`; it reads `selectOptions` now.
- `packages/core/src/dashboard-layout/kanban/kanban.test.ts:156` test name "null value (text) → is_empty" is stale (fixture is `tags`).
- `apps/dashboard/src/pages/drafts-list.tsx:251-252` leftover double blank line.
- `kanban.ts:55` `isLocalizedBranch` guard is now unreachable for axis candidates; can go in Sprint 4.
- `pages/drafts-list.tsx` is not in SECTION 3 but was a genuine compile break (virtual seed `text` + `options`). Necessary edit, not a REWORK_PLAN reason. The `seedLabel` column now groups under "other".
- Branch state: `feature/tag-options-contract` still has **no commits** (`git rev-parse devs HEAD` identical). The whole sprint is uncommitted working tree. Untracked files that must be `git add`ed: `CHANGELOG.md`, `tag-options.ts`, `tag-options.test.ts`, `content-tag-options.integration.test.ts`, `public-schema.integration.test.ts`, `stages/02_execution/output/`. `demo-seeds.fixtures.ts` deletion is already staged.

# Verification Evidence

All commands run by me from the repo root; none taken from `execution_log.md`.

SECTION 5, in order:
- `pnpm --filter @beechcms/core run type-check` → exit 0
- `pnpm --filter @beechcms/core run build` → exit 0
- `pnpm --filter @beechcms/core test` → exit 0, 59 files / 1075 passed
- `pnpm --filter @beechcms/testing run type-check` → exit 0
- `pnpm --filter @beechcms/api run type-check` → exit 0
- `pnpm --filter @beechcms/forms-react run type-check` → exit 0
- `pnpm --filter @beechcms/forms-react test` → exit 0, 7 files / 43 passed
- `pnpm --filter @beechcms/dashboard run type-check` → exit 0
- `pnpm run type-check` → exit 0, 19/19 tasks
- `pnpm run lint` → exit 0, 20/20 tasks
- `pnpm run lint:tests` → exit 0, "test placement — OK"
- `pnpm beech test` → exit 1. Per package: client 121, search-client 19, core 1075, widget-sdk 7, forms-react 43, api-client 27, cli 151, mcp 27, dashboard 1151 (160 files), api unit+flow 1965 (180 files) all passed. api integration: **1 failure**, `seed-media-purge.integration.test.ts > persists a row cursor after one page…` (12.7 s, unrelated slice, timeout under full-suite load). Re-ran it in isolation together with the two new tag integration files (`cd apps/api && pnpm vitest run --config vitest.workers.config.ts <3 files>`) → **3 files / 11 tests passed**. Classified as load flake, not a regression.
- `pnpm beech db:reset` → exit 0.
- `pnpm beech onboard --yes` → exit 1: `beech init` reports `worker.ts` and `wrangler.jsonc` missing. `git ls-tree devs --name-only` has neither file, so this predates the sprint (environmental). Demo seeds' boot validity is covered by `validate-all-demo-data.test.ts` and the setup flow tests, both inside the passing api suite.

Rework verification (read the files):
- F1: `useBeechForm.test.ts:243-292` now has an arrange-only `renderTicketForm`; `handleSubmit` is the single ACT in each `it()`, result named `success`; `submittedPriority()` asserts `addCall` is defined before `JSON.parse`; payload named `submitted`. Compliant with Rule 2.2 / 5.7.
- F2: `tag-options.test.ts` now assigns `values` / `found` / `issues` before asserting; `tagOptionValues` and `findTagOption` split into one behaviour per `it()`; the remaining inline assertions (`:26`, `:115`, `:130`) are matrix cases (Rule 1.6), legitimate.

Invariant audit:
- `grep -rn "options: \['" apps packages` (ts/tsx, no node_modules/dist) → 3 hits, all deliberate malformed fixtures or a `.map` literal (`kanban.test.ts:101`, `seed-registry.test.ts:43`, `tag-options.test.ts:82`).
- `TAG_PALETTE` / `TagsOptionsForm` → zero hits in `apps` / `packages`.
- No `it.skip` / `describe.skip` / `.only` in the diff or in untracked test files (only prose mentions in the two stage logs).
- SECTION 7: `git diff devs --stat` over `manifest-compare.ts`, `cli/src/commands`, `control-plane.ts`, `mcp/src/plans.ts`, api migrations, `docs/api` → empty.
- Core/API invariants (no D1 bypass, no hardcoded field names, no cross-slice imports, `tag-options.ts` imports only `../types.js` and `../validation/primitives.js`) were audited in the previous round; the rework touched only two test files, and the production diff is unchanged.

Plan conformance and SECTION 6: all items verified in the previous round against the diff (building blocks verbatim, decisions honoured, SECTION 4 rules hold). Still true: tests above exercise one-of / unique / max:1 / bare-string rejections and the public schema payload against real D1.

Runtime verification: **API behaviour** exercised end-to-end by the integration tier (real Hono chain + real D1). **Dashboard UI was NOT exercised in a browser**: `onboard` fails in this environment, so no demo data exists for the plan's manual check (`pnpm beech dev`, open a `clienti` entry, `tier` renders as a coloured chip, save unchanged → 200). UI rendering is covered only by component tests (`display-fields`, `json-edit`, `edit-tags`). The human should run that final manual check at the gate.

# Sprint Documentation
- Shipped: `options` on a `tags` branch is now a closed, ordered vocabulary `[{ value, color }]` (`#RRGGBB`), valid only on `tags`; `multiple: false` on `tags` means single choice (stored value is always an array). `Branch.options` changed from `string[]` to `TagOption[]`.
- Single source of rules: `packages/core/src/engine/seeds/tag-options.ts`. Boot gate = Fatal 18 in `validateSeedDefinitions` plus a `SeedRegistry` constructor guard; write gate = `tagsSchema` (one-of, unique, max:1, no silent dedupe, no trimming, no string→array coercion).
- Derived contracts: validation cache key includes option values and resolved cardinality; `SCHEMA_FINGERPRINT_VERSION` is now 2 (`X-Schema-Revision: v2:`; colors excluded, values/order/mode included); generated types emit `('a' | 'b')[]`; `GET /api/v1/public/:seed/schema` exposes `options: {label,value,color}[]` and `multiple`; forms-react submits `string[]` for tags.
- Demo seeds rewritten as single-choice tags with explicit colors; duplicate `demo-seeds.fixtures.ts` removed. Canonical seed gained `posts.priority` (`br_11`).
- Dashboard: compile bridge only (no new UX). Positional `TAG_PALETTE` and the CSV `TagsOptionsForm` removed; chip color comes from `option.color`. Kanban lost its `text` axis branch. `pages/drafts-list.tsx` was also touched (not in plan) to drop `text` options.
- Deliberate break (no migration): databases holding `text`+`options` or `options: string[]` fail at registry hydration; restart from a fresh DB. Documented in the new root `CHANGELOG.md`, `schema-modeling.md`, `public-api.md`.
- Known limitations: multiple-choice tags in the public forms SDK offer a single choice; kanban/sort/group still allow multi-tag axes (Sprint 4); CLI/MCP plan-apply does not yet diff option shape (Sprint 2); seed-builder has no options editor (Sprint 3); `pnpm beech onboard --yes` is broken on `devs` (missing root `worker.ts`/`wrangler.jsonc`), unrelated.
