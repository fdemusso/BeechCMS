# Sprint Output Template (Strictly Enforced)

Every generated sprint plan must strictly follow this structure. Do not omit, reorder, or rename sections.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
[Explain the architectural rationale. Explicitly state how this sprint adheres to Vertical Slice Architecture (VSA) and the Botanical Engine invariants. Why must these foundational pieces be built before anything else?]

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
[Map the existing architecture relevant to this feature. List existing patterns, context variables (e.g., `AppEnv.Variables`), and the exact middleware registration order. Do not guess; rely exclusively on `graphify` exploration.]

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
[Provide a concrete list of the exact files that will be produced or modified in this sprint. Clarify if feature code is excluded (e.g., "only contracts + no-op stub").]

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
[Provide surgical implementation details for the downstream agent. 
- For D1 migrations: provide the exact SQLite `CREATE TABLE` and `CREATE INDEX` statements.
- For TypeScript: provide the exact interfaces, types, and stubs, including correct imports and strict typings.
Leave zero ambiguity.]

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
[Provide the exact shell commands required to validate the build and tests. Use the unified `pnpm beech` CLI where a command exists for the task; fall back to workspace scripts only for build/typecheck.
Examples: 
- `pnpm run build` in `packages/core/`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm beech test` (add `--diff` to scope to changed packages)
- `pnpm beech db:migrate`
- `pnpm beech db:reset`]

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
[Provide a strict `[ ]` checklist of requirements that must be met before the PR can be merged. Include typing constraints, zero-dependency rules for core interfaces, and successful build checks.]

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
[Explicitly list what the executing agent MUST NOT build or modify during this sprint (e.g., UI implementation, concrete runners, specific REST endpoints) to prevent over-engineering and scope creep.]
