# Sprint Plan: Decouple seeds.ts and Formalize Canonical D1 Schema Authority

### Pre-Computation Analysis

1. **God Nodes Identified via Knowledge Graph & CLI:**
   - `packages_cli_src_commands_deploy_deploy` (`packages/cli/src/commands/deploy.ts`): Orchestrates deployment; previously coupled worker publishing with subprocess execution of `seed:load`.
   - `packages_cli_src_commands_init_init` (`packages/cli/src/commands/init.ts`): Primary initialization gate; previously checked filesystem for `seeds.ts` and issued blocking/warning logs.
   - `packages_cli_src_commands_onboard_onboard` (`packages/cli/src/commands/onboard.ts`): Combined bootstrap workflow; previously sequentially chained `init` and `seedLoad`.
   - `packages_cli_src_commands_seed_load_seedload` (`packages/cli/src/commands/seed-load.ts`): Legacy schema compiler executing AST-to-DDL against D1 from local filesystem.
   - `packages_core_src_engine_seeds_seed_registry` (`packages/core/src/engine/seeds.ts`): Core in-memory registry object, decoupled from runtime schema resolution in `@beechcms/api`.
   - `bin_create_mjs` (`bin/create.mjs`): Project initialization wizard generating boilerplate `seeds.ts` files and templates.

2. **Architectural Boundaries Affected:**
   - `@beechcms/core`: Retains pure type definitions (`Seed`, `Branch`), DDL generators (`generateCreateTable`, `generateIndexes`, `generateDraftTable`, `generateFtsTable`), and schema validators. Invariant: `@beechcms/core` remains zero-dependency with no filesystem I/O.
   - `apps/api`: Already canonicalized around runtime schema resolution via `D1SeedRepository` and `seedRegistryMiddleware()`. `apps/api/src/index.ts` runs with `seeds: []`. Affected script: `apps/api/scripts/bootstrap-d1.mjs` (removal of legacy `seed:load` subprocess trigger).
   - `apps/dashboard`: Admin interface interacts with content types strictly via transactional `/api/seeds` endpoints. Affected assets: UI localization dictionaries `apps/dashboard/src/locales/{en,it}.json` (removal of static `seeds.ts` wording in favor of dynamic D1 content type counts).
   - `packages/cli` & `bin/`: Decoupled completely from static schema files; CLI commands `deploy`, `init`, and `onboard` stripped of `seeds.ts` dependencies; obsolete commands (`seed:load`, `seed:create`, `schema:diff`, file-based `validate`) gracefully deprecated with architectural redirection.

3. **`graphify affected` Impact Analysis:**
   - `graphify affected "packages_cli_src_commands_seed_load_seedload" --depth 2`:
     - Nodes affected: `onboard()` (`packages/cli/src/commands/onboard.ts:L23`), `onboard.ts` (`packages/cli/src/commands/onboard.ts:L7`), `cli/src/index.ts` (`packages/cli/src/index.ts:L4`).
     - Impact: Modifying/deprecating `seedLoad` isolates `onboard()` to pure database table bootstrapping without runtime schema side-effects.
   - `graphify affected "packages_cli_src_commands_init_init" --depth 2`:
     - Nodes affected: `onboard()` (`packages/cli/src/commands/onboard.ts:L20`), `cli/src/index.ts` (`packages/cli/src/index.ts:L6`).
     - Impact: Removing `seeds.ts` preflight checks simplifies `init` into a non-blocking system table provisioner.
   - `graphify affected "packages_cli_src_commands_deploy_deploy" --depth 2`:
     - Nodes affected: `cli/src/index.ts` (`packages/cli/src/index.ts:L12`).
     - Impact: Removing `seed:load` execution transforms `beech deploy` into a pure, atomic Cloudflare Worker + Assets deployment pipeline.

---

### VETO Audit

- **Rule 1 (Ruthless VETO / YAGNI):** APPROVED. Removing legacy file-based schema compilation code and unused scaffolding templates eliminates dual-state bugs and code drift without adding runtime overhead.
- **Rule 2 (Botanical Invariant):** APPROVED. All database operations and schema mutations continue to flow through the Botanical Engine and `D1SeedRepository`/`/api/seeds`. No CLI commands or external scripts bypass `@beechcms/core` to write raw non-botanical DDL.
- **Rule 3 (VSA Enforcement):** APPROVED. Slices inside `apps/api/src/features/` and `apps/dashboard/src/features/` remain completely isolated. No cross-slice imports are introduced.
- **Rule 4 (Cloudflare Purity):** APPROVED. Eliminates node-specific filesystem evaluation during worker deployment. Worker deployment becomes 100% edge-native and independent of host filesystem schema files.
- **Rule 5 (Minimalist Blueprint):** APPROVED. Minimum set of changes across CLI wrappers, create wizard, local bootstrap script, locale files, and docs.
- **Rule 6 (Handoff):** HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

