# Testing

BeechCMS test files belong to exactly one tier. The full binding rules — placement, anatomy,
fixtures, forbidden patterns, the review checklist — live in
[`_config/testing_conventions.md`](../_config/testing_conventions.md); this page is only a map to
that document, not a second copy of its rules.

| Tier | What is real | What may be faked | Where it lives |
|------|--------------|--------------------|-----------------|
| **unit** | the module under test, its pure collaborators | anything crossing an I/O boundary (HTTP client, D1, R2, SMTP) | next to the source file, or `<slice>/test/unit/` |
| **integration** | the full request path — Hono, every middleware, repositories, real D1 (`@cloudflare/vitest-pool-workers`) | `IClock`, `ITokenService` — nothing else | `<slice>/test/integration/` |
| **e2e** | everything, including a browser and a live API | nothing | top-level `e2e/` |

## Where a new test file goes

1. Pick the tier from the table above — a file mixing tiers is rejected at review.
2. Place it inside the slice that owns the code under test (Vertical Slice Architecture):
   `apps/api/src/features/<slice>/test/integration/*.integration.test.ts` for integration,
   co-located `*.test.ts` or `<slice>/test/unit/` for unit.
3. Build integration-tier fixtures through `@beechcms/testing` (`createTestHarness()`, the
   canonical seeds and users) — never a hand-rolled fake repository.

For everything else — the four-zone test anatomy, comment policy, naming, and the full forbidden
list — read `_config/testing_conventions.md`.
