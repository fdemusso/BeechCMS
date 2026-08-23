# Sprint Output Template: Unified Beech CLI

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The development landscape in BeechCMS currently relies on a fragmented ecosystem of custom npm scripts, Turborepo filters, and raw docker compose executions. This fragmenting increases cognitive load and introduces onboarding friction for developers and AI agents alike. By consolidating all development workflows under a unified, single entry point (`pnpm beech`), we create a cohesive developer experience (DX).

This sprint adheres to the Vertical Slice Architecture (VSA) and the Botanical Engine invariants by encapsulating the CLI orchestrations inside the `@beechcms/cli` workspace package. The CLI is pure tooling infrastructure and remains completely decoupled from feature slices (`apps/api/src/features`) and client views (`apps/dashboard`). In alignment with the Botanical Engine, any database configuration tasks triggered by the CLI (such as schema updates and initial bootstrap) are executed via wrangler D1 migrations and standard runtime loaders, ensuring the database status is strictly schema-driven.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **CLI Entry Point:** `bin/cli.mjs` (Degree: 14) registers command handlers (`cmdInit`, `cmdSeedLoad`, etc.) dynamically mapping to the `@beechcms/cli` workspace package dependencies.
- **CLI Package:** `packages/cli/src/` compiles to ESM (`dist/index.js`).
- **Interactive Framework:** Uses `@clack/prompts` and native Node readline. Prompt workflows bypass TTY checks when `!process.stdin.isTTY` or when `--yes`/`-y` flags are present.
- **Dev Stack:** Driven by `scripts/dev.mjs` which wraps `scripts/dev-cli/index.tsx` (interactive TUI powered by Ink) or fallback `scripts/dev-cli/legacy-runner.ts`.
- **Docker Stack:** Configured at `docker/docker-compose.yml` with services: `minio`, `minio-init`, `mailpit`, `sqlite-web`, `webhook-tester`, `tunnel`.
- **Database Bootstrap:** `apps/api/scripts/bootstrap-d1.mjs` runs D1 SQLite migrations locally against the `beech-db` target.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
The following files will be produced or modified during this sprint:

### New Files (Implementations & Tests)
- `packages/cli/src/commands/db-migrate.ts`
- `packages/cli/src/commands/db-reset.ts`
- `packages/cli/src/commands/dev.ts`
- `packages/cli/src/commands/dev-stop.ts`
- `packages/cli/src/commands/dev-reset.ts`
- `packages/cli/src/commands/dev-tunnel.ts`
- `packages/cli/src/commands/mailpit-clear.ts`
- `packages/cli/src/commands/logs.ts`
- `packages/cli/src/commands/test.ts`
- `packages/cli/src/commands/lint.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/src/test/db-migrate.test.ts`
- `packages/cli/src/test/db-reset.test.ts`
- `packages/cli/src/test/dev.test.ts`
- `packages/cli/src/test/logs.test.ts`

### Modified Files
- `bin/cli.mjs` (Updated router, colorized categorized help, argument parsing)
- `packages/cli/src/index.ts` (Barrel export additions)
- `packages/cli/src/commands/reset.ts` (Refactored to orchestrate `dbReset` and `devReset`)
- `CLAUDE.md` (Update CLI workflow documentation)
- `_config/commands.md` (Update commands reference)
- `docs/SYSTEM_MAP.md` (Integrate the unified CLI model in System Map)

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

> [!NOTE]
> **D1 Migrations:** Not applicable. This feature does not modify D1 database tables or require schema updates.

### 4.1 TypeScript CLI Interfaces & Barrel Updates

Additions to `packages/cli/src/index.ts`:
```typescript
export { dbMigrate } from './commands/db-migrate.js'
export type { DbMigrateOptions } from './commands/db-migrate.js'
export { dbReset } from './commands/db-reset.js'
export type { DbResetOptions } from './commands/db-reset.js'
export { dev } from './commands/dev.js'
export type { DevOptions } from './commands/dev.js'
export { devStop } from './commands/dev-stop.js'
export { devReset } from './commands/dev-reset.js'
export { devTunnel } from './commands/dev-tunnel.js'
export { mailpitClear } from './commands/mailpit-clear.js'
export { logs } from './commands/logs.js'
export type { LogsOptions } from './commands/logs.js'
export { test } from './commands/test.js'
export type { TestOptions } from './commands/test.js'
export { lint } from './commands/lint.js'
export { doctor } from './commands/doctor.js'
```

