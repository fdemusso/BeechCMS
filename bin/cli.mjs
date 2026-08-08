#!/usr/bin/env node
// @ts-check

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import pc from 'picocolors'

let [,, command, ...args] = process.argv

if (command && args[0] && ['db', 'seed', 'schema', 'dev', 'generate', 'mailpit'].includes(command)) {
  command = `${command}:${args.shift()}`
}

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
  'db:reset':       cmdDbReset,
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

function cmdBuild() {
  console.log(
    '\nNo build step needed for BeechCMS projects.\n' +
    'Edit seeds.ts then run `npx beech seed:load` to sync schema changes to D1.\n'
  )
}

async function tryLoadLocalRegistry() {
  const cwd = process.cwd()

  // Try compiled JS first (root or apps/api)
  const searchDirs = [cwd, resolve(cwd, 'apps', 'api')]
  for (const dir of searchDirs) {
    for (const name of ['seeds.js', 'seeds.mjs', 'seed.js', 'seed.mjs']) {
      const p = resolve(dir, name)
      if (existsSync(p)) {
        try {
          const mod = await import(pathToFileURL(p).href)
          if (mod.SEED_REGISTRY && typeof mod.SEED_REGISTRY === 'object') {
            return mod.SEED_REGISTRY
          }
          if (Array.isArray(mod.seeds)) {
            return Object.fromEntries(mod.seeds.map(s => [s.slug, s]))
          }
          if (Array.isArray(mod.default)) {
            return Object.fromEntries(mod.default.map(s => [s.slug, s]))
          }
        } catch {}
      }
    }
  }

  // Try seeds.ts / seed.ts (root or apps/api)
  let tsPath = null
  for (const dir of searchDirs) {
    const p = existsSync(resolve(dir, 'seeds.ts')) 
      ? resolve(dir, 'seeds.ts') 
      : resolve(dir, 'seed.ts')
    if (existsSync(p)) {
      tsPath = p
      break
    }
  }

  if (tsPath) {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `
import * as mod from ${JSON.stringify(pathToFileURL(tsPath).href)};
let out = null;
if (mod.SEED_REGISTRY && typeof mod.SEED_REGISTRY === 'object') out = mod.SEED_REGISTRY;
else if (Array.isArray(mod.seeds)) out = Object.fromEntries(mod.seeds.map(s => [s.slug, s]));
else if (Array.isArray(mod.default)) out = Object.fromEntries(mod.default.map(s => [s.slug, s]));
if (out) process.stdout.write(JSON.stringify(out));
      `.trim(),
    ], { encoding: 'utf-8' })
    
    if (result.status === 0 && result.stdout) {
      try { return JSON.parse(result.stdout) } catch (err) {
        console.error('  Failed to parse seeds.ts output:', err)
      }
    } else if (result.status !== 0) {
      console.error('  Error loading seeds.ts:')
      console.error(result.stderr || result.stdout || 'Unknown error')
      if (process.version.slice(1).split('.')[0] < 22) {
        console.warn('  Note: Node.js 22.6+ is required to load .ts files directly. Current version:', process.version)
      }
    }
  }

  return null
}

async function cmdInit(args) {
  const initDb  = args.includes('--db')
  const remote  = args.includes('--remote')
  const dbIdx   = args.indexOf('--db-name')
  const db      = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const yes     = args.includes('--yes') || args.includes('-y')

  const { init } = await import('@beechcms/cli')
  await init({ initDb, local: !remote, db, yes })
}

async function cmdSeedLoad(args) {
  const dryRun = args.includes('--dry-run')
  const diff   = args.includes('--diff')
  const remote = args.includes('--remote')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const registry = await tryLoadLocalRegistry()

  const { seedLoad } = await import('@beechcms/cli')
  await seedLoad({ dryRun, diff, local: !remote, db, registry })
}

async function cmdValidate(args) {
  const registry = await tryLoadLocalRegistry()
  const { validate } = await import('@beechcms/cli')
  await validate({ registry })
}

async function cmdSeedCreate(_args) {
  const { seedCreate } = await import('@beechcms/cli')
  await seedCreate({})
}

async function cmdDeploy(args) {
  const skipSeed  = args.includes('--skip-seed')
  const skipCheck = args.includes('--skip-check')
  const registry  = skipSeed ? null : await tryLoadLocalRegistry()
  const { deploy } = await import('@beechcms/cli')
  await deploy({ registry, skipSeed, skipCheck })
}

async function cmdUpdate(_args) {
  const { update } = await import('@beechcms/cli')
  await update({})
}

async function cmdOnboard(args) {
  const local    = !args.includes('--remote')
  const yes      = args.includes('--yes') || args.includes('-y')
  const dbIdx    = args.indexOf('--db')
  const db       = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const registry = await tryLoadLocalRegistry()
  const { onboard } = await import('@beechcms/cli')
  await onboard({ local, yes, db, registry })
}

async function cmdReset(args) {
  const db     = args.includes('--db')
  const docker = args.includes('--docker')
  const all    = args.includes('--all')
  const yes    = args.includes('--yes') || args.includes('-y')

  const { reset } = await import('@beechcms/cli')
  await reset({ db, docker, all, yes })
}

async function cmdSchemaDiff(args) {
  const remote  = args.includes('--remote')
  const write   = args.includes('--write')
  const nameIdx = args.indexOf('--name')
  const name    = nameIdx !== -1 ? args[nameIdx + 1] : undefined
  const dbIdx   = args.indexOf('--db')
  const db      = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const registry = await tryLoadLocalRegistry()
  const { schemaDiff } = await import('@beechcms/cli')
  await schemaDiff({ local: !remote, write, name, db, registry })
}

async function cmdGenerateTypes(args) {
  const outIdx = args.indexOf('--out')
  const out    = outIdx !== -1 ? args[outIdx + 1] : 'src/types/beech.ts'
  const local  = args.includes('--local')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const registry = local ? await tryLoadLocalRegistry() : null

  const { generateTypes } = await import('@beechcms/cli')
  await generateTypes({ out, local, db, registry })
}

// New unified command wrappers:
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

const handler = COMMANDS[command]
if (!handler) {
  help()
  if (command) process.exit(1)
} else if (args.includes('--help') || args.includes('-h')) {
  help()
} else {
  await handler(args)
}
