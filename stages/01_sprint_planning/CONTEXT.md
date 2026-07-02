## Inputs
- Layer 4 (working): ../00_ideation/output/feature_brief.md 
- Layer 4 (working): ../../graphify-out/ (Scansionabile esclusivamente tramite comandi CLI)
- Layer 3 (reference): ../../_config/ponytail_arch.md 
- Layer 3 (reference): ../../_config/graph_router.md
- Layer 3 (reference): ../../_config/tooling_graphify.md
- Layer 3 (reference): ../../_config/sprint_template.md 

## Process
You are a Senior Systems Architect planning a new feature for the BeechCMS monorepo. Your output is a comprehensive Sprint Plan.

1. **Relational Mapping (Strict Pre-computation):** Do not start drafting the Sprint Plan immediately. 
   - First, read `feature_brief.md`. 
   - Then, strictly following the constraints in `tooling_graphify.md` and `graph_router.md`, use the CLI to map the workspace.
   - **MANDATORY:** Before writing the final Markdown output, you MUST generate a `### Pre-Computation Analysis` text block where you explicitly list:
     a) The "God Nodes" you identified via the CLI.
     b) The exact architectural boundaries affected across `@beechcms/core`, `apps/api`, and `apps/dashboard`.
     c) The output of your `graphify affected` impact analysis to prove you checked for breaking changes.

2. **Architectural VETO Check (Explicit Audit):** You cannot assume your plan is valid.
   - **MANDATORY:** Generate a `### VETO Audit` text block.
   - Explicitly evaluate your proposed boundaries from Step 1 against `ponytail_arch.md`. 
   - State clearly how your plan respects the Botanical Dialect (confirming no D1 queries bypass `@beech/core`) and the Vertical Slice Architecture (confirming zero cross-imports between features). If a violation is found, adjust your plan here before proceeding.
   - Only AFTER writing the Pre-Computation Analysis AND the VETO Audit are you allowed to begin drafting the linear Sprint Plan.

3. **Drafting:** Write the Sprint Plan strictly following the structure defined in `sprint_template.md`. You must populate every section (Why This Sprint Exists First, Current State, Deliverables, Task Details, Validation, Acceptance Criteria, Out of Scope).

4. **Concrete Artifacts:** Inside "Task Details", provide exact D1 SQL schemas, TypeScript interfaces, and middleware registration order based on your graphify exploration. Leave no ambiguity for the downstream execution agent.

## Outputs
[NameOfTheFeature].md -> output/
