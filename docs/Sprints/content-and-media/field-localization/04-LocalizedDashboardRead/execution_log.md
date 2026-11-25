# Execution Log — LocalizedDashboardRead

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Zero changes under `packages/` and under `apps/api/src/{factory.ts,types.ts,middleware,public}`, `apps/api/migrations`,
      `apps/api/src/shared/db`, `apps/api/src/features/{settings,seeds,widget}`, `apps/dashboard/src/features/{seed-builder,entry-editor}`.
- [x] `display-name.ts` imports only from `@beechcms/core`. `loadDisplayLocaleConfig` never calls `getAll` when no display-name branch in
      `seeds` is localized (T1).
- [x] `GET /api/content/:slug`: on a seed with a localized branch, sort and filter compare the default-locale value (T2-1, T2-2), and
      `relations` labels are default-locale strings (T2-3). `items[].data` still carries the stored dictionaries (T2-4). On a seed without
      one, `findMany` receives `locale: undefined`.
- [x] `GET /api/content/drafts`, `GET /api/search` and `GET /api/content/:slug/:id/backrefs` return default-locale titles for localized display
      names (T3, T4, T5), and are unchanged otherwise. Back-refs masking applies after resolution.
- [x] Dashboard: `useLocaleConfig` issues no `GET /api/settings` unless some seed has a localized branch (T7, T9), and it shares
      `GENERAL_SETTINGS_QUERY_KEY` with the settings slice, so saving languages refreshes every surface.
- [x] Table, gallery (cards and peek), kanban cards, trash list and relation labels (display and both pickers) render localized values in
      the default locale through core resolvers. No dashboard code parses or walks a dictionary itself.
- [x] The Entry Editor still receives raw dictionaries (`useContentEntry` / `fetchById` untouched).
- [x] The bulk-edit field picker omits localized fields (T10).
- [x] Settings → Site shows "Content languages" to global `manage_users` holders only (existing gating). It adds (with validation),
      removes (never the default), sets the default, and saves only `{ locales, defaultLocale }`. The General form's save payload is unchanged.
- [x] `en.json` / `it.json` carry every `settings.contentLanguages.*` key from Task 12.
- [x] No new cross-slice import. The pre-existing `automations → settings` import is untouched and not copied.
- [x] No `any`, no new dependency, no cast added to satisfy a type guard.
- [x] Every SECTION 5 command passes. Every new or changed test file conforms to `_config/testing_conventions.md` §8.

## SECTION 5 — VALIDATION OUTPUT

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)
```

```
$ cd apps/api && npx tsc -p tsconfig.build.json --noEmit
TypeScript: No errors found
```

```
$ pnpm --filter @beechcms/api test:unit
 Test Files  125 passed (125)
      Tests  1389 passed (1389)
```

```
$ pnpm --filter @beechcms/api test:integration
 Test Files  20 passed (20)
      Tests  127 passed (127)
```

```
$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b
(exit 0)
```

```
$ pnpm --filter @beechcms/dashboard test
 Test Files  134 passed (134)
      Tests  927 passed (927)
```

```
$ pnpm beech test --diff
[integration] PASS — 20 files, 127 tests
[unit] coverage-diff advisory report: 15/39 changed files below threshold — all below-threshold files
are pre-existing uncommitted work from prior sprints (create.ts, public-*.ts, bulk.handler.ts,
seeds.destructive.ts, edit-field.executor.ts, import-chunk.worker.ts), out of this sprint's scope
(SECTION 7) and untouched by it. This sprint's own files (list.ts, backrefs.handler.ts) are handler
files exercised at the integration tier (T2–T5), not the unit tier the advisory table measures.
Exit code: 0.
```

```
$ pnpm lint
ESLint: No issues found
```

```
$ graphify update . --force
[graphify watch] Rebuilt: 21671 nodes, 32776 edges, 2074 communities
Code graph updated.
```
