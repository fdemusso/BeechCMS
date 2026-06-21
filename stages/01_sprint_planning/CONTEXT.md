## Inputs
- Layer 4 (working): ../00_ideation/output/feature_brief.md 
- Layer 4 (working): ../../graphify-out/ (Scansionabile esclusivamente tramite comandi CLI `graphify query`, `path`, e `explain`)
- Layer 3 (reference): ../../_config/ponytail_arch.md 
- Layer 3 (reference): ../../_config/graph_router.md
- Layer 3 (reference): ../../_config/sprint_template.md 

## Process
You are a Senior Systems Architect planning a new feature for the BeechCMS monorepo. Your output is a comprehensive Sprint Plan.

1. **Relational Mapping (Pre-computation):** Do not start writing linearly. First, read the `feature_brief.md`. Then, use the `graphify` CLI to explore the workspace. Identify the "God Nodes" and the edges affected by this feature. Understand the exact architectural boundaries between `@beechcms/core`, `apps/api`, and `apps/dashboard` before planning any implementation. Apply the routing strategies defined in `graph_router.md`.
2. **Architectural VETO Check:** Evaluate your proposed implementation against `ponytail_arch.md`. Ensure your plan strictly respects the Botanical Dialect (never bypass `@beech/core` for D1 queries) and the Vertical Slice Architecture (no cross-imports between features).
3. **Drafting:** Write the Sprint Plan strictly following the structure defined in `sprint_template.md`. You must populate every section (Why This Sprint Exists First, Current State, Deliverables, Task Details, Validation, Acceptance Criteria, Out of Scope).
4. **Concrete Artifacts:** Inside "Task Details", provide exact D1 SQL schemas, TypeScript interfaces, and middleware registration order based on your graphify exploration. Leave no ambiguity for the downstream execution agent.

## Outputs
execution_plan.md -> output/
