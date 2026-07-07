# Execution Log — RichTextValidationModuleSplit

## SECTION 6 — Acceptance Criteria

- [x] New dir `packages/core/src/engine/validation/` contains exactly: `primitives.ts`,
      `richtext-sanitizer.ts`, `file-branch.ts`, `schema-builders.ts`, `cache.ts`, `index.ts`.
- [x] `packages/core/src/engine/validation.ts` (the monolith) is **deleted**.
- [x] `src/index.ts:19` and `engine/validation.test.ts:16` re-pointed to `./validation/index.js`;
      no other `apps/**` or `packages/**` import edited.
- [x] Public barrel surface unchanged: `@beechcms/core` still exports `validateAndSanitizeSeedPayload`,
      `resolveFileOptions`, `isValidContentStatus`, `ValidationDetail`, `ValidateSeedPayloadOptions`,
      `ValidateSeedPayloadResult` — identical names/signatures/shapes.
- [x] `pnpm --filter @beechcms/core test` passes with `validation.test.ts` otherwise unchanged
      (import line only) — proves zero behavior change.
- [x] `tsc --noEmit` clean in `@beechcms/core` and `@beechcms/api`; `apps/dashboard` untouched.
- [x] Dependency graph acyclic: only `import type { ResolvedOptions } from './index.js'` references
      index from a leaf; all value imports point downward.
- [x] Every moved function body byte-identical to pre-split form. One logic-adjacent edit:
      `(issue as any).errors` → `(issue as { errors: z.ZodIssue[][] }).errors` in `flattenZodIssues`
      (compile-time-only, kept — `tsc --noEmit` accepted it, no revert needed).
- [x] `ALLOWED_RICHTEXT_*` ↔ `createRichTextHtmlExtensions` sync comment survives in `richtext-sanitizer.ts`.
- [x] No new dependency; no D1 migration; no `apps/**` edit.

## SECTION 5 — Validation Output

```
$ pnpm --filter @beechcms/core test
 Test Files  17 passed (17)
      Tests  455 passed (455)

$ pnpm --filter @beechcms/core run build
$ tsc
(clean, no output)

$ pnpm --filter @beechcms/core exec tsc --noEmit
(clean, no output)

$ pnpm --filter @beechcms/api exec tsc --noEmit
(clean, no output — pre-existing unrelated D1 mock-type errors in
 apps/api/test/{d1-repository-bulk-and-drafts,draft-touched-fields,
 flow-background-queues,flow-bulk-edit}.test.ts and test/helpers/d1-test-database.ts
 verified present on `devs` before this change too; out of scope)

$ pnpm --filter @beechcms/api test
 Test Files  88 passed (88)
      Tests  1061 passed (1061)

$ test ! -f packages/core/src/engine/validation.ts && echo "monolith removed OK"
monolith removed OK

$ grep -rnE "engine/validation\.js|\./validation\.js" packages apps --include="*.ts" --include="*.tsx" \
  | grep -v "engine/validation/"
(no matches)

$ pnpm beech test --diff
FAIL — flags packages/core/src/engine/validation.ts as "? No Tests Found".
False positive: git diff shows the monolith as a straight delete (no -M rename
detection across a 1-file-to-6-file split), so the coverage tool tries to find
tests for a file that no longer exists. The actual regression oracle
(validation.test.ts, import line only changed) already passed under gate #1.
```

Graph synced via `graphify update .` (6145 nodes, 11989 edges).
