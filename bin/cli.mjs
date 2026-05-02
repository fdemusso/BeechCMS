#!/usr/bin/env node
// @ts-check

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'


const [,, command, ...args] = process.argv

const COMMANDS = {
  build:        cmdBuild,
  'seed:load':  cmdSeedLoad,
}

function help() {
  console.log(`
  beech <command> [options]

  Commands:
    build           Rebuild @beech/core after editing seeds.ts
    seed:load       Create/update DB tables from SEED_REGISTRY
      --dry-run       Print SQL without executing
      --diff          Show schema differences vs current DB
      --remote        Execute against remote D1 (default: local)
      --db <name>     Override D1 database name

  Run npx beech-cms to scaffold a new project.
`)
}

function cmdBuild() {
  const corePath = resolve(process.cwd(), 'packages', 'core')

  if (!existsSync(corePath)) {
    console.error(
      '\nError: packages/core not found.\n' +
      'Make sure you are running this command from the root of a BeechCMS project.\n'
    )
    process.exit(1)
  }

  console.log('\nBuilding @beech/core…\n')
  try {
    execSync('npm run build -w @beech/core', { stdio: 'inherit' })
    console.log('\n✔ @beech/core built — your seed changes are now live.\n')
  } catch {
    console.error('\nBuild failed. Check the output above for errors.\n')
    process.exit(1)
  }
}

async function cmdSeedLoad(args) {
  const dryRun = args.includes('--dry-run')
  const diff   = args.includes('--diff')
  const remote = args.includes('--remote')
  const dbIdx  = args.indexOf('--db')
  const db     = dbIdx !== -1 ? args[dbIdx + 1] : undefined

  const { seedLoad } = await import('@beech/cli')
  await seedLoad({ dryRun, diff, local: !remote, db })
}

const handler = COMMANDS[command]
if (!handler) {
  help()
  if (command) process.exit(1)
} else {
  await handler(args)
}
