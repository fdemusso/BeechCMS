# `@beechcms/e2e`

Browser-driven end-to-end tier. Boots the real API (`wrangler dev` on workerd) and the real
dashboard (Vite) on dedicated ports, then drives Chromium against them.

## Running

```bash
pnpm beech test --tier e2e
```

This recreates a throwaway database (`e2e/.wrangler-e2e/`, wiped on every run), starts:

- the API on port `8799` (`wrangler dev`, `--persist-to ../../e2e/.wrangler-e2e`)
- the dashboard on port `5273` (`vite`, proxying to the e2e API via `BEECH_DEV_API_TARGET`)

and then runs the `setup` project (provisioning) followed by the `chromium` project (the specs).

## Config seams it relies on

- `BEECH_D1_PERSIST_DIR` (`apps/api/scripts/bootstrap-d1.mjs`) — points the D1 bootstrap at
  `e2e/.wrangler-e2e` instead of a developer's local `.wrangler/state`.
- `BEECH_DEV_API_TARGET` (`apps/dashboard/vite.config.ts`) — points the dashboard's dev proxy at
  the e2e API (port 8799) instead of a developer's running `pnpm beech dev` (port 8789).

Both are no-ops when unset — a developer's local stack is unaffected.

## Why `@beechcms/api` and `@beechcms/dashboard` are dependencies

No TypeScript import references either package. They are declared so Turbo's
`dependsOn: ["^build"]` builds the dashboard before `test:e2e` runs, which is what guarantees
`apps/dashboard/dist` exists for `wrangler.jsonc`'s `assets.directory` (`../dashboard/dist`).

## Why there is no `test` script

`scripts/test-runner.mjs` and `turbo run test` select tasks by name. A `test` script here would
pull a browser process into `pnpm test` and the root fingerprint-cached run. This workspace
declares `test:e2e` only, so it never enters that task graph.

## What this tier deliberately does not cover

Uploads, email and webhooks need the Docker stack (MinIO, Mailpit, webhook-tester) and belong to
the flow tier. RBAC matrices, drafts, kanban, search and the setup wizard UI are already covered
at the unit/integration tiers.
