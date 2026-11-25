## Summary

<!-- 1–2 sentences on the problem solved or capability added, and WHY. -->

Closes #<!-- issue number -->

**Type:** `feat` | `fix` | `docs` | `refactor` | `perf` | `test` | `chore`

---

## Agentic Provenance

- **Workflow:** <!-- Sprint pipeline (`docs/Sprints/<area>/<feature>/`) | Ad-hoc agentic session | Manual -->
- **Stage-03 Review:** <!-- PASS (link to `review_report.md`) | Pending | N/A -->

---

## Blast Radius & Risk Surface

> *For AI & human reviewers: inspect these boundaries before reading the full diff.*

- **Target branch:** `devs` (never `master`)
- **Packages / Apps touched:** <!-- e.g. `packages/core`, `apps/api`, `apps/dashboard`, `packages/cli`, `docs/` -->
- **Breaking changes:** <!-- `None` or concise upgrade / migration notes -->
- **High-risk surfaces:**
  - [ ] Auth / Keys / Permissions / Secrets
  - [ ] D1 Schema / Migrations
  - [ ] Dependencies (`package.json` / `pnpm-lock.yaml`)
  - [ ] Out-of-scope or cross-cutting refactor (explain below)

---

## Architecture & Invariant Checks

- [ ] **VSA & Core boundaries:** No cross-slice imports in `apps/api/src/features/` or `apps/dashboard/src/features/`; no raw D1/R2 binding access inside handlers (`@beechcms/core` `apiToDb`/`dbToApi` respected)
- [ ] **UI & i18n** *(if `apps/dashboard` touched)*: All 5 locales (`en`, `it`, `es`, `de`, `fr`) updated and `node scripts/check-design-tokens.mjs` clean
- [ ] **Docs & System Map:** `docs/SYSTEM_MAP.md`, reference docs, or `CHANGELOG.md` updated if public API, CLI, or architecture changed

---

## Verification Evidence

> *List exact commands run after the final edit and their observed results (counts/errors), not unchecked claims.*

- [ ] `pnpm build` — <!-- e.g. PASS (0 TypeScript errors) -->
- [ ] `pnpm beech test --tier unit` — <!-- e.g. PASS (X passed) / Not run -->
- [ ] `pnpm beech test --tier integration` — <!-- e.g. PASS (X passed) / Not run -->
- [ ] `pnpm lint` — <!-- e.g. PASS / Not run -->
- [ ] `pnpm docs:check && pnpm docs:build` *(if docs/types changed)* — <!-- e.g. PASS (0 TypeDoc errors) / N/A -->
- **Additional checks / runtime verification:** <!-- e.g. `node --test scripts/lib/*.test.mjs`, `pnpm beech test --tier flow`, `pnpm --filter @beechcms/cli test` -->

---

## Reviewer Focus & Known Limitations

<!-- Edge cases not tested, intentional shortcuts, or areas where the AI/human reviewer should focus. -->
