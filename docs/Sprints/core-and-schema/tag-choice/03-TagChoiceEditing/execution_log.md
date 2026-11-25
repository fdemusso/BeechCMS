# Execution Log — TagChoiceEditing

## SECTION 6 — ACCEPTANCE CRITERIA
- [x] Sprint 2 committed before start; new branch `feature/tag-choice-editing` from that commit (`devs` lacks Sprint 1+2).
- [x] No file modified in `packages/` or `apps/api/` (grep empty).
- [x] `lib/tags-utils.ts` exports `TagChipTone`, `TagChipData`, `parseTagsValue`, `extractTagNames`, `resolveTagChips`; `colorForOption|NEUTRAL_TAG_COLOR|extractTagChips` grep empty.
- [x] No color/hex interpretation from entry values; chip color only via `findTagOption`.
- [x] `registry.ts`: `tags` -> `TagsDisplay` / `TagsEdit`; `JsonEdit`/`JsonDisplay` free of tags branches and alias heuristic.
- [x] `TagsEdit`: single replaces, multiple adds, emits `string[]`, ordered menu with color dots, obsolete dashed chip absent from menu.
- [x] Gallery: tag slot = first `tags` branch, colored chips.
- [x] Seed builder: `TagOptionsForm` for every `tags` branch; `multiple` false/absent; empty list drops `options`; issues from `tagOptionsIssues`; retyping drops `options`.
- [x] i18n keys present in `en.json` and `it.json`; `optionsPlaceholder` / `optionsHint` removed.
- [x] `content-editor.md` and `CHANGELOG.md` updated.
- [x] No dashboard test asserts `{tag: color}` maps or `[{name}]` as valid tags (only negative fixtures).
- [x] SECTION 5 commands exit 0; no `it.skip`/`it.only`.

## Validation
- `pnpm --filter @beechcms/testing build` — ok
- `pnpm --filter @beechcms/dashboard run type-check` — ok
- `pnpm --filter @beechcms/dashboard test` — 1174 passed (1174)
- `pnpm run type-check` — 19/19 tasks successful
- `pnpm beech test --diff` — 28 file(s) passed
- `pnpm run lint` — 20/20 tasks successful
- `pnpm run lint:tests` — test placement OK
- `graphify update .` — 17067 nodes, 38175 edges

Manual `pnpm beech dev` check not run.
