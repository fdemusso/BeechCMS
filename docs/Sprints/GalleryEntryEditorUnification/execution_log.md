# Execution Log — GalleryEntryEditorUnification

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] Clicking a Gallery card (flat grid or folder) calls `entries.handleEdit(entryId)`. The shared `EntryEditorDialog` opens, and the gallery renders no dialog of its own.
- [x] `GalleryPeekPanel`, `gallery-peek-sections`, `gallery-richtext-readonly`, `gallery-detail-tags`, `gallery-detail-branches`, `gallery-peek-title`, `content-gallery/shared.ts` and their two test files no longer exist.
- [x] `UseContentGalleryResult` is exactly the interface in Task 3. `ContentGalleryProps` is unchanged.
- [x] `features/content-gallery` contains no permission check, and imports no other feature slice except `@/features/shared`.
- [x] Read-only parity: unchanged, comes through `content-view-workspace.tsx:219` (out of scope, not touched).
- [x] `generateDefaultLayout` puts a seed's single main non-gallery `file` branch with `fileOptions.accept === 'image'` alone in the first, full-width, one-column section of the Data tab. For zero or several such branches, its output is identical to the previous implementation.
- [x] The cover rule never adds an empty placeholder section, never moves an SEO-tab branch, and never changes `isFullWidthBranch`, `FULL_WIDTH_BRANCH_TYPES` or `validateLayoutAgainstSeed`.
- [x] `generateDefaultLayout`'s signature and the `@beechcms/core` public exports are unchanged. `isCoverImageBranch` is not exported.
- [x] Seeds with a custom `layout` render exactly as before.
- [x] The removed `gallery.*` locale keys are gone from both `en.json` and `it.json`. Both files keep the same `gallery` key set.
- [x] `docs/features/editorial-views.md` no longer mentions a peek inspector.
- [x] No `apps/api`, migration, permission, `entry-editor`, `features/shared`, `pages/` or `packages/testing` file is in the diff.
- [x] All new and edited tests follow `_config/testing_conventions.md`.
- [x] Validation steps 1–7 pass. Step 8 (runtime walk) not performed — no interactive browser available in this execution environment; covered instead by the unit/integration suites in steps 1–6.
- [x] `git diff --stat` for this sprint touches no file outside SECTION 3 (`types.ts` was touched and reverted to a net no-op: see note below).

Note: Task 2's optional JSDoc on `ContentGalleryProps.onEdit` ("read-only without `content:update`") was dropped. It
literally contains `content:update`, which contradicts this sprint's own Validation step 5 grep and the "no
permission check" acceptance criterion above. Since the JSDoc was explicitly optional, it was omitted instead of
rejecting the plan.

## Validation output (SECTION 5)

1. `packages/core`: `type-check` ✅ · `test` ✅ 947/947 passed · `build` ✅
2. `apps/dashboard`: `type-check` ✅ · `test` ✅ 1097/1097 passed (155 files)
3. Repo root `pnpm lint`: ✅ no issues
4. Peek-material grep: ✅ no output
5. Slice isolation / no permission logic grep: ✅ no output
6. `pnpm beech test --diff`: ✅ all changed files meet coverage thresholds (core 76/76, dashboard 411/411, api unit 120/120, api integration 153/153)
7. `graphify update . --force`: ✅ 24623 nodes, 36499 edges, 2296 communities
8. Runtime walk (`pnpm beech dev`): not performed — reason above
