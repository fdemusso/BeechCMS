# 1. Feature Definition and Core Value

The `kanban-drag-stabilization` branch (and future branches) must satisfy SonarQube's **New Code** Quality Gate, fixed at **80% aggregate coverage**, before merge is allowed. Today the branch fails this gate not primarily because logic is untested, but because the coverage exclusion configuration is broken: a prior domain-driven folder refactor (`refactor(core): reorganize packages/core/src flat files into domain-driven folders`) moved dozens of files without updating the glob patterns that were supposed to exclude them. Files like `apps/api/src/widget.ts` and `apps/api/src/shared/fixed-clock.ts` no longer exist at those paths — the real files (`apps/api/src/features/widget/widget.ts`, `apps/api/src/shared/services/clock/fixed-clock.ts`) silently fell out of exclusion and now report as 0% covered.

The core value of this feature is twofold: (a) establish a durable, unambiguous rule for what counts as "must be tested" vs "framework glue that dilutes the metric without reducing real risk," and (b) repair and re-synchronize the two coverage exclusion mechanisms in this repo — `vitest.config.ts` (per workspace) and `sonar-project.properties` (`sonar.coverage.exclusions`) — so both agree with the current file layout and with each other. Without this, no amount of new testing effort reliably moves the needle on the actual merge gate.

# 2. Domain Boundaries and Business Rules

**Entities involved:**
- **SonarQube New Code Quality Gate** — external system of record for merge readiness. Computes a single **aggregate ratio** (covered new-code lines ÷ total new-code lines across the whole diff), not a per-file check. Threshold and computation method are fixed constraints, not negotiable in this feature.
- **`sonar-project.properties`** (`sonar.coverage.exclusions`) — controls what SonarQube excludes from its new-code coverage denominator.
- **`vitest.config.ts`** (per workspace: `packages/core`, `packages/cli`, `apps/api`, `apps/dashboard`) — controls what the local Vitest coverage run excludes, via `coverage.exclude` / `coverage.include`.
- **`scripts/test-coverage-diff.mjs`** — local pre-merge helper. Reads each workspace's `vitest.config.ts` exclusions, runs coverage only on changed files, and gates **per file**: every changed file must individually meet its workspace's threshold. This is architecturally different from SonarQube's aggregate ratio and is treated as a stricter, conservative local proxy — **not** a guarantee of passing the real gate, and **not** to be modified in this feature.

**Ironclad classification rules (business rules for what gets tested):**
1. Any `.tsx` file is always excluded from coverage — frontend components are out of this feature's boundary entirely.
2. A `.ts` file is a testing candidate **only if** it contains pure functions or business rules. Framework glue — dependency wiring, bootstrap/registration code, in-memory stubs/test-doubles, adapters over external services, email templates — is excluded even when it is `.ts`, regardless of line count.
3. React hooks that mix pure business logic with DOM/React state/effects (e.g. drag-and-drop ordering, autoscroll thresholds) are not tested wholesale. Their pure sub-logic must be extracted into a standalone `.ts` helper module (the existing `fractional.ts` is the precedent); only the extracted helper is a testing candidate. The hook itself remains untested glue.
4. Security-critical logic (authentication middleware, JWT token service) is **always** a testing candidate, regardless of size or the glue/logic distinction above. This rule overrides all others.
5. `*.repository.d1.ts` files are excluded by default as CRUD/infrastructure glue. Exception carve-outs apply only to repositories carrying non-trivial query-building or branching logic beyond plain CRUD — candidates identified from the current report: `d1-widget.repository.ts`, `content.repository.d1.ts`, `automations.repository.d1.ts` (final confirmation deferred to implementation/architecture stage).
6. The two exclusion configs (`vitest.config.ts` per workspace, `sonar-project.properties`) must be repaired to match the current domain-driven folder structure and kept as a single conceptual source of truth — a change to one without the mirrored change to the other reproduces the exact drift bug that caused this situation.

# 3. Primary Requirements (User Stories)

* AS A developer I WANT unit tests written for files that contain pure business logic (position/fractional-index calculation, kanban drag/autoscroll helpers once extracted, automation rule evaluators, security token logic) SO THAT the 80% new-code coverage gate reflects genuine risk reduction instead of arbitrary line-padding.
* AS A developer I WANT framework glue (wiring, bootstrap, stubs, adapters, templates, plain CRUD repositories) excluded from both `vitest.config.ts` and `sonar-project.properties` SO THAT untestable or meaningless boilerplate never counts against the coverage threshold.
* AS A developer I WANT React hooks that mix business logic with DOM/state effects to have their pure logic extracted into standalone helper modules SO THAT business rules are verifiable without mocking React internals or the DOM.
* AS A security-conscious engineer I WANT authentication middleware and JWT token service logic always covered by tests, independent of size or the glue exclusion rules, SO THAT security-critical paths are never silently dropped from verification.
* AS A developer I WANT the coverage exclusion globs in `vitest.config.ts` and `sonar-project.properties` repaired to match the current post-refactor file paths SO THAT files already deemed "glue" stop incorrectly appearing as untested new code.
* AS A reviewer I WANT the branch's new code to reach SonarQube's 80% aggregate New Code coverage threshold SO THAT the branch is eligible for merge under existing project policy.

# 4. Secondary Requirements and Logical Constraints

- The local script's per-file gate (every changed file individually ≥ 80%) is stricter in shape than SonarQube's aggregate ratio and can diverge from it in both directions (a file below 80% can still be acceptable in the aggregate; conversely passing every file locally does not mathematically guarantee the aggregate clears 80%). This divergence is accepted as-is; the script stays unmodified and is understood as a conservative local heuristic, not a source of truth.
- Any exclusion glob added to `vitest.config.ts` must have a corresponding entry added to `sonar-project.properties`'s `sonar.coverage.exclusions`, and vice versa. Divergence between the two is the root cause already identified in this branch and must not be reintroduced.
- Repository carve-out candidates (`d1-widget.repository.ts`, `content.repository.d1.ts`, `automations.repository.d1.ts`) are provisional; final scope (which specific methods/branches inside them warrant tests) is determined during architecture/implementation, not here.
- Extraction of pure logic out of mixed hooks (rule 3) is itself an implementation task with its own risk (behavior must not change) — flagged for the architecture stage to sequence carefully (extract-and-verify-parity before adding new tests).
- Email templates, in-memory service stubs, and setup/bootstrap files are excluded even where they currently show large uncovered line counts (e.g. `apps/api/src/shared/email/templates/shell.ts`) — size of the uncovered gap does not override the glue classification.

# 5. Out of Scope (Discarded during sparring)

- Modifying `scripts/test-coverage-diff.mjs` to replicate SonarQube's aggregate-ratio math — explicitly rejected; the script stays as a per-file local proxy.
- Renegotiating or reconfiguring the 80% SonarQube New Code threshold itself — treated as a fixed external constraint.
- Testing `.tsx` frontend component files under any circumstance.
- End-to-end/`renderHook`-style testing of hooks that mix logic and DOM/state glue — only their extracted pure sub-logic is tested.
- Testing repository files that are plain CRUD wrappers with no meaningful branching/query-construction logic.
- Any new product functionality for kanban drag-and-drop or automations — this feature is scoped strictly to test/coverage hygiene and configuration repair, not feature work.