BeechCMS previously operated under an ambiguous schema lifecycle: while the runtime API (`apps/api`) and dashboard (`apps/dashboard`) evolved to treat Cloudflare D1's `seeds` system table as the dynamic, transactional source of truth for all content schemas, the developer tooling (`@beechcms/cli`), project scaffolding (`bin/create.mjs`), deployment command (`beech deploy`), and official documentation remained tethered to a code-first `seeds.ts` model.

This duality introduced critical failure modes:
1. **Deployment Failures & Schema Drift:** `beech deploy` attempted to execute `seed:load` against production D1 databases during Worker releases, causing failing or partial DDL operations, out-of-order foreign key application, and silent corruption when local files differed from runtime state.
2. **Onboarding Friction:** Scaffolding and initialization commands enforced rigid static schema file templates and raised false warnings if `seeds.ts` was not detected.
3. **Architectural Inconsistency:** Developers and AI agents received conflicting signals regarding whether content schemas should be edited in code files or managed through the CMS runtime API.

This sprint formalizes Cloudflare D1 as the single, canonical authority for all content schemas. It purges legacy file-first synchronization mechanisms from CLI commands and templates, converts deployment into a pure Worker publishing pipeline, establishes clean non-blocking provisioning, and provides graceful deprecation paths for obsolete commands.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

- **API Runtime Architecture (`apps/api/src/index.ts`, `apps/api/src/factory.ts`):**
  - Instantiated via `createBeechApp({ seeds: [], jobs, hooks: semanticSearchHooks })`.
  - Middleware order:
    1. `repositoryMiddleware`: Injects repositories (including `D1SeedRepository(env.DB)`).
    2. `seedRegistryMiddleware`: Dynamically hydrates active seeds from D1 `seeds` table with isolate-level version token cache.
    3. `storageMiddleware`, `queueMiddleware`, `authProvidersMiddleware`, `rateLimiterMiddleware`, `observabilityMiddleware`, CORS, Security Headers, `analyticsMiddleware`.
    4. Routes: Setup (`/setup`), Auth (`/auth/*`), Protected CMS API (`/api/seeds`, `/api/content/*`, `/api/schema`, etc.), Public API (`/api/v1/public/*`).
- **CLI Commands (`packages/cli/src/commands/`):**
  - `deploy.ts`: Executes `npm run deploy`, followed by `spawnSync('npx', ['beech', 'seed:load'])`, followed by `/admin` reachability probe.
  - `init.ts`: Runs `checkFiles()` which checks for `seeds.ts`/`seed.ts` and prints warning if missing. Recommends `npx beech seed:load` in next steps.
  - `onboard.ts`: Chained `init({ initDb: true })` + `seedLoad({ ... })`.
  - `seed-load.ts`: Reads local `seeds.ts` via node evaluation, validates definitions, diffs against D1, and executes raw DDL.
  - `seed-create.ts`: Interactive CLI prompt appending TypeScript blocks to local `seeds.ts`.
  - `schema-diff.ts`: Diffs local `SEED_REGISTRY` against D1 SQLite schema and generates physical migration files.
  - `generate-types.ts`: Introspects active `seeds` rows in D1 directly and produces TypeScript interfaces via `generateSeedTypes()` (already database-first).
- **Scaffolding (`bin/create.mjs` & `bin/templates/`):**
  - Contains hardcoded templates (`blog.ts`, `gallery.ts`, `contact.ts`, `commerce.ts`, `tasks.ts`, `empty.ts`).
  - Prompts developer for content type templates during project creation.
  - Emits `seeds.ts` and configures `worker.ts` with `import { SEED_REGISTRY } from './seeds'`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

1. **Scaffolding Wizard & Templates:**
   - Modified: `bin/create.mjs` (strip template prompts, remove `seeds.ts` generation, update `worker.ts` template to `createBeechApp({ seeds: [] })`, update `package.json` scripts).
   - Removed: `bin/templates/blog.ts`, `bin/templates/gallery.ts`, `bin/templates/contact.ts`, `bin/templates/commerce.ts`, `bin/templates/tasks.ts`, `bin/templates/empty.ts`.

