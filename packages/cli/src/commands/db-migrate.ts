import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DbMigrateOptions {
  local?: boolean
}

export async function dbMigrate(_args: DbMigrateOptions): Promise<void> {
  console.log(pc.cyan('\n  beech db:migrate — apply migrations\n'))

  const cwd = process.cwd()
  const apiDir = resolve(cwd, 'apps', 'api')

  if (existsSync(resolve(apiDir, 'package.json'))) {
    const result = spawnSync('npm', ['run', 'db:migrate:local'], {
      stdio: 'inherit',
      cwd: apiDir,
      shell: true,
    })
    if (result.status !== 0) {
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
      process.exit(1)
      return
    }
  } else if (existsSync(resolve(cwd, 'scripts', 'bootstrap-d1.mjs'))) {
    const result = spawnSync('node', ['scripts/bootstrap-d1.mjs'], {
      stdio: 'inherit',
      cwd,
      shell: true,
    })
    if (result.status !== 0) {
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
      process.exit(1)
      return
    }
  } else {
    console.log(pc.yellow('  ⚠ Could not find database migration script.'))
    process.exit(1)
    return
  }
  console.log(pc.green('\n  ✓ Migrations applied successfully.'))
}
