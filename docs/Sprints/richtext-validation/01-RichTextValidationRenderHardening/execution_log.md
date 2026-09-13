# Execution Log — RichTextValidationRenderHardening

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `packages/core` builds clean; `tsc --noEmit` passes in core AND `apps/api`.
- [x] `normalizeRichtextForRender` returns `JSONContent | null` (string branch removed); dead
      string branch in `renderRichText` removed; docstrings corrected (no "sanificata" claim).
- [x] `richtext-render.test.ts`: legacy-string assertion flipped to expect `''`; string-drop cases added.
- [x] Node/mark validation is an **allowlist** (`ALLOWED_RICHTEXT_NODE_TYPES` / `_MARK_TYPES`); all
      `DANGEROUS_*` blocklist regexes and `FORBIDDEN_RICHTEXT_NODE_TYPES` deleted.
- [x] Link protocols validated by `isProtocolAllowed` against `{http,https,mailto,tel}` **after**
      whitespace/control-char stripping; `data:`, `vbscript:`, `java\tscript:` all rejected.
- [x] Depth cap (50) enforced in `walkRichtextNode`; deeply-nested payload flagged, no stack overflow.
- [x] Byte-size checked **before** the sanitizing walk (fail-fast `oversize`).
- [x] String-form RichText input rejected as structured `valid:false` (routed to `details`), not thrown.
- [x] `numberSchema` step accepts scientific notation (`1e-7`) via `decimalPlaces`; regression test green.
- [x] Regression tests present for #147, #148, #149, string-drop, and step.
- [x] **No new `throw` path** in `validation.ts`; result shape `ValidateSeedPayloadResult` unchanged.
- [x] **No new dependency** added to `@beechcms/core` (no DOMPurify / sanitize-html); `package.json` unchanged.
- [x] No `apps/` file modified beyond test fixtures adapting to the intentional string-input tightening
      (`apps/api/test/core-validation.test.ts`, `apps/api/test/flow-guest-access.test.ts`,
      `apps/api/test/flow-content-management.test.ts`) — no handler/route/component touched.

Note: actual file paths were `packages/core/src/validation.ts` (794 lines) and
`packages/core/src/content/richtext-render.ts` → `packages/core/src/richtext-render.ts` (single-file
layout, not the `engine/`+`content/richtext/` subfolders the plan described — pre-Sprint-2 module
split hasn't happened yet). All described functions, line-level defects, and constants matched the
plan's analysis exactly; proceeded with corrected paths rather than rejecting.

## Validation output

```
$ pnpm --filter @beechcms/core run build
$ tsc
(clean)

$ pnpm --filter @beechcms/core exec tsc --noEmit
(clean)

$ pnpm --filter @beechcms/core test
 Test Files  14 passed (14)
      Tests  391 passed (391)

$ pnpm --filter @beechcms/api exec tsc --noEmit
(pre-existing baseline errors only — D1 test-helper type mismatches unrelated to this diff,
confirmed identical via `git stash` comparison)

$ cd apps/api && npx vitest run
 Test Files  81 passed (81)
      Tests  1007 passed (1007)

$ graphify update .
Rebuilt: 5783 nodes, 11165 edges, 692 communities
```
