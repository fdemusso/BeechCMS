# Stage 02: Execution Log

**Sprint**: Decouple `seeds.ts` & Establish Cloudflare D1 as Canonical Schema Authority  
**Feature Branch**: `feature/decouple-seeds-ts-canonical-d1`  
**Base Branch**: `devs`  
**Execution Date**: 2026-09-01  
**Status**: ✅ Complete & Verified

---

## 1. Summary of Execution

This sprint decoupled `seeds.ts` from developer tooling, scaffolding, onboarding, deployment pipelines, and documentation. Cloudflare D1's `seeds` system table is now the sole, canonical runtime schema authority across all layers of BeechCMS.

### Key Changes by Domain

1. **Scaffolding (`bin/create.mjs` & `bin/templates/`)**:
   - Removed obsolete TypeScript template files (`blog.ts`, `gallery.ts`, `contact.ts`, `commerce.ts`, `tasks.ts`, `empty.ts`).
   - Cleaned `bin/create.mjs`: removed interactive content type prompts and `--with-examples` flag handling.
   - Scaffolded `worker.ts` now initializes cleanly with `createBeechApp({ seeds: [] })`.
   - Removed `seeds.ts` generation and `seed:load` script emission in generated `package.json`.

2. **Deployment Pipeline (`packages/cli/src/commands/deploy.ts`)**:
   - Streamlined deployment to a pure 2-step pipeline (`[1/2] Deploying Worker…`, `[2/2] Checking admin URL…`).
   - Removed subprocess invocation of `npx beech seed:load`.
   - Deprecated `skipSeed` option in `DeployOptions`.

3. **Initialization & Onboarding (`packages/cli/src/commands/init.ts`, `onboard.ts`, `update.ts`)**:
   - Removed preflight checks for `seeds.ts` / `seed.ts` in `init.ts`.
   - Isolated `onboard.ts` to pure database provisioning (`init({ initDb: true, ... })`), eliminating `seedLoad` invocation.
   - Updated next-step guidance to direct developers to `npx wrangler dev` and the admin dashboard at `/admin`.

4. **CLI Deprecations & Cleanups (`packages/cli/src/commands/`, `bin/cli.mjs`)**:
   - Converted `seed:load`, `seed:create`, and `schema:diff` into graceful no-op deprecation warnings guiding developers to `/admin` and `/api/seeds`.
   - Updated `validate.ts` to report runtime validation status while preserving core schema validator functions.
   - Removed `tryLoadLocalRegistry()` from `bin/cli.mjs`, eliminating runtime subprocess node execution for `.ts` files.
   - Updated CLI help manuals and command classifications.

5. **Local Bootstrap & Localization (`apps/api/scripts/bootstrap-d1.mjs`, `apps/dashboard/src/locales/`)**:
   - Removed `seed:load` subprocess execution from `bootstrap-d1.mjs`, retaining idempotent base D1 migrations.
   - Updated `en.json` and `it.json` locale strings for dashboard setup checklist to reflect dynamic database-backed content types.

6. **Documentation & System Maps**:
   - Updated `_config/SYSTEM_MAP.md`, `_config/commands.md`, `docs/guide.md`, `docs/first-project.md`, `docs/development.md` to reflect D1 database-first authority.

7. **Test Suites & Verification**:
   - Updated CLI test suite (`packages/cli/src/test/seed-load.test.ts`, `schema-diff.test.ts`, `validate.test.ts`).
   - Verified that all unit and integration test suites pass across all monorepo workspaces (API, Dashboard, CLI, Core, Client, Widget SDK, Forms React, Search Client).

---

## 2. Acceptance Criteria Checklist

- [x] **AC-1: Clean Scaffolding** — Running `create-beech-app` or `bin/create.mjs` generates a project without `seeds.ts` or `bin/templates/`, emitting `createBeechApp({ seeds: [] })` in `worker.ts`.
- [x] **AC-2: Single Responsibility Deployment** — `beech deploy` runs in 2 steps without calling `seed:load` or modifying D1 schemas.
- [x] **AC-3: Non-Blocking Init & Onboard** — `beech init` and `beech onboard` succeed without checking or expecting `seeds.ts` on disk.
- [x] **AC-4: Graceful CLI Deprecation** — Invoking `beech seed:load`, `beech seed:create`, or `beech schema:diff` prints a clear deprecation message pointing to `/admin` and exits with code 0.
- [x] **AC-5: Monorepo Clean Build & Test Suite** — `pnpm run build`, `pnpm test`, and `pnpm lint` pass with zero errors.
- [x] **AC-6: Up-to-Date System Maps & Guides** — `_config/SYSTEM_MAP.md`, `_config/commands.md`, and `docs/` reflect canonical D1 schema authority.
- [x] **AC-7: AST Graph Synchronized** — `graphify update .` executed and graph synchronized.

---

## 3. Validation Test Matrix & Results

| Check / Suite | Scope | Result | Details |
|---|---|---|---|
| `pnpm run build` | Full Monorepo (9 packages) | ✅ Passed | All packages built successfully (Core, Client, Widget SDK, Search Client, CLI, Forms React, API, Dashboard). |
| `pnpm --filter @beechcms/cli test` | CLI Package | ✅ Passed | 11 test files, 57 tests passed in 699ms. |
| `pnpm --filter @beechcms/api test` | API Package | ✅ Passed | 115 test files, 1,338 tests passed. |
| `pnpm --filter @beechcms/dashboard test` | Dashboard Package | ✅ Passed | 103 test files, 775 tests passed. |
| `pnpm test` | Consolidated Monorepo Test | ✅ Passed | 278 test files, 2,834 tests passed across all packages. |
| `pnpm lint` | Turborepo ESLint | ✅ Passed | Zero lint errors and zero warnings across all 9 packages. |
| CLI Smoke Test | `bin/cli.mjs` | ✅ Passed | `--help`, `seed:load`, `seed:create`, `schema:diff` all behave as specified. |
| AST Graph Sync | `graphify update .` | ✅ Passed | 10,710 nodes, 19,089 edges, 892 communities rebuilt. |

---

## 4. Modified & Deleted Files Log

### Files Deleted
- `bin/templates/blog.ts`
- `bin/templates/commerce.ts`
- `bin/templates/contact.ts`
- `bin/templates/empty.ts`
- `bin/templates/gallery.ts`
- `bin/templates/tasks.ts`

### Files Modified
- `bin/create.mjs`
- `bin/cli.mjs`
- `packages/cli/src/commands/deploy.ts`
- `packages/cli/src/commands/init.ts`
- `packages/cli/src/commands/onboard.ts`
- `packages/cli/src/commands/update.ts`
- `packages/cli/src/commands/validate.ts`
- `packages/cli/src/commands/seed-load.ts`
- `packages/cli/src/commands/seed-create.ts`
- `packages/cli/src/commands/schema-diff.ts`
- `packages/cli/src/test/seed-load.test.ts`
- `packages/cli/src/test/schema-diff.test.ts`
- `packages/cli/src/test/validate.test.ts`
- `apps/api/scripts/bootstrap-d1.mjs`
- `apps/dashboard/src/locales/en.json`
- `apps/dashboard/src/locales/it.json`
- `_config/SYSTEM_MAP.md`
- `_config/commands.md`
- `docs/development.md`
- `docs/first-project.md`
- `docs/guide.md`
