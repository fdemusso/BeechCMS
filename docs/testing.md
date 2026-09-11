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

## Where a test file lives

| Kind | apps/api | apps/dashboard |
|------|----------|----------------|
| unit, subject inside a feature slice | co-located in the slice, or `src/features/<slice>/test/unit/` | `src/features/<slice>/test/unit/` |
| unit, subject outside any slice (`lib/`, `components/`, `middleware/`, `shared/`) | next to the source file | next to the source file |
| integration (real D1, `@beechcms/testing`) | `src/features/<slice>/test/integration/<name>.integration.test.ts` | — |
| crosses two or more slices | `test/flow/` | `src/test/cross-slice/` |
| e2e (browser) | top-level `e2e/` (Sprint 4, not built yet) | ← same |

`pnpm beech lint` runs `scripts/check-test-placement.mjs`, which fails the build on a misplaced test
file or a cross-slice import from inside a slice. The rules it enforces are the normative ones in
`_config/testing_conventions.md` §0-§1; the script is their executable form, not a second source of
truth.

A test that needs two feature slices is not a slice test. It goes to the cross-slice location above —
never into one of the slices it spans, which would manufacture the cross-slice import VSA forbids.

## Running one tier

| Tier | Command | CI job | Needs Docker |
|------|---------|--------|--------------|
| unit | `pnpm beech test --tier unit` | `unit` | no |
| flow | `pnpm beech test --tier flow` | `flow` | yes (`pnpm beech dev` stack) |
| integration | `pnpm beech test --tier integration` | `integration` | no (workerd + miniflare D1) |
| e2e | — | — | Sprint 4, not built yet |

`pnpm beech test --diff` runs the **unit and integration** tiers for the workspaces whose files
changed on the branch. The flow tier is never implicit — it costs the whole Docker stack — and the
e2e tier is refused outright. Add `--tier flow` to include it.

Tiers are declared once in `scripts/lib/test-tiers.mjs`; the vitest projects in
`apps/api/vitest.config.ts` and the CI jobs in `.github/workflows/test.yml` are its two consumers.