### 4.2 Command Implementations

#### `packages/cli/src/commands/db-migrate.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DbMigrateOptions {
  local?: boolean
}

export async function dbMigrate(_args: DbMigrateOptions): Promise<void> {
  console.log(pc.cyan('\n  beech db:migrate — apply migrations\n'))

  const cwd = process.cwd()
  const apiDir = resolve(cwd, 'apps', 'api')

  if (existsSync(resolve(apiDir, 'package.json'))) {
    const result = spawnSync('npm', ['run', 'db:migrate:local'], {
      stdio: 'inherit',
      cwd: apiDir,
      shell: true,
    })
    if (result.status !== 0) {
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
      process.exit(1)
    }
  } else if (existsSync(resolve(cwd, 'scripts', 'bootstrap-d1.mjs'))) {
    const result = spawnSync('node', ['scripts/bootstrap-d1.mjs'], {
      stdio: 'inherit',
      cwd,
      shell: true,
    })
    if (result.status !== 0) {
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
      process.exit(1)
    }
  } else {
    console.log(pc.yellow('  ⚠ Could not find database migration script.'))
    process.exit(1)
  }
  console.log(pc.green('\n  ✓ Migrations applied successfully.'))
}
```

#### `packages/cli/src/commands/db-reset.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DbResetOptions {
  local?: boolean
}

