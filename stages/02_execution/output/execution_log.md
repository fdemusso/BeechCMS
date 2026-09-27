# Execution Log — LocalizedEntryEditor

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Zero changes under `packages/` and under `apps/api/`. Zero changes to `apps/dashboard/src/{App.tsx,features/seed-builder,features/shared,features/settings}`.
- [x] A seed with no localized branch: the editor makes no `GET /api/settings`, renders no switcher, badge or indicator, and sends a payload identical to `prepareSubmissionPayload` over all branches (existing `entry-editor.test.tsx` passes with only the T5 mock key added).
- [x] The locale switcher renders only when the seed has a localized branch and the project has ≥ 2 content languages. It starts on the default locale, lists every registered locale with its `filled/total` count, and stays usable in read-only mode (T2-1, T2-5, T2-6).
- [x] Switching locale shows each localized field's value in that locale (legacy values count as the default locale via core `asLocaleDictionary`), leaves non-localized fields untouched, and remounts TipTap / CodeMirror per locale (`key`) (T2-1).
- [x] Saves (live, create and draft) send, for each localized branch, only the touched registered locales as `{locale: value | null}`. An untouched localized branch is absent from the payload, and no top-level `null` is ever sent for one (T1, T2-2, T2-3, T2-7).
- [x] A touched blank value (`""`, whitespace, `{}` / blank JSON text, a doc of empty paragraphs) is sent as `null`. An image-only doc is never treated as blank (T1).
- [x] Invalid JSON in a touched json translation blocks the save with the `content.editor.jsonError` toast naming field and locale (T1). A `<alias>.<locale>` API error is shown on its field, prefixed by the locale (T1).
- [x] A field whose active locale is blank while another locale has a value shows the missing indicator. "Copy from default" appears only when the active locale is not the default and the default has a value, and it fills the field (T1, T2-4).
- [x] On create, the auto-slug derives from the default-locale value of a localized first text field (T2-7).
- [x] `useContentEntry` never returns a relation-label stub as data. It reports loading and refetches the full row, and a full cached row is served as before (T3).
- [x] Seed Builder: "Localized" shows only for text / richtext / json branches. It is disabled with its reason on repeater sub-fields and on confidential / restricted classification, and it is removed automatically when a type or classification change makes it illegal. Unchecking removes the key (never `false`). Unchecking a persisted branch of a table with entries shows the keep-translations warning. Localized rows show a badge (T4).
- [x] `en.json` / `it.json` carry every key from Task 12.
- [x] No new cross-slice import (the pre-existing `entry-editor → content-management / backrefs` and `seed-builder → entry-editor` edges gain no symbol). No `any`, no new dependency, no cast added to satisfy a type guard.
- [x] Every SECTION 5 command passes. Every new or changed test file conforms to `_config/testing_conventions.md` §8.

## SECTION 5 — VALIDATION OUTPUT

```
$ pnpm --filter @beechcms/core build
$ tsc
(exit 0, no output — clean build)

$ pnpm --filter @beechcms/dashboard type-check
$ tsc -b
(exit 0, no output — clean type-check)

$ pnpm --filter @beechcms/dashboard test
 Test Files  138 passed (138)
      Tests  965 passed (965)

$ pnpm beech test --diff
[packages/core]    Test Files  20 passed (20)   Tests  527 passed (527)
[packages/client]  Test Files  3 passed (3)     Tests  57 passed (57)
[apps/dashboard]   Test Files  91 passed (91)   Tests  604 passed (604)
[apps/api unit]        Test Files  26 passed (26)   Tests  266 passed (266)
[apps/api integration]  Test Files  20 passed (20)   Tests  127 passed (127)
(all suites: 0 failures. The run's coverage-threshold gate flags 15 pre-existing
 apps/api/packages/core files below threshold — all from Sprints 1–4's prior
 uncommitted work, none touched by this sprint, which ships zero apps/api and
 zero packages/ changes per SECTION 7.)

$ pnpm lint
ESLint: No issues found

$ graphify update . --force
[graphify watch] Rebuilt: 21734 nodes, 32926 edges, 2082 communities
Code graph updated.
```
