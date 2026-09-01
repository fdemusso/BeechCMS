#!/usr/bin/env node
// @ts-check

import pc from 'picocolors'

let [,, command, ...args] = process.argv

if (command && args[0] && ['db', 'seed', 'schema', 'dev', 'generate', 'mailpit'].includes(command)) {
  command = `${command}:${args.shift()}`
}

if (command === 'gen' && args[0] === 'types') {
  command = 'gen-types'
  args.shift()
  if (args[0] === 'typescript') {
    args.shift()
  }
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
  'forms':          cmdForms,
  'form':           cmdForms,
  'forms:add':      cmdForms,
  'gen-types':       cmdGenerateTypes,
  'gen:types':       cmdGenerateTypes,
  'generate:types':  cmdGenerateTypes,
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
  'setup:cloudflare': cmdSetupCloudflare,
  'setup:cf':         cmdSetupCloudflare,
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
    ${pc.cyan('onboard')}         One-command local provisioning (init --db)
      --remote        Target remote D1 instead of local (default: local)
      --yes, -y       Skip all interactive prompts (non-interactive mode)
      --db <name>     Override D1 database name
    ${pc.cyan('update')}          Update internals to latest, then apply system D1 migrations

  ${pc.bold('2. Database & Migrations')}
    ${pc.cyan('db:migrate')}      Apply all pending local migrations
    ${pc.cyan('db:reset')}        Remove local Wrangler state and re-bootstrap database

  ${pc.bold('3. Database & Types Management')}
    ${pc.cyan('gen types typescript')} (alias: ${pc.cyan('gen-types')})
      Generate TypeScript interfaces from active D1 database
      --local         Target local D1 SQLite state (default)
      --remote        Target remote Cloudflare D1
      --db <name>     Override D1 database name
      -o, --output    Output file path (default: standard output)
    ${pc.cyan('validate')}        Validate runtime schema status

  ${pc.bold('4. Forms & Frontend Generation')}
    ${pc.cyan('forms / form')}    Interactive wizard to generate React, Vue, Svelte, or Web Component forms
      --framework <f> Framework: react, vue, svelte, vanilla
      --seed <slug>   Seed slug to bind to (e.g. clienti)
      --mode <mode>   styled (Tailwind) or headless
      --yes, -y       Skip interactive prompts

  ${pc.bold('5. Local Stack & Docker')}
    ${pc.cyan('dev / start')}     Start the local dev environment (Docker + API + Dashboard)
      --plain         Avoid Ink visual TUI and run clean log streaming
    ${pc.cyan('dev:stop')}        Stop Docker containers without wiping data
    ${pc.cyan('dev:reset')}       Stop Docker containers and remove all persistent volumes
    ${pc.cyan('dev:tunnel')}      Display Cloudflare tunnel public testing URL
    ${pc.cyan('mailpit:clear')}   Clear local test inbox in Mailpit

  ${pc.bold('6. Logs Streaming')}
    ${pc.cyan('logs <service>')}   Show streaming logs for docker service: mailpit, db, tunnel, storage

  ${pc.bold('7. Quality & Deployment')}
    ${pc.cyan('test')}            Run the test suite via Turborepo / Vitest
      --coverage      Generate coverage reports
      --diff          Run test coverage only for files modified on the branch
    ${pc.cyan('lint')}            Run ESLint quality checks
    ${pc.cyan('setup:cloudflare')} (alias: ${pc.cyan('setup:cf')})
      Interactive 1-step Cloudflare provisioning (D1, R2, Presigned S3 secrets)
      --name <n>      Project name override
      --yes, -y       Non-interactive mode
    ${pc.cyan('deploy')}          Compile, test, deploy to Cloudflare environment
      --skip-check    Skip /admin reachability check
    ${pc.cyan('doctor')}          Execute React diagnostics check on Dashboard
`)
}

function cmdBuild() {
  console.log(
    '\nNo build step needed for BeechCMS projects.\n' +
    'Manage content types dynamically in the BeechCMS Dashboard at /admin.\n'
  )
}

async function cmdInit(args) {
  const initDb  = args.includes('--db')
  const remote  = args.includes('--remote')
  const dbIdx   = args.indexOf('--db-name')
  const db      = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const yes     = args.includes('--yes') || args.includes('-y')

  const { init } = await import('@beechcms/cli')
  await init({ initDb, local: !remote, db, nonInteractive: yes })
}

async function cmdSeedLoad(_args) {
  const { seedLoad } = await import('@beechcms/cli')
  await seedLoad({})
}

async function cmdValidate(_args) {
  const { validate } = await import('@beechcms/cli')
  await validate({})
}

async function cmdSeedCreate(_args) {
  const { seedCreate } = await import('@beechcms/cli')
  await seedCreate({})
}

async function cmdDeploy(args) {
  const skipSeed  = args.includes('--skip-seed')
  const skipCheck = args.includes('--skip-check')
  const { deploy } = await import('@beechcms/cli')
  await deploy({ skipSeed, skipCheck })
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
  const { onboard } = await import('@beechcms/cli')
  await onboard({ local, yes, db })
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
  const { schemaDiff } = await import('@beechcms/cli')
  await schemaDiff({ local: !remote, write, name, db })
}

async function cmdGenerateTypes(args) {
  const remote = args.includes('--remote')
  const local = !remote

  let out = null
  const outIdx = args.indexOf('--out')
  const outputIdx = args.indexOf('--output')
  const oIdx = args.indexOf('-o')
  
  if (outIdx !== -1 && args[outIdx + 1]) out = args[outIdx + 1]
  else if (outputIdx !== -1 && args[outputIdx + 1]) out = args[outputIdx + 1]
  else if (oIdx !== -1 && args[oIdx + 1]) out = args[oIdx + 1]

  const dbIdx = args.indexOf('--db')
  const db = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const { generateTypes } = await import('@beechcms/cli')
  await generateTypes({ out, local, db })
}

async function cmdForms(args) {
  const yes = args.includes('--yes') || args.includes('-y')
  const json = args.includes('--json')
  const frameworkIdx = args.indexOf('--framework')
  const framework = frameworkIdx !== -1 ? args[frameworkIdx + 1] : undefined
  const seedIdx = args.indexOf('--seed')
  const seed = seedIdx !== -1 ? args[seedIdx + 1] : undefined
  const modeIdx = args.indexOf('--mode')
  const mode = modeIdx !== -1 ? args[modeIdx + 1] : undefined
  const outIdx = args.indexOf('--out')
  const out = outIdx !== -1 ? args[outIdx + 1] : undefined

  const { forms } = await import('@beechcms/cli')
  await forms({ framework, seed, mode, out, yes, json })
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

async function cmdSetupCloudflare(args) {
  const yes = args.includes('--yes') || args.includes('-y')
  const nameIdx = args.indexOf('--name')
  const projectName = nameIdx !== -1 ? args[nameIdx + 1] : undefined
  const { setupCloudflare } = await import('@beechcms/cli')
  await setupCloudflare({ projectName, nonInteractive: yes })
}

const handler = COMMANDS[command]
if (!handler) {
  help()
  if (command && command !== '--help' && command !== '-h' && command !== 'help') process.exit(1)
} else if (args.includes('--help') || args.includes('-h')) {
  help()
} else {
  await handler(args)
}