export async function dbReset(_args: DbResetOptions): Promise<void> {
  console.log(pc.cyan('\n  beech db:reset — reset local database\n'))

  const cwd = process.cwd()
  const apiDir = resolve(cwd, 'apps', 'api')
  let dbResetSuccess = false

  if (existsSync(resolve(apiDir, 'package.json'))) {
    const result = spawnSync('npm', ['run', 'db:reset:local'], {
      stdio: 'inherit',
      cwd: apiDir,
      shell: true,
    })
    dbResetSuccess = result.status === 0
  } else if (existsSync(resolve(cwd, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf-8'))
    if (pkg.scripts?.['db:reset:local']) {
      const result = spawnSync('npm', ['run', 'db:reset:local'], {
        stdio: 'inherit',
        cwd,
        shell: true,
      })
      dbResetSuccess = result.status === 0
    } else {
      const wranglerStateDir = resolve(cwd, '.wrangler/state')
      if (existsSync(wranglerStateDir)) {
        console.log(pc.dim('  Removing .wrangler/state…'))
        rmSync(wranglerStateDir, { recursive: true, force: true })
      }
      if (existsSync(resolve(cwd, 'scripts', 'bootstrap-d1.mjs'))) {
        const result = spawnSync('node', ['scripts/bootstrap-d1.mjs'], {
          stdio: 'inherit',
          cwd,
          shell: true,
        })
        dbResetSuccess = result.status === 0
      } else {
        console.log(pc.yellow('  ⚠ Could not find database reset script.'))
        const { init } = await import('./init.js')
        try {
          await init({ initDb: true, local: true })
          dbResetSuccess = true
        } catch {
          dbResetSuccess = false
        }
      }
    }
  } else {
    const wranglerStateDir = resolve(cwd, '.wrangler/state')
    if (existsSync(wranglerStateDir)) {
      console.log(pc.dim('  Removing .wrangler/state…'))
      rmSync(wranglerStateDir, { recursive: true, force: true })
    }
    dbResetSuccess = true
  }

  if (dbResetSuccess) {
    console.log(pc.green('\n  ✓ Local database reset completed.'))
  } else {
    console.log(pc.red('\n  ✗ Database reset failed.'))
    process.exit(1)
  }
}
```

#### `packages/cli/src/commands/dev.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DevOptions {
  plain?: boolean
}

export async function dev(args: DevOptions): Promise<void> {
  console.log(pc.cyan('\n  beech dev — start development environment\n'))

  const cwd = process.cwd()
  const devScript = resolve(cwd, 'scripts', 'dev.mjs')

  if (!existsSync(devScript)) {
    console.log(pc.red('  ✗ Could not find development script (scripts/dev.mjs).'))
    process.exit(1)
  }

  const env = { ...process.env }
  if (args.plain) {
    env.BEECH_DEV_PLAIN = '1'
  }

  const result = spawnSync('node', ['scripts/dev.mjs'], {
    stdio: 'inherit',
    cwd,
    env,
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

#### `packages/cli/src/commands/dev-stop.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

function isDockerInstalled(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

function isDockerRunning(): boolean {
  try {
    const result = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

export async function devStop(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:stop — stop Docker environment\n'))

  if (!isDockerInstalled()) {
    console.log(pc.red('  ✗ Docker is not installed or not found in your PATH.'))
    process.exit(1)
  }

  if (!isDockerRunning()) {
    console.log(pc.yellow('  ⚠ Docker is installed, but the Docker daemon is NOT running.'))
    process.exit(1)
  }

  console.log(pc.dim('  Stopping Docker containers…\n'))
  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'stop'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status === 0) {
    console.log(pc.green('\n  ✓ Docker containers stopped.'))
  } else {
    console.log(pc.red('\n  ✗ Failed to stop Docker containers.'))
    process.exit(1)
  }
}
```

#### `packages/cli/src/commands/dev-reset.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

function isDockerInstalled(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

function isDockerRunning(): boolean {
  try {
    const result = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

export async function devReset(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:reset — reset Docker environment\n'))

  if (!isDockerInstalled()) {
    console.log(pc.red('  ✗ Docker is not installed or not found in your PATH.'))
    process.exit(1)
  }

  if (!isDockerRunning()) {
    console.log(pc.yellow('  ⚠ Docker is installed, but the Docker daemon is NOT running.'))
    process.exit(1)
  }

  console.log(pc.dim('  Resetting Docker containers and volumes…\n'))
  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status === 0) {
    console.log(pc.green('\n  ✓ Docker containers stopped and volumes removed.'))
  } else {
    console.log(pc.red('\n  ✗ Docker reset failed.'))
    process.exit(1)
  }
}
```

#### `packages/cli/src/commands/dev-tunnel.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function devTunnel(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:tunnel — get Cloudflare Tunnel URL\n'))

  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'logs', 'tunnel'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    console.log(pc.red('  ✗ Failed to retrieve tunnel logs.'))
    process.exit(1)
  }

  const logs = result.stdout + (result.stderr || '')
  const match = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)

  if (match && match.length > 0) {
    const url = match[match.length - 1]
    console.log(pc.green(`  ✓ Active Cloudflare Tunnel URL: ${pc.bold(url)}`))
  } else {
    console.log(pc.yellow('  ⚠ No active Cloudflare Tunnel URL found in logs.'))
    console.log(pc.dim('    Make sure the dev server is running with Docker (`pnpm beech dev`).'))
  }
}
```

#### `packages/cli/src/commands/mailpit-clear.ts`
```typescript
import pc from 'picocolors'

export async function mailpitClear(): Promise<void> {
  console.log(pc.cyan('\n  beech mailpit:clear — clear test emails\n'))

  try {
    const res = await fetch('http://localhost:8025/api/v1/messages', {
      method: 'DELETE',
    })

    if (res.ok) {
      console.log(pc.green('  ✓ Mailpit inbox cleared successfully.'))
    } else {
      console.log(pc.red(`  ✗ Failed to clear Mailpit inbox: ${res.statusText}`))
      process.exit(1)
    }
  } catch (err: any) {
    console.log(pc.red(`  ✗ Error connecting to Mailpit: ${err.message}`))
    console.log(pc.dim('    Make sure Mailpit is running (default port 8025).'))
    process.exit(1)
  }
}
```

#### `packages/cli/src/commands/logs.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export interface LogsOptions {
  service?: string
}

const SERVICE_MAP: Record<string, string> = {
  mailpit: 'mailpit',
  db: 'sqlite-web',
  sqlite: 'sqlite-web',
  tunnel: 'tunnel',
  storage: 'minio',
  minio: 'minio',
}

export async function logs(args: LogsOptions): Promise<void> {
  const inputService = args.service?.toLowerCase()

  if (!inputService || !SERVICE_MAP[inputService]) {
    console.log(pc.red('\n  ✗ Error: Please specify a valid service name.'))
    console.log(pc.dim('\n  Accepted services:'))
    console.log(`    - ${pc.cyan('mailpit')}`)
    console.log(`    - ${pc.cyan('db')} / ${pc.cyan('sqlite')}`)
    console.log(`    - ${pc.cyan('tunnel')}`)
    console.log(`    - ${pc.cyan('storage')} / ${pc.cyan('minio')}\n`)
    process.exit(1)
  }

  const service = SERVICE_MAP[inputService]
  console.log(pc.cyan(`\n  beech logs ${inputService} — streaming logs for ${service}…\n`))

  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'logs', '-f', service], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

#### `packages/cli/src/commands/test.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface TestOptions {
  coverage?: boolean
  diff?: boolean
}

export async function test(args: TestOptions): Promise<void> {
  console.log(pc.cyan('\n  beech test — run test suite\n'))

  const cwd = process.cwd()
  let command = 'turbo'
  let commandArgs = ['run', 'test']

  if (args.diff) {
    const diffScript = resolve(cwd, 'scripts', 'test-coverage-diff.mjs')
    if (existsSync(diffScript)) {
      command = 'node'
      commandArgs = ['scripts/test-coverage-diff.mjs']
    } else {
      console.log(pc.red('  ✗ Coverage diff script not found (scripts/test-coverage-diff.mjs).'))
      process.exit(1)
    }
  } else if (args.coverage) {
    commandArgs = ['run', 'test:coverage']
  }

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd,
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

#### `packages/cli/src/commands/lint.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function lint(): Promise<void> {
  console.log(pc.cyan('\n  beech lint — check code style\n'))

  const result = spawnSync('turbo', ['run', 'lint'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

#### `packages/cli/src/commands/doctor.ts`
```typescript
import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function doctor(): Promise<void> {
  console.log(pc.cyan('\n  beech doctor — React diagnostics\n'))

  const result = spawnSync('pnpm', ['dlx', 'react-doctor@latest'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
```

#### `packages/cli/src/commands/reset.ts`
```typescript
// Refactored packages/cli/src/commands/reset.ts to act as composite orchestrator
import pc from 'picocolors'
import { createInterface } from 'node:readline/promises'
import { dbReset } from './db-reset.js'
import { devReset } from './dev-reset.js'

export interface ResetOptions {
  db?: boolean
  docker?: boolean
  all?: boolean
  yes?: boolean
}

export async function reset(args: ResetOptions): Promise<void> {
  console.log(pc.cyan('\n  beech reset — cleanup environments\n'))

  let resetDb = args.db || args.all
  let resetDocker = args.docker || args.all

  if (!args.db && !args.docker && !args.all) {
    if (args.yes) {
      resetDb = true
      resetDocker = true
    } else if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const answer = (await rl.question(
          pc.cyan('  → No options provided. Would you like to reset everything (DB & Docker)? (y/N): ')
        )).trim().toLowerCase()
        if (answer === 'y' || answer === 'yes') {
          resetDb = true
          resetDocker = true
        } else {
          console.log(pc.dim('\n  Reset cancelled. Use --db, --docker, or --all.\n'))
          return
        }
      } finally {
        rl.close()
      }
    } else {
      console.log(pc.red('\n  ✗ Error: Please specify what to reset using --db, --docker, or --all.\n'))
      process.exit(1)
    }
  }

  if (resetDocker) {
    await devReset()
  }

  if (resetDb) {
    await dbReset()
  }
}
```

### 4.3 CLI Wrapper updates (`bin/cli.mjs`)

Update the commands list, color-category instructions, and support non-TTY triggers:
```javascript
// ... existing imports ...

const COMMANDS = {
  build:            cmdBuild,
  'seed:load':      cmdSeedLoad,
  'seed:create':    cmdSeedCreate,
  'schema:diff':    cmdSchemaDiff,
  'init':           cmdInit,
  'validate':       cmdValidate,
  'deploy':         cmdDeploy,
  'update':         cmdUpdate,
  'onboard':        cmdOnboard,
  'reset':          cmdReset,
  'generate:types': cmdGenerateTypes,
  // New unified command mappings:
  'db:migrate':     cmdDbMigrate,
  'db:reset':      cmdDbReset,
  'dev':            cmdDev,
  'start':          cmdDev,
  'dev:stop':       cmdDevStop,
  'dev:reset':      cmdDevReset,
  'dev:tunnel':     cmdDevTunnel,
  'mailpit:clear':  cmdMailpitClear,
  'logs':           cmdLogs,
  'test':           cmdTest,
  'lint':           cmdLint,
  'doctor':         cmdDoctor,
}

function help() {
  console.log(`
  ${pc.cyan('beech')} <command> [options]

  ${pc.bold('1. Local Management & Onboarding')}
    ${pc.cyan('init')}            Check project files and optionally initialise the database
      --db            Also initialise the D1 database (system tables)
      --remote        Target remote D1 instead of local (default: local)
      --db-name <n>   Override D1 database name
      --yes, -y       Run in non-interactive mode
    ${pc.cyan('onboard')}         One-command local provisioning (init --db + seed:load)
      --remote        Target remote D1 instead of local (default: local)
      --yes, -y       Skip all interactive prompts (non-interactive mode)
      --db <name>     Override D1 database name
    ${pc.cyan('update')}          Update internals to latest, then apply system D1 migrations

  ${pc.bold('2. Database & Migrations')}
    ${pc.cyan('db:migrate')}      Apply all pending local migrations
    ${pc.cyan('db:reset')}        Remove local Wrangler state and re-bootstrap database

  ${pc.bold('3. Seed & Schema Management')}
    ${pc.cyan('seed:create')}     Interactive wizard — generate a new Seed schema in seeds.ts
    ${pc.cyan('seed:load')}       Create/update content tables from SEED_REGISTRY
      --dry-run       Print SQL without executing
      --diff          Show schema differences vs current DB
      --remote        Execute against remote D1 (default: local)
      --db <name>     Override D1 database name
    ${pc.cyan('schema:diff')}     Diff SEED_REGISTRY vs D1 and generate additive SQL migration
      --write         Write the migration file (default: preview only)
      --name <name>   Migration name used in the filename
      --remote        Diff against remote D1 (default: local)
      --db <name>     Override D1 database name
    ${pc.cyan('validate')}        Validate seeds registry for errors
    ${pc.cyan('generate:types')}  Generate TypeScript interfaces from seed definitions
      --out <path>    Output file (default: src/types/beech.ts)
      --local         Read from seeds.ts instead of querying live D1

  ${pc.bold('4. Local Stack & Docker')}
    ${pc.cyan('dev / start')}     Start the local dev environment (Docker + API + Dashboard)
      --plain         Avoid Ink visual TUI and run clean log streaming
    ${pc.cyan('dev:stop')}        Stop Docker containers without wiping data
    ${pc.cyan('dev:reset')}       Stop Docker containers and remove all persistent volumes
    ${pc.cyan('dev:tunnel')}      Display Cloudflare tunnel public testing URL
    ${pc.cyan('mailpit:clear')}   Clear local test inbox in Mailpit

  ${pc.bold('5. Logs Streaming')}
    ${pc.cyan('logs <service>')}   Show streaming logs for docker service: mailpit, db, tunnel, storage

  ${pc.bold('6. Quality & Deployment')}
    ${pc.cyan('test')}            Run the test suite via Turborepo / Vitest
      --coverage      Generate coverage reports
      --diff          Run test coverage only for files modified on the branch
    ${pc.cyan('lint')}            Run ESLint quality checks
    ${pc.cyan('deploy')}          Compile, test, deploy to Cloudflare environment
      --skip-seed     Skip remote seed:load step
      --skip-check    Skip /admin reachability check
    ${pc.cyan('doctor')}          Execute React diagnostics check on Dashboard
`)
}

// Handler wrappers:
async function cmdDbMigrate(args) {
  const { dbMigrate } = await import('@beechcms/cli')
  await dbMigrate({})
}

async function cmdDbReset(args) {
  const { dbReset } = await import('@beechcms/cli')
  await dbReset({})
}

async function cmdDev(args) {
  const plain = args.includes('--plain')
  const { dev } = await import('@beechcms/cli')
  await dev({ plain })
}

async function cmdDevStop(args) {
  const { devStop } = await import('@beechcms/cli')
  await devStop()
}

async function cmdDevReset(args) {
  const { devReset } = await import('@beechcms/cli')
  await devReset()
}

async function cmdDevTunnel(args) {
  const { devTunnel } = await import('@beechcms/cli')
  await devTunnel()
}

async function cmdMailpitClear(args) {
  const { mailpitClear } = await import('@beechcms/cli')
  await mailpitClear()
}

async function cmdLogs(args) {
  const service = args[0]
  const { logs } = await import('@beechcms/cli')
  await logs({ service })
}

async function cmdTest(args) {
  const coverage = args.includes('--coverage')
  const diff     = args.includes('--diff')
  const { test } = await import('@beechcms/cli')
  await test({ coverage, diff })
}

async function cmdLint(args) {
  const { lint } = await import('@beechcms/cli')
  await lint()
}

async function cmdDoctor(args) {
  const { doctor } = await import('@beechcms/cli')
  await doctor()
}
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Validation must be executed via the following shell commands in the monorepo root:

1. **Build CLI:**
   ```bash
   pnpm --filter @beechcms/cli run build
   ```
2. **Type Check:**
   ```bash
   pnpm --filter @beechcms/cli exec tsc --noEmit
   ```
3. **Run Unit Tests:**
   ```bash
   pnpm --filter @beechcms/cli run test
   ```
4. **All Monorepo Tests Validation:**
   ```bash
   pnpm run test
   ```

### Manual Validation Checkcases:
- **Help Output Verification:** Check that executing `pnpm beech --help` lists all command blocks correctly with color coding.
- **Wrangler Reset Automation:** Verify `pnpm beech db:reset` correctly removes the `.wrangler` state directory and performs a local bootstrap sequence.
- **Docker Services Logs:** Run `pnpm beech logs mailpit` to check stream connection logs output.
- **Non-TTY Onboarding Check:** Execute `pnpm beech onboard --yes` inside a clean environment to ensure zero blocks or prompt interruptions.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] No compilation errors across the workspace after running `pnpm run build`.
- [ ] All package relative imports strictly end in `.js` or `.mjs` as required by ESM constraints.
- [ ] All new CLI commands bypass interactive prompts when `--yes`, `-y`, or `!process.stdin.isTTY` is true.
- [ ] The `reset` command maintains full backwards compatibility with options `--db`, `--docker`, and `--all`.
- [ ] Visual styling uses picocolors and formatted lists matching the layout templates.
- [ ] Documentation logs (`CLAUDE.md`, `_config/commands.md`, `docs/SYSTEM_MAP.md`) are updated to reflect the new commands syntax.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Overhauling `scripts/dev.mjs` orchestrator logic or updating the Ink-based terminal user interface components.
- Rewriting Cloudflare authentication, Wrangler configuration bindings, or deployment parameters.
- Inserting or updating D1 SQL tables schema definitions inside database migrations.
- Adding REST API route endpoints or editing front-end dashboards features.

HANDOFF -> caveman_coder
