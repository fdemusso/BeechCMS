# Execution Log — LocalizedReadNegotiation

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `localization.ts`: `resolveLocalizedValue` follows requested → default → first stored translation → `null`,
      and returns a legacy value as-is. `asLocaleDictionary` / `asLocaleDictionaries` are exported, pure, and
      import only `./types.js` and `./validation/primitives.js`. The `@beechcms/core` `package.json`
      dependencies are unchanged.
- [x] `SelectOptions.locale?: SelectLocale` exists. With it absent, `buildSelectQuery` output is identical to
      pre-sprint for every input (T2c).
- [x] With `locale` set, WHERE and ORDER BY on a localized branch use the self-contained expression. It adds
      no bindings, qualifies the column with the table, and inlines only `isLocaleCode`-checked codes. A
      malformed code throws `TypeError` (T2f).
- [x] A filter / sort result on a localized field agrees with the flat value in the response, including the
      default-locale fallback, the first-translation fallback and legacy values (T7-7, -8, -9, -13).
- [x] Public reads negotiate `?lang` → `Accept-Language` (exact, then primary subtag) → `defaultLocale`.
      `?lang=all|*` returns dictionaries. A well-formed unregistered code falls through. A malformed one is
      `400 invalid-lang`.
- [x] Language-dependent reads send `Vary: Accept-Language` (appended, never replacing `Origin`) and,
      in single mode, `Content-Language`. The edge-cache key carries `__beech_lang=<code|*>`.
- [x] `?include` targets and relation-subquery targets are resolved / filtered in the same language.
- [x] A masked localized field shows the mask for the resolved translation (single mode) or per translation
      (`all` mode). It is never `null` because the stored value was an object.
- [x] `public-add` / `public-edit` negotiate before writing (malformed `?lang` → 400, nothing written) and answer
      with localized fields in the negotiated language.
- [x] A project with no localized branch performs **no** `site_settings` read on public reads (T4) and sends
      no language header, and its public responses and cache keys are unchanged (T7-14). Every pre-existing
      test passes unmodified. The only exception is the one `resolveLocalizedValue` matrix row, which changes
      deliberately (T1).
- [x] `@beechcms/client`: `.lang(code)` exists on `FluentQuery`, and `buildSearchParams` emits `lang` only when set.
- [x] Zero changes under `apps/api/src/{factory.ts,types.ts,middleware}`, `apps/api/migrations`,
      `apps/api/src/features/**`, `apps/api/src/shared/**`, `packages/core/src/engine/{serialize,ddl,seed-*,schema-fingerprint}.ts`,
      `packages/core/src/search/**`, `apps/dashboard`, `packages/{api-client,mcp,cli,testing}`.
- [x] Every SECTION 5 command passes, and every new or changed test file conforms to
      `_config/testing_conventions.md` §8.

## SECTION 5 — VALIDATION (success output)

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/core test
 Test Files  52 passed (52)
      Tests  874 passed (874)

$ pnpm --filter @beechcms/client type-check
$ tsc --noEmit
(exit 0)

$ pnpm --filter @beechcms/client build
$ tsc
(exit 0)

$ pnpm --filter @beechcms/client test
 Test Files  7 passed (7)
      Tests  113 passed (113)

$ npx tsc -p tsconfig.build.json --noEmit   (apps/api)
TypeScript: No errors found

$ pnpm --filter @beechcms/api test:unit
 Test Files  124 passed (124)
      Tests  1386 passed (1386)

$ pnpm --filter @beechcms/api test:integration
 Test Files  17 passed (17)
      Tests  120 passed (120)

$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b
(exit 0)

$ pnpm beech test --diff
exit code 0 (coverage-threshold advisory only; every unit + integration suite it ran passed)

$ pnpm lint
ESLint: No issues found

$ graphify update . --force
Rebuilt: 21628 nodes, 32611 edges, 2092 communities
(exit 0)
```

No `pnpm beech db:migrate` / `db:reset`: this sprint ships no migration.
