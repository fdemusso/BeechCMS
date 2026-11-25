# Verdict
PASS

Condition: the runtime check (plan SECTION 5 "Controllo manuale finale") was NOT performed. The Docker daemon is not running on this machine, and `pnpm beech dev` requires Docker. See "Verification Evidence → Runtime". The human should run that check before merging, or ask the reviewer to start Docker and run it.

# Findings
No blocking findings. Non-blocking observations:

1. **Sprint work is uncommitted.** `git diff devs...HEAD` does not contain this sprint. HEAD `fe8aec25` is the Sprint 2 commit, and the whole TagChoiceEditing change is in the working tree and untracked files. I reviewed `git diff HEAD` plus the untracked files. Commit before merging.
2. **Stale file:** `stages/01_sprint_planning/output/rejections.md` holds the executor's 2026-10-13 REWORK_PLAN note. The current plan already lists those tests (SECTION 3 and Task 9), so the note is resolved. The human may clear it.
3. **Nit:** `apps/dashboard/src/components/fields/display/json.tsx:12-14`: the doc comment is wrapped awkwardly ("The value is pretty-printed / and truncated via…").
4. **Nit:** `repeater-branch-options.tsx`, `TagOptionsForm`: `key={issue}` on the issue list collides if `tagOptionsIssues` ever returns two identical messages. Use `key={index}` or `${index}-${issue}`.
5. **Not in scope, flagged for Sprint 4 (`TagChoiceViews`):** these still use the `json` + alias-contains-"tag" heuristic: `lib/filter-dsl.ts:49`, `features/content-management/hooks/use-content-list-query.ts:144`, `lib/dynamic-columns-lengths.ts:45`. The plan forbids touching the first two (SECTION 7).
6. **Pre-existing, plan-sanctioned:** `components/fields/edit-tags.test.tsx` keeps its hand-rolled `tagsBranch` and `tierBranch` fixtures (Rule 3.5). The sprint only changed aria-labels and values there, as Task 9 prescribes.

# Verification Evidence

All commands were run by me from the repo root on branch `feature/tag-choice-editing`. The executor's log was not trusted.

**SECTION 5 validation**

| Command | Result |
|---|---|
| `pnpm --filter @beechcms/testing build` | exit 0 |
| `pnpm --filter @beechcms/dashboard run type-check` | exit 0 |
| `pnpm --filter @beechcms/dashboard test` | 162 files, 1174 tests passed. A stray `ECONNRESET` stack trace in the output did not fail the run. |
| `pnpm run type-check` | exit 0, 19/19 tasks (Turbo FULL TURBO cache hit) |
| `pnpm beech test --diff` | exit 0, "28 file(s) passed" |
| `pnpm run lint` | exit 0, 20/20 tasks (cache hit) |
| `pnpm run lint:tests` | "test placement — OK" |
| `graphify update .` | exit 0, 17071 nodes, 38189 edges (`graphify-out` is gitignored) |

`pnpm beech test --diff` also prints "Review LOW: Untested entries above and add tests." I did not trace which entries that refers to; the run still exits 0.

**Acceptance criteria (SECTION 6)**
- Sprint 2 committed and the branch is new: HEAD is `fe8aec25`, the Sprint 2 commit, on `feature/tag-choice-editing`. ✔
- `git diff --name-only HEAD | grep -E '^(packages|apps/api)/'`: empty. ✔
- `grep -rnE "colorForOption|NEUTRAL_TAG_COLOR|extractTagChips" apps/dashboard/src`: empty. ✔ `lib/tags-utils.ts` exports `TagChipTone`, `TagChipData`, `parseTagsValue`, `extractTagNames`, `resolveTagChips`, with the verbatim signatures.
- Chip color comes only from `findTagOption` (`resolveTagChips`). No `color`/`hex` is read from entry values. ✔
- `registry.ts` maps `tags` to `TagsDisplay` / `TagsEdit`. `JsonDisplay` and `JsonEdit` have no tag branches or alias heuristic (diff checked). ✔
- `TagsEdit` (`components/fields/edit/tags.tsx`):
  - Single mode replaces the value and multiple mode adds.
  - Always emits `string[]`.
  - Menu follows the declared option order, with a colored dot per option.
  - An obsolete value shows as a dashed chip, can be removed, and is absent from the menu.
  - Read-only disables the trigger and the chips.
  - Free tags delegate to `JsonEdit`.
  
  ✔ (unit tests green)
- Gallery: `resolve-card-fields.ts` picks the first `type === "tags"` branch. `gallery-card-display.ts` calls `resolveTagChips`. ✔
- Seed builder:
  - `TagOptionsForm` renders for every `tags` branch, including repeater sub-fields.
  - `multiple` is `false` or the key is omitted.
  - An empty list drops the `options` key.
  - Issues come from core `tagOptionsIssues`, with no client-side rules and no save blocking.
  - `withoutIneligibleTagOptions` is wired into `emitChange`, so retyping away from `tags` drops `options`.
  
  ✔
