# ROADMAP — Coverage Gate Recovery (`kanban-drag-stabilization`)

Feature brief `stages/00_ideation/output/feature_brief.md` does NOT fit one sprint.
Two independent boundaries validated separately, with a natural ordering:

1. **Config repair is behavior-neutral and root-cause** — the branch fails the SonarQube
   80% New-Code gate primarily because coverage-exclusion globs drifted after
   `refactor(core): reorganize packages/core/src flat files into domain-driven folders`.
   Repairing the globs changes the coverage *denominator* and must land first so the
   metric becomes meaningful before any test effort is measured.
2. **Test authoring / hook pure-logic extraction is a separate risk profile** — it
   changes the coverage *numerator*, touches product-adjacent runtime code, and carries
   behavior-parity risk (extract-and-verify before adding tests). Validated separately.

---

## Sprint 1 — `coverage-exclusion-repair` (DETAILED — see `../coverage-exclusion-repair.md`)
- **Goal:** Repair the two drifted coverage-exclusion mechanisms and lock them to a single
  mirrored source of truth.
- **Deliverables:** Fixed `apps/api/vitest.config.ts` exclude paths; rebuilt
  `sonar-project.properties` `sonar.coverage.exclusions` mirroring the current
  domain-driven layout; new-code glue exclusions for the `content-kanban` feature added to
  both `apps/dashboard/vitest.config.ts` and `sonar-project.properties`.
- **Depends on:** nothing (foundational).

## Sprint 2 — `newcode-test-authoring` (DETAILED — see `../newcode-test-authoring.md`)
- **Goal:** Cover the genuine new-code business logic still counting against the gate after
  Sprint 1.
- **Deliverables:** Dedicated unit test `auth.middleware.test.ts` (live coverage check showed
  this file is already 92.85% covered indirectly via integration flows — only line 33, the
  empty-Bearer-token guard, was dead; scope corrected accordingly, still added per rule 4).
  Extracted `kanban-reorder.ts` (`colValueFromDroppableId`, `resequenceCards`,
  `computeReorderBounds`) from `use-kanban-drag.ts`, and `kanban-autoscroll-math.ts`
  (`scrollDelta`) from `use-kanban-autoscroll.ts`, each with its own test file. Unit tests
  added for the previously-untested `fractional.ts` (0%) and `kanban-card-display.ts`
  (`resolveImageUrl` at 0%) — no source changes to either.
- **Depends on:** Sprint 1 merged (denominator must be correct before measuring residual gap;
  the extracted helper modules must be OUTSIDE the Sprint-1 glue-exclusion globs so they count) —
  confirmed satisfied: neither new helper module was added to `vitest.config.ts`/
  `sonar-project.properties` exclusions.
