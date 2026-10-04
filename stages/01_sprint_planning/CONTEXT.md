## Inputs
- Layer 4 (working): ../00_ideation/output/feature_brief.md 
- Layer 4 (working): ../../graphify-out/ (Scansionabile esclusivamente tramite comandi CLI)
- Layer 4 (working, optional): output/rejections.md (Rejections from downstream stages. If present, you are RE-planning: address every listed reason explicitly.)
- Layer 4 (working, optional): output/backlog/ROADMAP.md (If present, this is a FOLLOW-UP sprint of a multi-sprint feature: plan the next pending sprint, using the archived plans in ../../docs/Sprints/ as the record of what previous sprints already shipped.)
- Layer 3 (reference): ../../_config/ponytail_arch.md 
- Layer 3 (reference): ../../_config/tooling_graphify.md
- Layer 3 (reference): ../../_config/sprint_template.md 
- Layer 3 (reference): ../../_config/testing_conventions.md (Read when the sprint produces or reorganizes tests: plans must specify tier, placement and fixture source, and must never spec a test that violates it)

## Process
You are a Senior Systems Architect planning a new feature for the BeechCMS monorepo. Your output is a comprehensive Sprint Plan.

1. **Relational Mapping (Strict Pre-computation):** Do not start drafting the Sprint Plan immediately. 
   - First, read `feature_brief.md`. 
   - Then, strictly following the constraints in `tooling_graphify.md`, use the CLI to map the workspace.
   - **MANDATORY:** Before writing the final Markdown output, you MUST generate a `### Pre-Computation Analysis` text block where you explicitly list:
     a) The "God Nodes" you identified via the CLI.
     b) The exact architectural boundaries affected across `@beechcms/core`, `apps/api`, and `apps/dashboard`.
     c) The output of your `graphify affected` impact analysis to prove you checked for breaking changes.

2. **Architectural VETO Check (Explicit Audit):** You cannot assume your plan is valid.
   - **MANDATORY:** Generate a `### VETO Audit` text block.
   - Explicitly evaluate your proposed boundaries from Step 1 against `ponytail_arch.md`. 
   - State clearly how your plan respects the Botanical Dialect (confirming no D1 queries bypass `@beechcms/core`) and the Vertical Slice Architecture (confirming zero cross-imports between features). If a violation is found, adjust your plan here before proceeding.
   - Only AFTER writing the Pre-Computation Analysis AND the VETO Audit are you allowed to begin drafting the linear Sprint Plan.

3. **Sprint Splitting (Scope Gate):** Decide if the feature brief fits ONE sprint. It does NOT fit when it requires sequential merges (e.g., core schema change must land before API, API before dashboard) or when deliverables span independent boundaries that should be validated separately.
   - If it fits: skip to Drafting.
   - If it does not fit: write `output/backlog/ROADMAP.md` — an ordered list of sprints, each with: slug, one-line goal, deliverables summary, and its dependency on the previous sprint. Then draft the DETAILED plan ONLY for the first (or next pending) sprint. NEVER write detailed Task Details for future sprints: the codebase and graph will have changed by the time they run, and stale SQL/interfaces are worse than no plan. Future sprints exist only as roadmap entries until their turn.
   - Everything deferred to a later sprint MUST appear in the current plan's "SECTION 7 — OUT OF SCOPE" with a reference to its roadmap entry.

4. **Drafting:** Write the Sprint Plan strictly following the structure defined in `sprint_template.md`. You must populate every section (Why This Sprint Exists First, Current State, Deliverables, Task Details, Validation, Acceptance Criteria, Out of Scope).

5. **Plan Altitude (what Task Details contain):** The plan does the executor's RESEARCH, not its WORK. You explore the repo, pick the single best path, and hand over a map the executor trusts instead of re-searching. A good plan does not do the executor's work in advance; it makes the executor's research dramatically simpler.
   - **Decide, don't survey.** Each task states the chosen approach and, in one line, why. No alternatives left open, no "or" choices handed to the executor.
   - **Point, don't paste.** Name every file to create/edit/delete, the exact symbols involved, and `path:line` references to the existing pattern to copy ("copy the shape of `getViewConfigHandler` in `handlers/view-config.ts:L11`"). Never reproduce existing code the executor can open itself.
   - **Building blocks are exact.** Write verbatim only what other modules, the DB, or the next sprint depend on: D1 SQL DDL, exported TypeScript interfaces/types and function signatures, component props, route + permission table rows, error codes, constant names with values, middleware registration order.
   - **Behaviour is prose.** Describe implementation as rules, invariants, edge cases and data flow ("drops refs that don't resolve; never throws; same input → same JSON"). NO function bodies, NO hook/component implementations, NO JSX, NO test code.
   - **Tests are a behaviour list.** For each test file: tier, path, fixture source, and one line per `it()` stating behaviour + outcome. The executor writes the test bodies following `testing_conventions.md`.
   - **Budget:** the whole plan file (Pre-Computation Analysis and VETO Audit included) is **at most 1000 lines**. This is a ceiling, not a target: a plan that fits in 400 lines must not be padded to 1000. If the sprint cannot be described within the budget, it is too big. Go back to step 3 and split it.
   - `sprint_template.md` SECTION 4 states the same rules in short form. If the two ever diverge, this step wins.

## Outputs
- [NameOfTheSprint].md -> output/ (exactly ONE detailed plan; the downstream execution agent refuses to run otherwise)
- backlog/ROADMAP.md -> output/backlog/ (only for multi-sprint features; updated, never deleted, on follow-up planning runs)
