# Sprint Output Template (Strictly Enforced)

Every generated sprint plan must strictly follow this structure[cite: 2]. Do not omit, reorder, or rename sections.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
[Explain the architectural rationale. Explicitly state how this sprint adheres to Vertical Slice Architecture (VSA) and the Botanical Engine invariants[cite: 2]. Why must these foundational pieces be built before anything else?]

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
[Map the existing architecture relevant to this feature[cite: 2]. List existing patterns, context variables (e.g., `AppEnv.Variables`), and the exact middleware registration order[cite: 2]. Do not guess; rely exclusively on `graphify` exploration.]

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
[Provide a concrete list of the exact files that will be produced or modified in this sprint[cite: 2]. Clarify if feature code is excluded (e.g., "only contracts + no-op stub")[cite: 2].]

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
[Provide surgical implementation details for the downstream agent. 
- For D1 migrations: provide the exact SQLite `CREATE TABLE` and `CREATE INDEX` statements[cite: 2].
- For TypeScript: provide the exact interfaces, types, and stubs, including correct imports and strict typings[cite: 2].
Leave zero ambiguity.]

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
[Provide the exact shell commands required to validate the build and tests[cite: 2]. 
Examples: 
- `pnpm run build` in `packages/core/`[cite: 2]
- `npx tsc --noEmit` in `apps/api/`[cite: 2]
- `pnpm run test`[cite: 2]
- `pnpm run db:reset:local`[cite: 2]]

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
[Provide a strict `[ ]` checklist of requirements that must be met before the PR can be merged[cite: 2]. Include typing constraints, zero-dependency rules for core interfaces, and successful build checks[cite: 2].]

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
[Explicitly list what the executing agent MUST NOT build or modify during this sprint (e.g., UI implementation, concrete runners, specific REST endpoints) to prevent over-engineering and scope creep[cite: 2].]
