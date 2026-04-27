#!/usr/bin/env node
// @ts-check

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const [,, command, ...args] = process.argv

const COMMANDS = {
  build: cmdBuild,
}

function help() {
  console.log(`
  beech <command>

  Commands:
    build   Rebuild @beech/core after editing seeds.ts

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

const handler = COMMANDS[command]
if (!handler) {
  help()
  if (command) process.exit(1)
} else {
  handler(args)
}