2. **Core CLI Command Upgrades (`packages/cli`):**
   - Modified: `packages/cli/src/commands/deploy.ts` (pure worker deploy, eliminate `seed:load` execution, remove `--skip-seed` flag or make deprecated no-op).
   - Modified: `packages/cli/src/commands/init.ts` (remove `seeds.ts` existence check and warnings, update next steps).
   - Modified: `packages/cli/src/commands/onboard.ts` (remove `seed:load` execution, execute clean system table initialization).
   - Modified: `packages/cli/src/commands/update.ts` (update post-update next steps to remove `seed:load`).
   - Modified: `packages/cli/src/commands/seed-load.ts` (graceful deprecation notice pointing to runtime D1 / dashboard).
   - Modified: `packages/cli/src/commands/seed-create.ts` (graceful deprecation notice pointing to dashboard / `/api/seeds`).
   - Modified: `packages/cli/src/commands/schema-diff.ts` (graceful deprecation notice pointing to canonical D1 authority).
   - Modified: `packages/cli/src/commands/validate.ts` (graceful notice or DB-first schema validation guidance).
   - Modified: `bin/cli.mjs` (remove `tryLoadLocalRegistry()`, update help manual, update command handlers).

3. **Runtime Bootstrap Script:**
   - Modified: `apps/api/scripts/bootstrap-d1.mjs` (remove `seed:load` invocation; ensure system migrations apply cleanly).

4. **Dashboard Localization:**
   - Modified: `apps/dashboard/src/locales/en.json` (update `seeds` / `seedsNone` strings).
   - Modified: `apps/dashboard/src/locales/it.json` (update `seeds` / `seedsNone` strings).

5. **Documentation & System Architecture Reference:**
   - Modified: `_config/SYSTEM_MAP.md` (remove static seed file compiler mentions; state D1 canonical authority).
   - Modified: `_config/commands.md` (update unified CLI command list).
   - Modified: `docs/guide.md`, `docs/first-project.md`, `docs/development.md` (document DB-first workflow and migration guide).

6. **CLI Test Suite:**
   - Modified: `packages/cli/src/test/seed-load.test.ts`
   - Modified: `packages/cli/src/test/validate.test.ts`
   - Modified: `packages/cli/src/test/schema-diff.test.ts`

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1: Scaffolding Wizard Overhaul (`bin/create.mjs`)
1. Remove `TEMPLATES` object and `readTemplate()` helper.
2. Remove template selection prompt (`p.multiselect({ message: 'Which content types do you need?'... })`) from interactive branch.
3. Remove `buildSeedsTs()` and `buildSeedsFile()`.
4. Update `buildWorkerTs()` to emit:
   ```ts
   /// <reference types="@cloudflare/workers-types" />
   import { createBeechApp } from '@beechcms/api'

   export default createBeechApp({ seeds: [] })
   ```
5. Update `buildPackageJson(name)`:
   - Remove `"seed:load": "npx beech seed:load"` and `"seed:load:local": "npx beech seed:load --local"` from `scripts`.
   - Keep `"dev"`, `"deploy"`, `"db:migrate:local"`, `"db:reset:local"`.
6. Update next steps note (`p.note`):
   - Step 3: Run local migrations (`npm run db:migrate:local`).
   - Step 4: Start dev server (`npx wrangler dev`), open `http://localhost:8789/admin`.
   - Update footer note: Replace `"Your content types are defined in seeds.ts"` with `"Manage content types dynamically in the BeechCMS Dashboard at /admin."`.
7. Delete files in `bin/templates/`.

### Task 2: Pure Deployment Pipeline (`packages/cli/src/commands/deploy.ts`)
1. Refactor `DeployOptions` interface:
   ```ts
   export interface DeployOptions {
     skipCheck?: boolean
     /** @deprecated Content schemas are managed in Cloudflare D1; seed:load is no longer executed during deploy. */
     skipSeed?: boolean
   }
   ```
2. In `deploy(args: DeployOptions)`:
   - Step 1: `[1/2] Deploying Worker…` (`spawnSync('npm', ['run', 'deploy'], ...)`).
   - Remove Step 2 (`spawnSync('npx', ['beech', 'seed:load'])`).
   - Step 2: `[2/2] Checking admin URL…` (run `checkAdmin` as before).
   - Ensure non-zero exit code on worker deployment failure.

