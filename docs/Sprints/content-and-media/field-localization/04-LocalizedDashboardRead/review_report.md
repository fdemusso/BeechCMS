# Verdict
PASS

# Findings
None. No `MUST`-level defect survived verification.

Two non-blocking observations for the record (not defects, not required before merge):

1. **Untracked stray file, not part of this sprint's scope.** `apps/api/src/features/content/test/integration/content-localization.integration.test.ts` exists in the working tree and is untracked, but it covers the write-path merge-on-write contract (create/update/bulk-edit refusal) — Sprint 1–3 territory, not anything Task 4's list changes. It is not referenced by Section 3/4 of this sprint's plan and was not modified by this sprint's diff. Leaving it uncommitted alongside this sprint's files is fine; flagging only so it isn't mistaken for this sprint's output when sprints are archived.
2. **Runtime verification was partial (see Verification Evidence).** A live click-through of the dashboard (Settings card, table/gallery/kanban/drafts/search/backrefs rendering) was not completed, because the local `wrangler dev` D1 instance has a stale `users` table (missing `is_active`, which `migrations/0000_v040_base.sql` and `D1UserRepository.findById` both expect) — a pre-existing local-environment drift unrelated to this sprint's diff (no user/auth files are touched by Section 3). This blocked authenticating against the live API. It does not block the verdict: the acceptance criteria are independently proven by real-D1, full-middleware-chain integration tests (T2–T5) that exercise the exact same HTTP surfaces the manual script would have, plus React Testing Library renders of the actual component tree for the dashboard-side hooks/components. See Verification Evidence for what was and wasn't covered this way.

# Verification Evidence

## 1. Diff scoping (git)
`devs` and `HEAD` are the same commit (`69ddc23d`) — this feature has no per-sprint commits; all of Sprints 1–4 sit as uncommitted/untracked changes in one working tree. `git diff devs` therefore mixes this sprint with Sprints 1–3. I scoped the review to exactly the files Section 3/4 of `LocalizedDashboardRead.md` names, cross-checked each one:

- All 25 production files and 15 test-file entries from Section 3 exist and were read in full (new files) or diffed against `devs` (modified tracked files); several new files are untracked (`?? `) so they don't show in `git diff devs` — confirmed present via direct `Read`/`git status`.
- Files outside that list that do appear in the full `git diff devs` (`public-*.ts`, `settings.handler.ts`, `site-settings.repository.d1.ts`, `seeds.destructive.ts`, `create.ts`, `update.ts`, `bulk.handler.ts`, `edit-field.executor.ts`, `import-chunk.worker.ts`, the `PUT /:slug/:id/draft` half of `draft.handler.ts`) match the sprint plan's own narrative of Sprints 1–3 ("every write path now stores locale dictionaries, the Public API returns them flat") and are not in this sprint's Section 4 task list. None of Section 4's tasks touch them, and the acceptance-criteria "zero changes" list (settings/seeds/widget/public/shared-db/factory/types/middleware/seed-builder/entry-editor) held for this sprint's own diff.

## 2. Task-by-task code match (Section 4)
Read every file named in Tasks 1–17 in full (new files) or via `git diff devs -- <path>` (modified files) and compared line-for-line against the plan's prescribed code:
- Task 1 `display-name.ts` — matches verbatim.
- Task 2 `list.ts` — matches; `buildRelationsMap`'s target-seed filter uses `!== null && !== undefined` (plan only specified `!== undefined`), which is a superset guard, not a defect.
- Task 3 `draft.handler.ts` (`GET /drafts` only) — matches; confirmed the `PUT /:slug/:id/draft` code above it (merge-on-write) is pre-existing Sprint 2/3 work, not touched by this sprint.
- Task 4 `full-text-search.ts`, Task 5 `backrefs.handler.ts` — match; `backrefs.handler.ts`'s type guard correctly narrows `Seed | null` (confirmed via `grep` that `getSeed`'s declared type in `apps/api/src/types.ts:182` is `Seed | null`, not `Seed | undefined` — the executor adapted the guard instead of casting, as instructed).
- Tasks 6–17 (dashboard: query-keys, `useLocaleConfig`/`useLocalizeEntryData`, settings types/hook, content-languages lib/hook/card, `general-tab.tsx` placement, `use-content-list.ts`, `ContentTrashView.tsx`, kanban hook, `bulk-edit-dialog.tsx`, fields DI slot, `relation-label.ts`, the three relation components, `App.tsx`, i18n keys) — all match the plan. Verified `ContentLanguagesCard` renders outside the General `<form>` (sibling `<div className="space-y-6">`, after the first `</Card>`) — no nested-form violation. Verified `useRelationLabel(...)` is called before every early `return` in `relation.tsx`, `relation-single.tsx`, `relation-multi.tsx`.
- `grep` across every sprint-4 production file for `: any`, `<any>`, `as any` — zero matches.

