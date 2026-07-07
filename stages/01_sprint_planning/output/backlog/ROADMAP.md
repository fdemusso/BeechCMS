# ROADMAP — RichText Validation & Render Hardening

Multi-sprint feature. Split mandated by `feature_brief.md` §4: the P0 security patch and the
mechanical module split MUST NOT share a diff (a security-critical change on the exact file
attackers touch must be reviewable in isolation, not buried in a 1175-line restructure).
Sprints are sequential: Sprint 1 must merge before Sprint 2 starts (Sprint 2 moves the code
Sprint 1 just changed; planning it now would encode stale line ranges).

---

## Sprint 1 — `RichTextValidationRenderHardening` (P0 Security & Correctness)  ← DETAILED, ACTIVE
**Goal:** Close the stored-XSS chain (#147/#148) and the DoS vector (#149) at both the input
gate (`validation.ts`) and the render sink (`richtext-render.ts`); fix the scientific-notation
`step` correctness bug. JSON-only + allowlists; no new bundle dependency.
**Deliverables:** surgical edits to `packages/core/src/engine/validation.ts` and
`packages/core/src/content/richtext/richtext-render.ts` + regression tests. No module split.
**Depends on:** nothing. Ships first.

## Sprint 2 — `RichTextValidationModuleSplit` (Mechanical Split, zero logic change)  ← ROADMAP ENTRY ONLY
**Goal:** Decompose the now-hardened `validation.ts` into 5 focused modules so future edits do
not silently drop lines from a monolith.
**Deliverables:** `richtext-sanitizer.ts`, `file-branch.ts`, `schema-builders.ts`, `cache.ts`,
`index.ts` — pure cut-and-paste, reviewable as moves; zero behavior change; barrel keeps the
public export surface (`validateAndSanitizeSeedPayload`, `resolveFileOptions`,
`isValidContentStatus`, `ValidationDetail`) identical. Also folds in the deferred
`(issue as any).errors` Zod typing cleanup (brief §5) since it is a pure-move-adjacent cosmetic.
**Depends on:** Sprint 1 merged (operates on the hardened file; line ranges are re-derived at
its planning time, not now).
