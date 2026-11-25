#!/usr/bin/env node
// @ts-check

import pc from 'picocolors'

let [,, command, ...args] = process.argv

if (command && args[0] && !args[0].startsWith('-') && ['db', 'schema', 'types', 'generate', 'agent', 'keys', 'hooks'].includes(command)) {
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
  'schema:diff':    cmdSchemaDiff,
  'schema:audit':   cmdSchemaAudit,
  'schema:migrate': cmdSchemaMigrate,
  'schema:export':  cmdSchemaExport,
  'schema:plan':    cmdSchemaPlan,
  'schema:apply':   cmdSchemaApply,
  'types:generate': cmdGenerateTypes,
  'types:check':    cmdTypesCheck,
  'init':           cmdInit,
  'keys:migrate':   cmdKeysMigrate,
  'deploy':         cmdDeploy,
  'update':         cmdUpdate,
  'forms':          cmdForms,
  'form':           cmdForms,
  'forms:add':      cmdForms,
  'gen-types':       cmdGenerateTypes,
  'gen:types':       cmdGenerateTypes,
  'generate:types':  cmdGenerateTypes,
  // New unified command mappings:
  'db:migrate':     cmdDbMigrate,
  'db:reset':       cmdDbReset,
  'setup:cloudflare': cmdSetupCloudflare,
  'setup:cf':         cmdSetupCloudflare,
  'run':              cmdRun,
  'agent:setup':      cmdAgentSetup,
  'hooks:init':       cmdHooksInit,
}

function help() {
  console.log(`
  ${pc.cyan('beech')} <command> [options]

  ${pc.bold('1. Local Management & Onboarding')}
    ${pc.cyan('init')}            Check that the project has the files BeechCMS needs
      --remote        Skip local-only checks (.dev.vars)
    ${pc.cyan('keys:migrate')}    Move a 0.10.x project to publishable/secret keys (rotates committed secrets)
    ${pc.cyan('update')}          Update internals to latest, then apply system D1 migrations

  ${pc.bold('2. Database & Migrations')}
    ${pc.cyan('db:migrate')}      Apply all pending local migrations
    ${pc.cyan('db:reset')}        Remove local Wrangler state and re-bootstrap database

  ${pc.bold('3. Database & Types Management')}
    ${pc.cyan('types generate')} (aliases: ${pc.cyan('gen-types')}, ${pc.cyan('gen types typescript')})
      Generate TypeScript interfaces + schema fingerprint from live D1
      --local / --remote   Target local SQLite state (default) or remote D1
      --db <name>          Override D1 database name
      -o, --output <file>  Output path (default: beech.generated.ts; aliases print to stdout)
    ${pc.cyan('types check')}     Diff committed generated types against live D1 (writes nothing)
      --local / --remote   Target local SQLite state (default) or remote D1
      --db <name>          Override D1 database name
      -o, --output <file>  File to check (default: beech.generated.ts)
      Exits 1 when the file is missing or stale.
    ${pc.cyan('schema export')}   Write beech.schema.ts from live D1 state
      --out <file>    Destination (default: beech.schema.ts)
      --stdout        Print instead of writing
      --remote        Target remote D1
    ${pc.cyan('schema diff')}     Compare beech.schema.ts against the deployed schema
      --manifest <f>  Manifest path (default: beech.schema.ts)
      Exits 1 when drift is detected.
    ${pc.cyan('schema audit')}    Report relation storage and legacy tag definitions that need repair (read-only)
      --remote        Target remote D1 instead of local (default: local)
      --db <name>     Override D1 database name
    ${pc.cyan('schema migrate')}  Migrate pre-0.9 tag/choice seeds to the closed-vocabulary tags contract
      --apply         Write the changes (default: dry run, exits 1 while work is pending)
      --remote        Target remote D1 instead of local (default: local)
      --db <name>     Override D1 database name
    ${pc.cyan('schema plan')}     Show what applying beech.schema.ts would change (writes nothing)
      --manifest <f>  Manifest path (default: beech.schema.ts)
      --api-url <url> API origin (default: BEECH_API_URL or http://localhost:8789)
      Exits 1 when a seed cannot be applied.
    ${pc.cyan('schema apply')}    Apply beech.schema.ts through the control plane
      --manifest <f>  Manifest path (default: beech.schema.ts)
      --api-url <url> API origin
      -y, --yes       Skip the confirmation prompt
      Additive only. Authorizes in the browser on first use.

  ${pc.bold('4. Forms & Frontend Generation')}
    ${pc.cyan('forms / form')}    Interactive wizard to generate React, Vue, Svelte, or Web Component forms
      --framework <f> Framework: react, vue, svelte, vanilla
      --seed <slug>   Seed slug to bind to (e.g. clienti)
      --mode <mode>   styled (Tailwind) or headless
      --yes, -y       Skip interactive prompts

  ${pc.bold('5. Cloudflare & Deployment')}
    ${pc.cyan('setup:cloudflare')} (alias: ${pc.cyan('setup:cf')})
      Interactive 1-step Cloudflare provisioning (D1, R2, Presigned S3 secrets)
      --name <n>      Project name override
      --yes, -y       Non-interactive mode
    ${pc.cyan('deploy')}          Compile, test, deploy to Cloudflare environment
      --skip-check    Skip /admin reachability check

  ${pc.bold('6. Agent Scripts')}
    ${pc.cyan('run <name|path>')} Run a .beech/scripts/<name>.ts script through the typed SDK
      --arg <k=v>     Pass a string argument to the script (repeatable)
      --dry-run       Record writes without sending them
      --json          Print the report as one JSON document
      --out <file>    Also write the JSON report to a file
      --api-url <url> API origin
    ${pc.cyan('agent setup')}     Write .mcp.json entry, agent skill, scripts README and example script
      --force         Overwrite files that differ from the templates
      --api-url <url> API origin written to .mcp.json
    ${pc.cyan('hooks init')}      Scaffold typed hooks.ts and wire it into worker.ts
      --force         Overwrite hooks.ts if it differs from the template
`)
}