- i18n: I printed every Task 7 key from `en.json` and `it.json`. All 14 values match the plan table. `grep optionsPlaceholder|optionsHint` is empty. ✔
- `docs/manage/content-editor.md` and `CHANGELOG.md` updated as in Task 8. ✔
- No `it.skip`/`it.only`/`describe.skip` in changed or new files (grep empty). ✔
- Only the negative map fixture remains in `filter-dsl.test.ts`. `[{ name }]` appears only in a negative case in `content-list-hooks.test.ts`. ✔

**Invariant audit**
- No D1 access, and no changes in `packages/` or `apps/api/`.
- No hardcoded aliases. The gallery chooses by `type`.
- No cross-slice imports. The only slice touched is `features/content-gallery`, and it imports from `@/lib` only.
- SECTION 7 untouched: kanban, sort, group, `conditional-format`, `filter-dsl.ts`, `use-content-list-query.ts`, core, CLI, MCP and demo seeds are not in the diff.
- `ROADMAP.md` is a planner file. It is outside the executor's source scope.

**Plan conformance**
- Building blocks match verbatim: `TagChipTone`, `TagChipData`, `extractTagNames`, `resolveTagChips`, `TagChipProps`, `TagOptionsFormProps`, `DEFAULT_TAG_OPTION_COLOR = "#64748b"`, `withoutIneligibleTagOptions`.
- Behaviour rules checked against the code:
  - `extractTagNames` does not trim and drops empty and non-string items.
  - Tone logic is `option`, `obsolete`, `free`.
  - Obsolete chips are outline, dashed, muted, with `title` and `aria-label` set to `notInOptions`.
  - Chip `title` is kept for the #301 test.
  - A single-choice pick of the already selected option does not emit.
  - `allSelected` is shown only in multiple mode.
  - `TagsDisplay` renders a non-JSON string (the mask) as muted text.

**Test audit (`testing_conventions.md` §8)**

I checked `tags-edit.test.tsx`, `tag-options-form.test.tsx`, `tags-utils.test.ts`, `display-fields.test.tsx`, `edit-tags.test.tsx`, `json-edit.test.tsx`, `filter-dsl.test.ts`, `content-list-hooks.test.ts`, `resolve-card-fields.test.ts` and `gallery-card-display.test.ts`.
- All are unit tier, and placement passes `lint:tests`. SPDX headers are present. In `tags-utils.test.ts` the `@vitest-environment node` pragma sits on line 1, above the header, as Rule 1.2 requires.
- Fixtures are canonical (`CANONICAL_SEEDS` `priority` and `tags`). The only hand-rolled branches are the deliberately malformed ones (duplicate value with color `red`, `text` and `file` with `options`).
- Rule 6.2.1 (no canonical multiple branch with options) and 6.2.4 (regression guards) comments are present.
- No `any`, no timers, no sleeps, no conditional assertions, no snapshots.
- The error-path test asserts the issue count against `tagOptionsIssues`, not message text (Rule 5.4).
- No blocking MUST violations. Every test in the plan's Task 9 list is present.

**Runtime verification: NOT DONE**
- `docker ps` fails: "failed to connect to the docker API at unix:///Users/flaviodemusso/.docker/run/docker.sock… no such file or directory".
- `_config/commands.md` says Beech has no lightweight mode, so `pnpm beech dev` cannot start.
- The jsdom tests render the real components, but the plan's manual flow was not exercised in a browser. That flow covers the `clienti` → `tier` menu with dots, replace-on-pick and save returning 200, colored chips in table/kanban/gallery, the seed builder add/reorder/color/uncheck "Multiple values" and save, and `beech schema plan` reporting `definition changed`.

# Sprint Documentation
TagChoiceEditing (Sprint 3 of the tag options series). The dashboard now treats `tags` with declared options as a closed choice. `TagsEdit` is a menu with a color dot per option. Single-choice mode replaces the value and multiple mode adds chips. It always emits `string[]`. Tags without options keep the JSON code editor.

`lib/tags-utils.ts` gained `resolveTagChips`, the single place that decides chip color and tone (`option`, `obsolete`, `free`) from the branch options via core `findTagOption`. Colors are never read from entry values. The `{tag: color}` map, `[{name}]` array and "json field whose alias contains tag" formats are gone. `TagChip` draws the three tones. A value no longer among the options shows as a dashed chip titled "not in the options" and is absent from the menu.

The gallery tag slot is now the first `type === "tags"` branch. The seed builder has `TagOptionsForm`: single/multiple mode via the `multiple` key, an ordered list of value and color rows with reorder and remove, an emptied list dropping `options`, and core `tagOptionsIssues` shown inline. Retyping a branch away from `tags` drops `options`.

No change in `packages/` or `apps/api/`. Kanban, sort, group, conditional format and automations are deferred to Sprint 4 (`TagChoiceViews`). Plan deviation: none found. Executor rework note: the plan initially omitted `filter-dsl.test.ts` and `content-list-hooks.test.ts` fixtures, and was amended.

Known limitations: tag filtering and column-length code still use the `json` + alias "tag" heuristic (`filter-dsl.ts`, `use-content-list-query.ts`, `dynamic-columns-lengths.ts`); this is addressed in Sprint 4. Free tags have no chip editor. The manual browser check was not run at review time (Docker was unavailable).
