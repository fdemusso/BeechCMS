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
    return
  }
}
