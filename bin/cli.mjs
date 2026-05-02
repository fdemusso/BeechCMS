#!/usr/bin/env node
// @ts-check

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'


const [,, command, ...args] = process.argv

const COMMANDS = {
  build:        cmdBuild,
  'seed:load':  cmdSeedLoad,
}

function help() {
  console.log(`
  beech <command> [options]

  Commands:
    build           Rebuild @beechcms/core after editing seeds.ts
    seed:load       Create/update DB tables from SEED_REGISTRY
      --dry-run       Print SQL without executing
      --diff          Show schema differences vs current DB
      --remote        Execute against remote D1 (default: local)
      --db <name>     Override D1 database name

  Run npx @beechcms/cms to scaffold a new project.
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

  // Try compiled JS first
  for (const name of ['seeds.js', 'seeds.mjs']) {
    const p = resolve(cwd, name)
    if (existsSync(p)) {
      try {
        const mod = await import(pathToFileURL(p).href)
        if (mod.SEED_REGISTRY && typeof mod.SEED_REGISTRY === 'object') {
          return mod.SEED_REGISTRY
        }
      } catch {}
    }
  }

  // Try seeds.ts via Node's experimental strip-types (Node 22.6+)
  const tsPath = resolve(cwd, 'seeds.ts')
  if (existsSync(tsPath)) {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `import { SEED_REGISTRY } from ${JSON.stringify(pathToFileURL(tsPath).href)}; process.stdout.write(JSON.stringify(SEED_REGISTRY))`,
    ], { encoding: 'utf-8' })
    if (result.status === 0 && result.stdout) {
      try { return JSON.parse(result.stdout) } catch {}
    }
  }

  return null
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

const handler = COMMANDS[command]
if (!handler) {
  help()
  if (command) process.exit(1)
} else if (args.includes('--help') || args.includes('-h')) {
  help()
} else {
  await handler(args)
}
