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
        if (Array.isArray(mod.seeds)) {
          return Object.fromEntries(mod.seeds.map(s => [s.slug, s]))
        }
        if (Array.isArray(mod.default)) {
          return Object.fromEntries(mod.default.map(s => [s.slug, s]))
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