async function cmdInit(args) {
  const remote = args.includes('--remote')

  const { init } = await import('../dist/index.js')
  await init({ local: !remote })
}

async function cmdKeysMigrate() {
  const { keysMigrate } = await import('../dist/index.js')
  await keysMigrate()
}

async function cmdDeploy(args) {
  const skipSeed  = args.includes('--skip-seed')
  const skipCheck = args.includes('--skip-check')
  const { deploy } = await import('../dist/index.js')
  await deploy({ skipSeed, skipCheck })
}

async function cmdUpdate() {
  const { update } = await import('../dist/index.js')
  await update({})
}

async function cmdSchemaDiff(args) {
  const remote      = args.includes('--remote')
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const dbIdx       = args.indexOf('--db')
  const db          = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaDiff } = await import('../dist/index.js')
  await schemaDiff({ local: !remote, manifest, db })
}

async function cmdSchemaAudit(args) {
  const remote = args.includes('--remote')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaAudit } = await import('../dist/index.js')
  await schemaAudit({ local: !remote, db })
}

async function cmdSchemaMigrate(args) {
  const remote = args.includes('--remote')
  const apply  = args.includes('--apply')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaMigrate } = await import('../dist/index.js')
  await schemaMigrate({ apply, local: !remote, db })
}

async function cmdSchemaExport(args) {
  const remote  = args.includes('--remote')
  const stdout  = args.includes('--stdout')
  const outIdx  = args.indexOf('--out')
  const oIdx    = args.indexOf('-o')
  const out     = stdout ? null
    : outIdx !== -1 ? args[outIdx + 1]
    : oIdx !== -1 ? args[oIdx + 1]
    : undefined
  const dbIdx = args.indexOf('--db')
  const db    = dbIdx !== -1 ? args[dbIdx + 1] : undefined
  const { schemaExport } = await import('../dist/index.js')
  await schemaExport({ out, local: !remote, db })
}

async function cmdSchemaPlan(args) {
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const apiIdx      = args.indexOf('--api-url')
  const apiUrl      = apiIdx !== -1 ? args[apiIdx + 1] : undefined
  const { schemaPlan } = await import('../dist/index.js')
  await schemaPlan({ manifest, apiUrl })
}

async function cmdSchemaApply(args) {
  const manifestIdx = args.indexOf('--manifest')
  const manifest    = manifestIdx !== -1 ? args[manifestIdx + 1] : undefined
  const apiIdx      = args.indexOf('--api-url')
  const apiUrl      = apiIdx !== -1 ? args[apiIdx + 1] : undefined
  const yes         = args.includes('--yes') || args.includes('-y')
  const { schemaApply } = await import('../dist/index.js')
  await schemaApply({ manifest, apiUrl, yes })
}

async function cmdRun(args) {
  const { run } = await import('../dist/index.js')
  await run(args)
}

async function cmdAgentSetup(args) {
  const force  = args.includes('--force')
  const apiIdx = args.indexOf('--api-url')
  const apiUrl = apiIdx !== -1 ? args[apiIdx + 1] : undefined
  const { agentSetup } = await import('../dist/index.js')
  await agentSetup({ force, apiUrl })
}

async function cmdHooksInit(args) {
  const force = args.includes('--force')
  const { hooksInit } = await import('../dist/index.js')
  await hooksInit({ force })
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

  // `beech types generate` writes beech.generated.ts; the historical `gen-types` aliases keep
  // their stdout default, so no existing script changes behaviour.
  const isTypesGenerate = command === 'types:generate'
  const destination = out ?? (isTypesGenerate ? undefined : null)

  const { generateTypes } = await import('../dist/index.js')
  await generateTypes({ out: destination, local, db })
}

async function cmdTypesCheck(args) {
  const remote = args.includes('--remote')
  const local = !remote

  let out
  const outIdx = args.indexOf('--out')
  const outputIdx = args.indexOf('--output')
  const oIdx = args.indexOf('-o')

  if (outIdx !== -1 && args[outIdx + 1]) out = args[outIdx + 1]
  else if (outputIdx !== -1 && args[outputIdx + 1]) out = args[outputIdx + 1]
  else if (oIdx !== -1 && args[oIdx + 1]) out = args[oIdx + 1]

  const dbIdx = args.indexOf('--db')
  const db = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const { typesCheck } = await import('../dist/index.js')
  await typesCheck({ out, local, db })
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

  const { forms } = await import('../dist/index.js')
  await forms({ framework, seed, mode, out, yes, json })
}

// New unified command wrappers:
async function cmdDbMigrate() {
  const { dbMigrate } = await import('../dist/index.js')
  await dbMigrate({})
}

async function cmdDbReset() {
  const { dbReset } = await import('../dist/index.js')
  await dbReset({})
}

async function cmdSetupCloudflare(args) {
  const yes = args.includes('--yes') || args.includes('-y')
  const nameIdx = args.indexOf('--name')
  const projectName = nameIdx !== -1 ? args[nameIdx + 1] : undefined
  const { setupCloudflare } = await import('../dist/index.js')
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
