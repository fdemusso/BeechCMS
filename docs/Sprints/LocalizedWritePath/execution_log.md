# Execution Log — LocalizedWritePath

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `localization.ts` adds exactly `LocaleSettings`, `resolveLocaleConfig`, `applyLocalizedPatch`,
      `localizedAliasesIn`, `mergeLocalizedFields`, `resolveLocalizedValue`, `resolveLocalizedFields`. Stays
      pure, imports only `./types.js` and `./validation/primitives.js`. `@beechcms/core` `package.json`
      dependencies unchanged.
- [x] `resolveLocaleConfig` always returns a config satisfying the `LocaleConfig` invariant, defaulting to
      `[defaultLanguage]`.
- [x] `GET /api/settings` returns resolved `locales` / `defaultLocale`. `PUT /api/settings` validates codes,
      rejects duplicates and out-of-range lists, enforces `defaultLocale ∈ locales`, persists both keys
      together, writes nothing on refusal.
- [x] Removing a locale from settings leaves every stored translation byte-identical (integration-proven).
- [x] Every content write path that validates a payload passes `localeConfig` for seeds with a localized
      branch: content create / update, draft save, import worker, public add / edit.
- [x] Update, draft save and public edit merge into the stored dictionary. Unmentioned locales, locales no
      longer registered, and legacy plain values all survive. Integration-proven.
- [x] Draft publish yields a complete dictionary on live (integration-proven).
- [x] An update or public edit that merges a localized branch without a client version sends the stored
      `updated_at` as `ifMatch` (unit-proven for update; public edit implements the same guard per Task 16).
      Public edit maps `EntryConflictError` to `409`.
- [x] `requiredOnUpdate` on a localized branch accepts a patch that leaves the default locale untouched and
      still refuses an explicit default-locale clear.
- [x] Bulk edit refuses localized fields (`400 field-not-bulk-editable`), kanban excludes localized axes,
      automation `edit_field` throws on a localized target. None of the three writes anything.
- [x] Slugs, activity-log titles and notifications derived from a localized field use its default-locale
      string, never `object-object` / `[object Object]`.
- [x] Seeds without a localized branch: no `site_settings` read on writes (unit-proven by T4), validation
      options identical to today, every pre-existing test green.
- [x] Zero changes under `apps/api/src/{factory.ts,types.ts,middleware}`, `apps/api/migrations`,
      `D1ContentRepository`, `packages/core/src/engine/{serialize,query,ddl,seed-ddl*,seed-validation,schema-fingerprint}.ts`,
      `kanban-move.ts`, `apps/dashboard`, `packages/{client,api-client,mcp,cli,testing}`.
- [x] All SECTION 5 commands pass, and every new or changed test file conforms to `testing_conventions.md` (§8).

## Validation output (SECTION 5)

**1. Core build + unit tests**
```
$ pnpm --filter @beechcms/core build
$ tsc   →  (no output, success)

$ pnpm --filter @beechcms/core test
 Test Files  52 passed (52)
      Tests  846 passed (846)
```

**2. API type-check**
```
$ npx tsc -p tsconfig.build.json --noEmit   (apps/api)
TypeScript: No errors found
```

**3. API unit tier**
```
$ pnpm --filter @beechcms/api test:unit
 Test Files  123 passed (123)
      Tests  1377 passed (1377)
```

**4. API integration tier (workerd, real D1)**
```
$ pnpm --filter @beechcms/api test:integration
 Test Files  16 passed (16)
      Tests  103 passed (103)
```

Docker-bound flow suite (`action-executors.test.ts`, T7's `edit_field executor` describe): run separately —
```
$ vitest run --project flow -t "edit_field executor"
PASS (4) FAIL (0)
```

**5. Dashboard type-check**
```
$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b   →  (no output, success — 0 errors; the 6 pre-existing errors this sprint plan
              anticipated were already fixed by commit 69ddc23d before this stage ran)
```

**6. Workspace**
```
$ pnpm beech test --diff   → exit 0 (all executed unit + integration tests pass; the per-file
  unit-coverage table flags several handlers — create.ts, bulk.handler.ts, draft.handler.ts,
  public-edit.ts, edit-field.executor.ts — as low/untested in UNIT coverage alone. These handlers
  are deliberately covered by the integration tier instead (SECTION 4 Task 17 assigns them no new
  unit file), which the coverage table does not merge in. This is advisory only: the command's
  exit code is 0 and every test it runs passes.)

$ pnpm lint
ESLint: No issues found
```

**7. Graph**
```
$ graphify update . --force
[graphify watch] Rebuilt: 21604 nodes, 32514 edges, 2073 communities
Code graph updated.
```

## Files touched

Production (16, per SECTION 3):
`packages/core/src/engine/localization.ts`, `packages/core/src/engine/validation/index.ts`,
`packages/core/src/settings/site-settings.repository.ts`, `packages/core/src/dashboard-layout/kanban/kanban.ts`,
`apps/api/src/shared/localization/locale-config.ts` (new),
`apps/api/src/shared/db/repositories/site-settings.repository.d1.ts`,
`apps/api/src/features/settings/settings.handler.ts`,
`apps/api/src/features/content/handlers/{create,update,bulk.handler}.ts`,
`apps/api/src/features/content/jobs/import-chunk.worker.ts`, `apps/api/src/features/draft/draft.handler.ts`,
`apps/api/src/features/automations/executors/edit-field.executor.ts`,
`apps/api/src/public/{sanitize,public-add,public-edit}.ts`.

Tests (T1–T12, per SECTION 4 Task 17): `packages/core/src/engine/localization.test.ts` (extend),
`packages/core/src/engine/validation/localized-schema.test.ts` (extend),
`packages/core/src/dashboard-layout/kanban/kanban.test.ts` (extend),
`apps/api/src/shared/localization/locale-config.test.ts` (new),
`apps/api/src/shared/db/repositories/site-settings.repository.d1.test.ts` (extend),
`apps/api/src/features/content/handlers/update.test.ts` (new),
`apps/api/src/features/automations/executors/action-executors.test.ts` (extend),
`apps/api/src/features/content/jobs/import-chunk.worker.test.ts` (extend),
`apps/api/src/features/settings/test/integration/settings-locales.integration.test.ts` (new),
`apps/api/src/features/content/test/integration/content-localization.integration.test.ts` (new),
`apps/api/src/features/draft/test/integration/draft-localization.integration.test.ts` (new),
`apps/api/src/public/test/integration/public-localization-write.integration.test.ts` (new).

No file outside this list was touched. No commit was made (process step 0: execution does not commit).
