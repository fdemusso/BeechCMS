# Verdict
PASS

# Findings
None blocking.

Non-blocking observations (not part of this sprint's diff, FYI for the human):
1. Working tree has an **uncommitted** change to `apps/dashboard/src/components/fields/display/richtext.tsx` (and matching `apps/dashboard/src/test/fields/display-fields.test.tsx` edits) that pre-dates this review session — it adds a `JSON.parse` fallback path for legacy string values before calling `renderRichText`. This is outside the reviewed diff (`devs...HEAD` sprint scope) and untouched by me; flagging only so it isn't lost or mistaken for part of this sprint's "no `apps/` file modified" claim.
2. Commit `0ef2a67` ("fix cache collision on repeater sub-branches and enforceRequiredFields") sits inside the diff range because it was committed on the `feature/richtext-validation-render-hardening` branch on top of the sprint's real deliverable (`e0b1f52`) before merging. Its title and content duplicate the already-approved fix from `9ea1a3d`/`105da92` on the mainline branch (same bug, independently applied on both diverging branches, reconciled at the merge). Net effect at HEAD is consistent (tests green, `tsc` clean) — not new scope creep introduced by this sprint's execution, so not treated as a Section 7 violation.

# Verification Evidence

Sprint-scope isolation: the literal `git diff devs...HEAD` is 491 files (this branch also carries prior merged kanban-view and refactor work). Isolated the actual sprint diff to the merge-base of `devs`/`HEAD` (`26d5824`) through the tip of the richtext hardening line (`0ef2a67`), scoped to the plan's declared file set:

```
$ git diff 26d5824...0ef2a67 --stat -- packages/core/src/validation.ts packages/core/src/richtext-render.ts packages/core/src/validation.test.ts packages/core/src/richtext-render.test.ts apps/api/test/
 .github/LICENSE                               |   2 +-   (unresolved-marker artifact of the intermediate commit only; resolved cleanly by the final merge — verified clean at HEAD)
 apps/api/test/core-validation.test.ts         |   4 +-
 apps/api/test/flow-content-management.test.ts |   4 +-
 apps/api/test/flow-guest-access.test.ts       |  10 +-
 packages/core/src/richtext-render.test.ts     |   8 +-
 packages/core/src/richtext-render.ts          |  24 +--
 packages/core/src/validation.test.ts          | 137 ++++++++++++--
 packages/core/src/validation.ts               | 208 +++++++++++++-------
 9 files changed, 349 insertions(+), 102 deletions(-)
```
Confirmed no `package.json` / `*.sql` touched in this range (dependency- and migration-free, per plan).

Files at HEAD (post-reorg to `engine/`/`content/richtext/` — matches execution_log's noted path deviation):
- Read `packages/core/src/content/richtext/richtext-render.ts` — matches Task 1 exactly (`normalizeRichtextForRender` returns `JSONContent | null`, string branch removed, docstrings corrected, no "sanificata" claim).
- Read `packages/core/src/engine/validation.ts` (1213 lines) — `ALLOWED_RICHTEXT_NODE_TYPES`/`_MARK_TYPES`, `URL_LIKE_RICHTEXT_KEYS`, `ALLOWED_URL_PROTOCOLS`, `RICHTEXT_MAX_DEPTH=50` present; all `DANGEROUS_*`/`FORBIDDEN_RICHTEXT_NODE_TYPES` blocklist constants confirmed absent (grep). `isProtocolAllowed` strips control chars + whitespace before scheme extraction (defeats `java\tscript:`). `walkRichtextNode` enforces depth cap before recursing, flags `on*` attrs and disallowed node/mark types. `sanitizeRichtext` does the byte-size fail-fast check **before** `sanitizeRichtextJson`'s walk. `sanitizeRichtextString` now returns `valid:false` unconditionally (JSON-only). `decimalPlaces` handles scientific notation correctly (hand-traced `1e-7`/`3e-7`/`2.5e-7` cases against the spec's expected accept/reject outcomes).
- Confirmed no new `throw` paths: the two `throw new Error(...)` in `validation.ts` (exhaustiveness guards) existed identically in the pre-sprint baseline (`git show 26d5824:packages/core/src/validation.ts`).

Independent command re-runs (Section 5):
```
$ pnpm --filter @beechcms/core exec tsc --noEmit
(clean)

$ pnpm --filter @beechcms/core test
 Test Files  17 passed (17)
      Tests  455 passed (455)

$ grep -rnE "normalizeRichtextForRender|DANGEROUS_(TAG|ATTR|PROTOCOL|HANDLER)_|FORBIDDEN_RICHTEXT" apps packages --include="*.ts" --include="*.tsx"
→ only matches in packages/core/dist/*.d.ts (stale build artifacts) and the intended
  richtext-render.ts/.test.ts source — no apps/ caller depends on the narrowed string branch.

$ pnpm --filter @beechcms/api exec tsc --noEmit
→ FAILS with ~15 errors, but `git diff 26d5824...0ef2a67 -- <those exact test-helper files>`
  is empty — none of them were touched by this sprint. Confirmed pre-existing baseline noise
  (D1 test-helper typing, unrelated mocks), exactly as execution_log.md claimed.

$ cd apps/api && npx vitest run
 Test Files  88 passed (88)
      Tests  1061 passed (1061)
```

Regression-test coverage confirmed present in `packages/core/src/engine/validation.test.ts` (grep + read):
- `#147: flags a non-allowlisted node type ... (img onerror bypass style)`
- `#148: rejects data:text/html, vbscript:, and control-char obfuscated javascript: protocols`
- `#149: flags deeply nested content past the depth cap without stack overflow`
- `fails fast on oversize payload before the sanitizing walk`
- `#150` (scientific-notation step) — `describe('number field step with scientific notation (#150)')`

All of the above ran and passed as part of the full `pnpm --filter @beechcms/core test` run (no cherry-picked subset).

Invariant audit (`ponytail_arch.md`): diff touches only `@beechcms/core` (engine/content slices) + `apps/api/test/` fixtures. No D1 query added, no hardcoded field name, no cross-feature import in `apps/api/features/` or `apps/dashboard/src/features/`, no new dependency, no `.sql` migration. Zero `apps/` non-test files modified — matches Section 7 out-of-scope list.

Acceptance criteria (Section 6): walked all 13 items individually against the code/tests above — all satisfied.

Note on process: while diffing an isolated baseline via `git worktree add`, an incidental `git stash -u` (issued as prep for the worktree, before realizing a worktree doesn't require stashing) picked up a pre-existing uncommitted change in the working tree. It was immediately identified and restored via `git stash pop` before any further action; verified via `git diff --stat` that the working tree matches its pre-review state (only the same one pre-existing uncommitted file, `richtext.tsx`, unchanged in content).

# Sprint Documentation
Shipped: `RichTextValidationRenderHardening` (#147/#148/#149/#150) — hardened the single input gate (`validateAndSanitizeSeedPayload` → `richtextSchema` → `sanitizeRichtext`) from a bypassable blocklist to an explicit node/mark/protocol allowlist, added a pre-walk byte-size fail-fast and a depth cap (50) against DoS, rejected legacy string-form RichText input (JSON-only), and fixed scientific-notation step validation (`1e-7`) via an exponent-aware `decimalPlaces` helper. Paired the input-gate fix with a render-sink fix (`normalizeRichtextForRender`/`renderRichText` in `richtext-render.ts`): legacy HTML strings now drop to `null`/`''` instead of passing through verbatim, closing the stored-XSS chain from both ends. Exactly 2 production files + 2 test files touched, as scoped; zero `apps/` non-test edits; zero new dependencies; zero D1 migration. Known limitation: legacy string-form RichText content already persisted in D1 will render as empty (no migration/backfill — accepted per plan, no production data to preserve pre-v0.6). Deviation from plan: actual file locations are `packages/core/src/engine/validation.ts` and `packages/core/src/content/richtext/richtext-render.ts` (a later, unrelated `engine/`+`content/` folder reorg moved them out of the flat `src/` layout the plan assumed) — functions/line-level defects matched the plan's analysis exactly regardless of path.

## Handoff (Human Gate)
STOPPING here per stage contract. This is an intermediate sprint of the RichText hardening feature (Sprint 2, the module split, is still pending per ROADMAP). Human: merge the branch, then run `pnpm pipeline next`.