### Task 3: Non-Blocking Initialization & Clean Onboarding (`packages/cli/src/commands/init.ts` & `onboard.ts`)
1. In `packages/cli/src/commands/init.ts`:
   - In `checkFiles()`: Remove checks for `seeds.ts`, `seeds.js`, `seed.ts`, `seed.js`.
   - In `printNextSteps(local: boolean)`:
     ```ts
     function printNextSteps(local: boolean): void {
       console.log(pc.dim('  Next steps:'))
       console.log(pc.cyan('  1. npx wrangler dev'))
       console.log(pc.dim('      → start API + dashboard'))
       console.log(pc.cyan('  2. Open http://localhost:8789/admin'))
       console.log(pc.dim('      → complete initial admin setup and manage content types\n'))
     }
     ```
   - In `init()` completion output: Remove `✓ seeds.ts` log line.
2. In `packages/cli/src/commands/onboard.ts`:
   - Refactor `OnboardOptions`:
     ```ts
     export interface OnboardOptions {
       local: boolean
       yes: boolean
       db?: string
       /** @deprecated Database is the canonical source of truth; registry is no longer loaded from file. */
       registry?: Record<string, Seed> | null
     }
     ```
   - Remove `import { seedLoad } from './seed-load.js'`.
   - `onboard()` only runs `await init({ initDb: true, local: args.local, db: args.db, nonInteractive: args.yes })`.
   - Print clean provisioning completion output with next steps.

### Task 4: CLI Command Deprecations & Binary Cleanups (`packages/cli/src/commands/*` & `bin/cli.mjs`)
1. `packages/cli/src/commands/seed-load.ts`:
   ```ts
   import pc from 'picocolors'
   import type { Seed } from '@beechcms/core'

   export interface SeedLoadOptions {
     dryRun?: boolean
     diff?: boolean
     local?: boolean
     db?: string
     registry?: Record<string, Seed> | null
   }

   export async function seedLoad(_args: SeedLoadOptions = {}): Promise<void> {
     console.log(pc.yellow('\n  ⚠ "beech seed:load" is deprecated'))
     console.log(pc.dim('  Content schemas in BeechCMS are managed dynamically at runtime in Cloudflare D1.'))
     console.log(pc.dim('  Static seeds.ts files are no longer synchronized to the database.'))
     console.log(pc.cyan('\n  → To manage content types, open the dashboard at /admin or use the /api/seeds API.\n'))
   }
   ```
2. `packages/cli/src/commands/seed-create.ts`:
   ```ts
   import pc from 'picocolors'

   export type SeedCreateOptions = Record<string, never>

   export async function seedCreate(_args: SeedCreateOptions = {}): Promise<void> {
     console.log(pc.yellow('\n  ⚠ "beech seed:create" is deprecated'))
     console.log(pc.dim('  Content schemas in BeechCMS are managed dynamically at runtime in Cloudflare D1.'))
     console.log(pc.cyan('\n  → Create new content types directly in the BeechCMS Dashboard (/admin) or via POST /api/seeds.\n'))
   }
   ```
3. `packages/cli/src/commands/schema-diff.ts`:
   ```ts
   import pc from 'picocolors'
   import type { Seed } from '@beechcms/core'

   export interface SchemaDiffOptions {
     local?: boolean
     write?: boolean
     name?: string
     migrationsDir?: string
     db?: string
     registry?: Record<string, Seed> | null
   }

   export async function schemaDiff(_args: SchemaDiffOptions = {}): Promise<void> {
     console.log(pc.yellow('\n  ⚠ "beech schema:diff" is deprecated'))
     console.log(pc.dim('  Cloudflare D1 is the canonical authority for schema definitions.'))
     console.log(pc.dim('  Runtime schema mutations are handled automatically by the Botanical Engine.'))
     console.log(pc.cyan('\n  → Schema diffing from static files is no longer supported.\n'))
   }
   ```
4. `packages/cli/src/commands/validate.ts`:
   ```ts
   import pc from 'picocolors'
   import type { Seed } from '@beechcms/core'

   export interface ValidateOptions {
     registry?: Record<string, Seed> | null
   }

   export async function validate(_args: ValidateOptions = {}): Promise<void> {
     console.log(pc.cyan('\n  beech validate\n'))
     console.log(pc.dim('  Schema validation is enforced dynamically at runtime by @beechcms/core on all /api/seeds mutations.'))
     console.log(pc.green('  ✓ Runtime schema validation active.\n'))
   }
   ```
