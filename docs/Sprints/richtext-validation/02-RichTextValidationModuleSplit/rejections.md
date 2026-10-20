
## 2026-07-07 — RichTextValidationModuleSplit.md [FIXED]
Import cycle: Task 3 puts `fileSchema` in `file-branch.ts`, but its body calls `withNullable`/
`withEmptyPreprocessing` which Section 2's table and Task 4 assign to `schema-builders.ts`.
Task 4 also has `schema-builders.ts` import `fileSchema` from `file-branch.ts`
(`import { fileSchema } from './file-branch.js'`). file-branch -> schema-builders (needs the two
helpers) and schema-builders -> file-branch (needs fileSchema) = cycle, contradicting the plan's
own "verified acyclic" DAG (SECTION 2) and Task 3's import list (which omits the two helpers).
Cannot resolve without either duplicating the two helper functions in both files (breaks the
"byte-identical / line-for-line permutation" zero-logic-change invariant in SECTION 5) or moving
withNullable/withEmptyPreprocessing to primitives.ts (not authorized — SECTION 7 forbids adding to
primitives.ts beyond the 3 documented cross-module helpers).
