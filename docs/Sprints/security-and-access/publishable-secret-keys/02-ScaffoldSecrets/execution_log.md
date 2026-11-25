# Execution log — ScaffoldSecrets

## SECTION 6 — Acceptance criteria

- [x] `wrangler.jsonc` `vars` = `ENV`, `CORS_ORIGINS`, `BEECH_PUBLISHABLE_KEY` (`beech_pk_dev`), `APP_URL`.
- [x] `.dev.vars` defines `JWT_SECRET`, `PUBLIC_TIME_TRAP_SECRET` (fresh 64-hex), `BEECH_SECRET_KEY=beech_sk_dev`, `PRIVACY_MASTER_KEY` (64-hex), R2 block as before.
- [x] `.dev.vars` git-ignored; no value in the first commit (`create.test.mjs` green, commit made).
- [x] Scaffolder prints the publishable key, no `.dev.vars` value, and a `wrangler secret put` line per `PRODUCTION_SECRETS`.
- [x] `create.mjs` generates no secret (`randomBytes`, `generateSecret` gone).
- [x] Release smoke passes in 55.5 s (budget 300): Time-Trap token 200, publishable read 200, secret write 201, publishable write 403 `public-api-secret-key-required`, exactly one entry.
- [x] `beech init` prints the publishable key and only the presence of the secret key; missing `.dev.vars` fails the local check.
- [x] `beech setup:cloudflare` (interactive) keeps every non-R2 line of an existing `.dev.vars` (new test in `setup-cloudflare.test.ts`).
- [x] No `beech forms` template sends `X-API-Key` or accepts a key prop/attribute.
- [x] `parseDevVars` / `upsertDevVars` signatures as in T3; `keyReportLines` not re-exported from `index.ts`.
- [x] SPDX headers on every new/edited test (BUSL in `scripts/lib`, MIT in `packages/cli`); no conditional assertions.
- [x] Every SECTION 5 command passes; closing greps as stated.
- [x] `git diff --stat` empty for `apps/api`, `apps/dashboard`, `packages/core`, `packages/client`.

## Validation

```
node --test scripts/lib/{template,create,publish-manifest}.test.mjs   17 pass, 0 fail
pnpm --filter @beechcms/cli type-check                                 ok
pnpm --filter @beechcms/cli test                                       32 files, 212 tests passed
pnpm --filter @beechcms/cli build                                      ok
pnpm lint                                                              20 tasks successful
pnpm lint:tests                                                        test placement — OK
pnpm beech test --diff                                                 PASS tests, PASS coverage (all 14 changed files)
pnpm build                                                             12 tasks successful
node scripts/smoke-release.mjs --budget-seconds 300                    passed, total 55.5s
graphify update .                                                      33050 nodes, 48176 edges
```

Closing greps:
1. only `apps/api/src/public/middleware/api-key-middleware.test.ts`
2. no hits in `forms.ts`
3. hits only in `PRODUCTION_SECRETS` and `buildDevVars`

Manual check (`node bin/create.mjs demo --yes --no-install`): `wrangler.jsonc` vars as above, `.dev.vars` holds the four secrets, printed note shows `beech_pk_dev` only. The secret key and generated values are not on screen.

## Deviations from the plan

- T2 note: the line "the API refuses `beech_sk_dev` outside development" contradicts the test rule "output prints no `.dev.vars` value (includes `beech_sk_dev`)". Reworded to "the local development key"; the test rule won.
- T4 test: the plan left the interactive branch untested, but `pnpm beech test --diff` fails changed-line coverage (0/3) for `setup-cloudflare.ts`. Added one test (`@clack/prompts` mocked) in `setup-cloudflare.test.ts`.
- T6: the final list read uses `?limit=10`. The first publishable read is edge-cached for 60 s by URL and would still answer with the empty list.

## Follow-ups (out of scope, per plan)

- `packages/forms-react`: `apiKey` prop in `useBeechForm` / `types.ts:86` and the `beech_sk_dev` default in `examples/ClientiTestPage.tsx:19` put a secret key in browser example code.

## Rework (review verdict REWORK_CODE)

- Finding 1 fixed: `setup-cloudflare.test.ts` — new `any` removed. Spawn result typed `as unknown as ReturnType<typeof spawnSync>`; `readFileSync` param typed `PathOrFileDescriptor`.
- Re-validation: `pnpm --filter @beechcms/cli type-check` ok; `pnpm --filter @beechcms/cli test` 32 files, 212 tests passed; `pnpm lint` no issues; `pnpm lint:tests` OK; `pnpm beech test --diff` PASS tests, PASS coverage; `graphify update .` done.
