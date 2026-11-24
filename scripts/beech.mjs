#!/usr/bin/env node
/**
 * `pnpm beech` inside the monorepo.
 *
 * The commands that drive this repository's own tooling (Docker stack, Turborepo, test tiers,
 * lint, react-doctor) live in scripts/dev-cli/commands and are not part of the published
 * @beechcms/cli. Every other command is forwarded untouched to the published `beech` bin
 * (packages/cli/bin/beech.mjs), so `pnpm beech <command>` behaves like `npx beech <command>`.
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pc from 'picocolors'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLISHED_BIN = resolve(ROOT, 'packages/cli/bin/beech.mjs')

const argv = process.argv.slice(2)
let [command, ...args] = argv

if (command && args[0] && !args[0].startsWith('-') && ['dev', 'mailpit'].includes(command)) {
  command = `${command}:${args.shift()}`
}

/** @type {Record<string, (args: string[]) => Promise<void>>} */
const COMMANDS = {
  dev: runDev,
  start: runDev,
  'dev:stop': async () => (await load('dev-stop')).devStop(),
  'dev:reset': async () => (await load('dev-reset')).devReset(),
  'dev:tunnel': async () => (await load('dev-tunnel')).devTunnel(),
  'mailpit:clear': async () => (await load('mailpit-clear')).mailpitClear(),
  logs: async (rest) => (await load('logs')).logs({ service: rest[0] }),
  test: runTest,
  lint: async () => (await load('lint')).lint(),
  doctor: async () => (await load('doctor')).doctor(),
  reset: runReset,
}

let tsxRegistered = false

/** The commands are TypeScript: load them through tsx, as scripts/dev.mjs does for the dev TUI. */
async function load(name) {
  if (!tsxRegistered) {
    const { register } = await import('tsx/esm/api')
    register()
    tsxRegistered = true
  }
  return import(pathToFileURL(resolve(ROOT, 'scripts/dev-cli/commands', `${name}.ts`)).href)
}

async function runDev(rest) {
  await (await load('dev')).dev({ plain: rest.includes('--plain') })
}

async function runTest(rest) {
  const tierIdx = rest.indexOf('--tier')
  const tier = tierIdx !== -1 && rest[tierIdx + 1] && !rest[tierIdx + 1].startsWith('--') ? rest[tierIdx + 1] : undefined
  await (await load('test')).test({ coverage: rest.includes('--coverage'), diff: rest.includes('--diff'), tier })
}

async function runReset(rest) {
  await (await load('reset')).reset({
    db: rest.includes('--db'),
    docker: rest.includes('--docker'),
    all: rest.includes('--all'),
    yes: rest.includes('--yes') || rest.includes('-y'),
  })
}

function contributorHelp() {
  console.log(`
  ${pc.bold('Monorepo only (pnpm beech)')}
    ${pc.cyan('dev / start')}     Start the local dev environment (Docker + API + Dashboard)
      --plain         Avoid Ink visual TUI and run clean log streaming
    ${pc.cyan('dev:stop')}        Stop Docker containers without wiping data
    ${pc.cyan('dev:reset')}       Stop Docker containers and remove all persistent volumes
    ${pc.cyan('dev:tunnel')}      Display Cloudflare tunnel public testing URL
    ${pc.cyan('mailpit:clear')}   Clear local test inbox in Mailpit
    ${pc.cyan('logs <service>')}  Stream logs of a docker service: mailpit, db, tunnel, storage
    ${pc.cyan('reset')}           Reset the local database and/or the Docker stack
      --db, --docker, --all, --yes
    ${pc.cyan('test')}            Run the test suite via Turborepo / Vitest
      --coverage      Generate coverage reports
      --diff          Run test coverage only for files modified on the branch
      --tier <list>   Run one or more tiers: unit, flow, integration, e2e, scale (comma-separated)
                      e2e is Playwright-driven and is never selected by --diff
    ${pc.cyan('lint')}            Run ESLint quality checks
    ${pc.cyan('doctor')}          Execute React diagnostics check on Dashboard
`)
}

const handler = command ? COMMANDS[command] : undefined
const wantsHelp = !command || command === 'help' || command === '--help' || command === '-h'

if (handler && args.includes('--help')) {
  contributorHelp()
} else if (handler && args.includes('-h')) {
  contributorHelp()
} else if (handler) {
  await handler(args)
} else {
  const forwarded = spawnSync(process.execPath, [PUBLISHED_BIN, ...argv], { stdio: 'inherit' })
  if (wantsHelp) {
    contributorHelp()
    process.exit(0)
  }
  process.exit(forwarded.status ?? 1)
}
