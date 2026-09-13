# ROADMAP — RichText Validation & Render Hardening

Multi-sprint feature. Split mandated by `feature_brief.md` §4: the P0 security patch and the
mechanical module split MUST NOT share a diff (a security-critical change on the exact file
attackers touch must be reviewable in isolation, not buried in a 1175-line restructure).
Sprints are sequential: Sprint 1 must merge before Sprint 2 starts (Sprint 2 moves the code
Sprint 1 just changed; planning it now would encode stale line ranges).

---

## Sprint 1 — `RichTextValidationRenderHardening` (P0 Security & Correctness)  ← SHIPPED
**Goal:** Close the stored-XSS chain (#147/#148) and the DoS vector (#149) at both the input
gate (`validation.ts`) and the render sink (`richtext-render.ts`); fix the scientific-notation
`step` correctness bug. JSON-only + allowlists; no new bundle dependency.
**Deliverables:** surgical edits to `packages/core/src/engine/validation.ts` and
`packages/core/src/content/richtext/richtext-render.ts` + regression tests. No module split.
**Depends on:** nothing. Ships first.
**Status:** MERGED. Archived at `docs/Sprints/RichTextValidationRenderHardening/`
(plan + `execution_log.md` + `review_report.md`). The hardened `validation.ts` (now 1214 lines:
allowlist walker, `RICHTEXT_MAX_DEPTH=50`, `isProtocolAllowed`, `decimalPlaces`, string-reject)
and `richtext-render.ts` (string→`''`) are live on `devs`.

## Sprint 2 — `RichTextValidationModuleSplit` (Mechanical Split, zero logic change)  ← DETAILED, ACTIVE
**Goal:** Decompose the now-hardened `validation.ts` into focused modules so future edits do
not silently drop lines from a monolith.
**Deliverables:** `packages/core/src/engine/validation/` directory —
`richtext-sanitizer.ts`, `file-branch.ts`, `schema-builders.ts`, `cache.ts`, `index.ts`
(+ one shared `primitives.ts` leaf; see plan §VETO — required to keep the dependency graph
acyclic, the only deviation from the literal 5-module list). Pure cut-and-paste, reviewable as
moves; zero runtime behavior change; barrel (`index.ts`) keeps the public export surface
(`validateAndSanitizeSeedPayload`, `resolveFileOptions`, `isValidContentStatus`,
`ValidationDetail`, `ValidateSeedPayloadOptions`, `ValidateSeedPayloadResult`) byte-identical
through `@beechcms/core`. Also folds in the deferred `(issue as any).errors` Zod typing cleanup
(brief §5) as a compile-time-only tidy.
**Depends on:** Sprint 1 merged (done). Line ranges re-derived at this planning time against the
live 1214-line file.
**Status:** Detailed plan at `output/RichTextValidationModuleSplit.md`. Final sprint — feature
complete on merge.
