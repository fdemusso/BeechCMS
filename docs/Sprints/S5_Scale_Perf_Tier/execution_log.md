==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [x] The `scale` tier runs exclusively when requested via `--tier scale`.
- [x] Push/PR `--diff` runs automatically exclude the `scale` tier.
- [x] Test file placement complies exactly with Vertical Slice Architecture (`features/content/test/scale/`).

==========================================================================
VALIDATION OUTPUT
==========================================================================
$ cd packages/testing && npx tsc --noEmit
(Success)

$ cd apps/api && npx tsc --noEmit
(Success)

$ pnpm beech test --tier scale
@beechcms/api:test:scale:  RUN  v4.1.11 /Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api
@beechcms/api:test:scale: 
@beechcms/api:test:scale:  ✓  scale  src/features/content/test/scale/content-pagination.scale.test.ts > content slice — scale tier > GET /api/content/posts pagination performance > returns the first page and completes within performance bounds (< 150ms) 185ms
@beechcms/api:test:scale: 
@beechcms/api:test:scale:  Test Files  1 passed (1)
@beechcms/api:test:scale:       Tests  1 passed (1)
@beechcms/api:test:scale:    Start at  18:56:58
@beechcms/api:test:scale:    Duration  4.10s (transform 1.44s, setup 41ms, import 3.19s, tests 186ms, environment 0ms)
@beechcms/api:test:scale: 
 Tasks:    7 successful, 7 total
Cached:    6 cached, 7 total
  Time:    20.277s 
