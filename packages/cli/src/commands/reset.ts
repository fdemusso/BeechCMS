// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'

export interface ResetOptions {
  db?: boolean
  docker?: boolean
  all?: boolean
}

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

export async function reset(args: ResetOptions): Promise<void> {
  console.log(pc.cyan('\n  beech reset — cleanup environments\n'))

  let resetDb = args.db || args.all
  let resetDocker = args.docker || args.all

  if (!args.db && !args.docker && !args.all) {
    if (process.stdin.isTTY) {
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

  const cwd = process.cwd()

  // Reset Docker
  if (resetDocker) {
    if (!isDockerInstalled()) {
      console.log(pc.red('  ✗ Docker is not installed or not found in your PATH.'))
      console.log(pc.dim('    Please install Docker to reset Docker containers and volumes.\n'))
      if (!args.all) {
        process.exit(1)
      }
    } else if (!isDockerRunning()) {
      console.log(pc.yellow('  ⚠ Docker is installed, but the Docker daemon is NOT running.'))
      console.log(pc.dim('    Please start Docker Desktop or your Docker daemon to reset containers.\n'))
      if (!args.all) {
        process.exit(1)
      }
    } else {
      console.log(pc.dim('  Resetting Docker containers and volumes…\n'))
      const result = spawnSync('docker', ['compose', 'down', '-v'], {
        stdio: 'inherit',
        cwd,
        shell: true,
      })

      if (result.status === 0) {
        console.log(pc.green('\n  ✓ Docker containers stopped and volumes removed.'))
      } else {
        console.log(pc.red('\n  ✗ Docker reset failed.'))
      }
    }
  }

  // Reset DB
  if (resetDb) {
    console.log(pc.dim('\n  Resetting local database…\n'))
    let dbResetSuccess = false
    const apiDir = resolve(cwd, 'apps', 'api')

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
          const initResult = spawnSync('npx', ['beech', 'init', '--db', '--local'], {
            stdio: 'inherit',
            cwd,
            shell: true,
          })
          dbResetSuccess = initResult.status === 0
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
    }
  }

  console.log(pc.dim('\n  Reset process finished.\n'))
}