5. `bin/cli.mjs`:
   - Remove `tryLoadLocalRegistry()` helper completely.
   - Update `COMMANDS` mapping and handler wrappers (`cmdDeploy`, `cmdOnboard`, `cmdSeedLoad`, `cmdSeedCreate`, `cmdSchemaDiff`, `cmdValidate`, `cmdBuild`).
   - Update `help()` text:
     - Section 1 (Onboarding): update `onboard` description (`One-command local provisioning (init --db)`).
     - Section 3: Rename to `Database & Types Management`, list `gen types typescript` (`gen-types`).
     - Remove obsolete flags (`--skip-seed`).

### Task 5: Local Bootstrap & Localization Cleanup
1. `apps/api/scripts/bootstrap-d1.mjs`:
   - Remove `execSync('node bin/cli.mjs seed:load', ...)` execution and warnings.
   - Retain idempotent D1 migration application (`0000_v040_base.sql` etc.).
2. `apps/dashboard/src/locales/en.json`:
   - Update lines 237-238:
     ```json
     "seeds": "{{count}} active content type(s)",
     "seedsNone": "No content types configured in database",
     ```
3. `apps/dashboard/src/locales/it.json`:
   - Update lines 237-238:
     ```json
     "seeds": "{{count}} content type attivi",
     "seedsNone": "Nessun content type configurato nel database",
     ```

### Task 6: Documentation & System Maps Update
1. Update `_config/SYSTEM_MAP.md`: Replace references to `beech seed:load` or `seed.ts` with runtime D1 schema hydration.
2. Update `_config/commands.md`: Refine command descriptions and note deprecated CLI actions.
3. Update `docs/development.md`, `docs/first-project.md`, `docs/guide.md`: Formalize breaking changes and DB-first content architecture.

### Task 7: Unit & Integration Tests Updates (`packages/cli/src/test/`)
1. Update `packages/cli/src/test/seed-load.test.ts`: Verify that `seedLoad()` logs deprecation notice without errors.
2. Update `packages/cli/src/test/schema-diff.test.ts`: Verify that `schemaDiff()` logs deprecation notice without errors.
3. Update `packages/cli/src/test/validate.test.ts`: Verify updated validation command behavior.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run the following commands in sequence to validate the implementation:

1. **Monorepo Build & Typecheck:**
   ```bash
   pnpm run build
   ```

2. **Targeted CLI Unit Tests:**
   ```bash
   pnpm --filter @beechcms/cli test
   ```

3. **API & Dashboard Test Suite:**
   ```bash
   pnpm --filter @beechcms/api test
   pnpm --filter @beechcms/dashboard test
   ```

4. **Full Monorepo Verification:**
   ```bash
   pnpm test
   ```

5. **Linting Check:**
   ```bash
   pnpm lint
   ```

6. **CLI Smoke Test (dry-run/help execution):**
   ```bash
   node bin/cli.mjs --help
   node bin/cli.mjs seed:load
   node bin/cli.mjs seed:create
   node bin/cli.mjs schema:diff
   ```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `bin/create.mjs` scaffolds fresh BeechCMS projects with zero `seeds.ts` files or template selections.
- [ ] Generated `worker.ts` initializes `createBeechApp({ seeds: [] })` without filesystem imports.
- [ ] `beech deploy` performs pure Worker compilation and publishing without executing `seed:load` or any D1 DDL mutations.
- [ ] `beech init` and `beech init --db` succeed without checking for or warning about missing `seeds.ts` files.
- [ ] `beech onboard` bootstraps system tables cleanly without invoking `seed:load`.
- [ ] Invoking deprecated commands (`seed:load`, `seed:create`, `schema:diff`) outputs a clear deprecation message redirecting developers to the dashboard/API and exits cleanly.
- [ ] `apps/api/scripts/bootstrap-d1.mjs` no longer invokes `seed:load`.
- [ ] Dashboard locale files (`en.json`, `it.json`) contain no references to `seeds.ts`.
- [ ] Documentation and `_config` system maps reflect Cloudflare D1 as the single canonical schema authority.
- [ ] All package builds and test suites across the monorepo pass with 100% success rate.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

1. **Model Context Protocol (MCP) Server:** Building AI MCP tools for content type manipulation is strictly deferred to a dedicated MCP initiative.
2. **Bidirectional Schema Sync / GitOps Migrations Engine:** Automated local-to-remote reverse schema sync and generation of physical SQLite migration files from TypeScript definitions are excluded under YAGNI.
3. **Backend DDL Engine Modifications:** No changes to runtime DDL mutation routines in `packages/core/src/engine/seed-ddl.ts` or `seed-ddl-destructive.ts`.
