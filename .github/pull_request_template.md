## What does this PR do?

<!-- Describe the change in 1-2 sentences. What problem does it solve or what feature does it add? -->

Closes #<!-- issue number -->

---

## Type of change

- [ ] `feat` — new feature or capability
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only
- [ ] `refactor` — internal restructure, no behaviour change
- [ ] `perf` — performance improvement
- [ ] `test` — adding or updating tests
- [ ] `chore` — tooling, dependencies, config

---

## Architecture checklist

- [ ] Branch targets `devs`, **not** `master`
- [ ] No imports from another feature's internal files (cross-feature isolation respected)
- [ ] No `context.env.DB`, `context.env.BUCKET`, or other Cloudflare binding access inside handlers
- [ ] Any new data dependency has an interface in `packages/core` and a concrete implementation in `apps/api/src/shared/`
- [ ] New interfaces are injected via middleware and declared in `apps/api/src/types.ts`

---

## Code quality checklist

- [ ] No unexplained acronyms or single-letter variable names
- [ ] No chained ternary expressions — guard clauses used instead
- [ ] No logic gaps left without an explanatory comment
- [ ] No `TODO` comments without a linked GitHub issue (e.g. `// TODO: #42 add ETag support`)
- [ ] No partially resolved logic — every code path is handled

---

## Documentation checklist

- [ ] `docs/system-map.md` updated if new interfaces, middleware, or slices were added
- [ ] `docs/api-reference.md` updated if HTTP routes or payloads changed
- [ ] `docs/automations.md` updated if automation hooks were added or modified
- [ ] JSDoc added to every exported interface method

---

## Testing checklist

- [ ] Tests are co-located next to the files they cover (`<filename>.test.ts`)
- [ ] New handlers have at least one happy-path and one error-path test
- [ ] `pnpm build` passes with no TypeScript errors
- [ ] `pnpm test` passes

---

## Notes for the reviewer

<!-- Anything that needs extra context, known limitations, or follow-up issues already planned. -->