## 3. Invariant audit (`_config/ponytail_arch.md`)
- **Botanical invariant**: no direct D1 access added; every resolution goes through `@beechcms/core` (`resolveLocalizedValue`, `resolveLocalizedFields`, `deserializeFromDb`, `resolveLocaleConfig`). No hardcoded field names — every rule keys on `seed.displayNameAlias` / `branch.alias`, never a literal column name.
- **VSA enforcement**: no new cross-feature import. Shared logic added to `apps/api/src/shared/localization` and `apps/dashboard/src/features/shared`; `components/fields` receives locale config only through the existing DI slot pattern (`useFieldsConfig().useLocaleConfig`), never a direct import of `features/shared`. The pre-existing `automations → settings` import is untouched (confirmed not extended by this sprint's diff).
- **Cloudflare purity**: no migration, no new table/index/queue, no new dependency; `Intl.DisplayNames` is a runtime built-in.

## 4. Independent validation run (SECTION 5, re-run myself, not trusting `execution_log.md`)
Ran the full command block from scratch in one shell (`stages/03_review/output/validation_run.log`), background job exit code 0:

```
$ pnpm --filter @beechcms/core build            → tsc, exit 0
$ cd apps/api && npx tsc -p tsconfig.build.json --noEmit  → "No errors found"
$ pnpm --filter @beechcms/api test:unit          → Test Files 125 passed (125), Tests 1389 passed (1389)
$ pnpm --filter @beechcms/api test:integration   → Test Files 20 passed (20), Tests 127 passed (127)
$ pnpm --filter @beechcms/dashboard type-check    → tsc -b, exit 0
$ pnpm --filter @beechcms/dashboard test          → Test Files 134 passed (134), Tests 927 passed (927)
$ pnpm beech test --diff                          → integration PASS (20 files/127 tests); unit coverage-diff
                                                     advisory: "FAIL 15/39 file(s) below threshold" — same 15
                                                     files execution_log.md names (public-*.ts, create.ts,
                                                     bulk.handler.ts, draft.handler.ts, etc. — all pre-existing,
                                                     out-of-scope write-path files); this sprint's own handler
                                                     files (list.ts 73–80%, backrefs.handler.ts LOW: funcs 75%)
                                                     are exercised at the integration tier (T2–T5), which the
                                                     unit coverage table doesn't count — command still exits 0
$ pnpm lint                                       → turbo run lint, 19/19 tasks successful, no ESLint output
```
These numbers match `execution_log.md`'s SECTION 5 exactly. I did not independently re-run `graphify update . --force` (housekeeping, not a correctness check); I verified the graph's own claims (Pre-Computation Analysis §a–c) by direct `grep`/file inspection instead of trusting the graph output, which is stronger evidence for a review.

## 5. Test audit (`_config/testing_conventions.md` §8, every new/changed test file in the diff)
Read T1–T10 in full (display-name.test.ts, content-localized-list.integration.test.ts, draft-localization.integration.test.ts's new `describe`, search-localization.integration.test.ts, backrefs-localization.integration.test.ts, content-languages.test.ts, use-locale-config.test.tsx, relation-label.test.ts, content-list-localization.test.tsx, bulk-edit-dialog.test.tsx's new `it`) plus the T11 fixture-completion diffs. Checklist result: single tier per file, correct placement, SPDX headers present, `describe`/`it` names state subject/behaviour without "should", four zones with no interleaving, one act per test with named result, `expect(...).toBe(200) // precondition` used only on already-named ACT results (not inline), integration tests use `defineSeed` + real HTTP through the harness client (never a handler call or direct repository access), fixtures use canonical `defineSeed`/UUID-shaped ids, status asserted before body, typed response bodies throughout (`response.json<{...}>()`), zero `any`, comments used only for regression guards / non-obvious couplings (e.g. "the stored text starts with `{\"it\":…`, so raw order gives Orange first"), no forbidden patterns from §7 (no sleeps, no fake timers, no snapshot assertions, no conditional assertions). No violations found.

## 6. Acceptance criteria (SECTION 6, walked item by item)
All 13 items verified true against the code read in §2 above and the test evidence in §5 — sort/filter/relations resolve to default locale while `items[].data` stays raw (T2), drafts/search/backrefs resolve titles/displayName (T3–T5), `useLocaleConfig` is schema-gated and shares `GENERAL_SETTINGS_QUERY_KEY` (T7/T9), every dashboard read surface (table, gallery via `use-content-list.ts`, trash, kanban, both relation pickers + display chip) routes through `useLocalizeEntryData`/`relationLabelValue`, the Entry Editor's `fetchById`/`useContentEntry` path is untouched (confirmed no diff to `features/entry-editor`), bulk-edit excludes localized fields (T10), Content Languages card gating/validation/save-payload matches Task 9–11, i18n keys complete in both locale files, no new cross-slice import, no `any`/new dependency/cast, SECTION 5 commands pass (see §4).

## 7. Runtime verification (CONTEXT.md step 3)
Started `pnpm beech dev` (Docker stack was already up; wrangler + vite were not — started fresh) to verify the API-visible behavior against the actual Workers runtime (not the vitest-pool-workers emulation the integration tests use). `GET /api/settings` returned `500` — `D1UserRepository.findById` (`apps/api/src/shared/db/repositories/d1-user.repository.ts:55`) selects a column `is_active` that the local `users` table (inspected via `wrangler d1 execute DB --local`) does not have, even though `migrations/0000_v040_base.sql` defines it and `pnpm beech db:migrate` reports "DB already initialized — skipping." This is local-environment schema drift predating this sprint (no file under `apps/api/src/shared/db` or `migrations/` appears in this sprint's Section 3/4, and the users table is untouched by the diff) — not a defect in the reviewed code, and not something to fix by mutating a local database from inside a review. I did not run `db:reset` to fix it (destructive to local dev data; out of scope for this review to decide). As a result, live-browser click-through (Settings card, table/gallery/kanban/drafts/command-palette/backrefs rendering) was not completed.

What *was* independently verified as runtime-equivalent evidence: the integration suite (T2–T5, re-run in §4, not the executor's claim) drives the exact same requests (`GET /api/content/:slug` sort/filter/relations, `GET /api/content/drafts`, `GET /api/search`, `GET /:targetSlug/:targetId/backrefs`) through the real Hono app, the full middleware chain, and a real D1 instance (`cloudflare:test` D1, not a fake repository) — this is the same request path a browser would exercise, short of the browser itself. The dashboard-side hooks/components are exercised through React Testing Library (`renderHook`/`render` over the real component tree, only `@/lib/api` mocked) in T7/T8/T9/T10, which renders the actual `useLocaleConfig` → `useContentList`/`relationLabelValue` chain the dashboard uses.

Environment note for the human reviewer: this session started `pnpm beech dev` (which had not been running) and briefly stopped/restarted the pre-existing Docker containers (`beech-minio`, `beech-tunnel`, `beech-mailpit`, `beech-webhook-tester`, `beech-sqlite-web`, which were already up 3h at session start) while diagnosing the auth issue; they were restarted before this report was written, and the wrangler/vite processes this session started were stopped afterward. The stale `users.is_active` column is still unfixed in the local D1 file and will resurface on the next `pnpm beech dev` — worth a `pnpm beech db:reset` when convenient (destructive to local data, so left for the human to decide when).

# Sprint Documentation
**LocalizedDashboardRead** (Sprint 4/5, Field-Level Localization) makes the dashboard *read* localized content correctly and adds Settings → Content languages, with zero authoring UI (the "Localized" toggle and Entry Editor locale selector stay in Sprint 5, per the roadmap's rollout invariant against a half-shipped editor).

**What shipped:** a shared `resolveDisplayName`/`loadDisplayLocaleConfig` pair in `apps/api/src/shared/localization/display-name.ts`, consumed by the content list (relation labels + sort/filter locale), drafts (`GET /drafts` titles), search (result titles) and backrefs (display names) handlers. On the dashboard, `useLocaleConfig`/`useLocalizeEntryData` (new, in `features/shared`, schema-gated so a mono-lingual project makes no extra request) feed the content table/gallery/trash/kanban surfaces and a new `relationLabelValue`/`useRelationLabel` DI slot feeds both relation pickers and the display chip. A new Settings → Content languages card (add/remove/make-default, with the default language protected from removal) completes the project-level config UI that `PUT /api/settings` already validated since Sprint 2.

**Key decisions:** all resolution happens read-side and in JS after the D1 read (never a new SQL shape); `items[].data` on the authenticated list endpoint stays as raw dictionaries by design, because backoffice API clients and Sprint 5's editor both need every translation — only sort/filter and computed titles resolve. Bulk-edit refuses localized fields outright (the API already does; the field picker now mirrors it).

**Deviations from plan:** none found — every file in Section 3/4 matches the prescribed implementation.

**Known limitations (carried by design, not defects):** widget data API and vector-index titles stay unresolved (filed as roadmap fast-follows); the pre-existing `automations → settings` cross-slice import is untouched; the local dev D1 has an unrelated `users.is_active` schema-drift issue that blocked a full browser runtime pass this review (see Verification Evidence §7) — flagged for the human, not a sprint defect.

## Handoff (Human Gate)
PASS on an intermediate sprint (4 of 5). Per the pipeline contract: merge the branch, then run `pnpm pipeline next` (archives this sprint, keeps the feature brief + ROADMAP, and stage 01 plans Sprint 5). I have not run that command myself.
