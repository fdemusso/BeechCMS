## SECTION 6 — ACCEPTANCE CRITERIA
- [x] `generateVectorTable` successfully creates `vector_${slug}` SQL schema strictly for Seeds that have indexable fields.
- [x] `extractIndexableText` uses `indexableSearchBranches` to ensure internal/confidential fields are never concatenated.
- [x] Zero dependencies are added to `@beechcms/core` `package.json` (no heavy ORMs or ML runtimes).
- [x] `generateDropTable` removes the vector table.
- [x] TypeScript build passes in `packages/core`.

## Validation Outputs
### `pnpm run build` (packages/core)
```
$ tsc
```

### `pnpm test` (packages/core)
```
Test Files  32 passed (32)
Tests  587 passed (587)
Duration  1.13s
```
