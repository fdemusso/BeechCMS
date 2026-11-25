import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { localStatePathHint } from '../lib/path-limits.js'

export interface DbMigrateOptions {
  local?: boolean
}

function reportMigrationFailure(): void {
  console.log(pc.red('\n  ✗ Failed to apply migrations.'))
  const hint = localStatePathHint(process.cwd())
  if (hint) console.log(pc.yellow(`  ${hint}`))
}

export async function dbMigrate(_args: DbMigrateOptions): Promise<void> {
  console.log(pc.cyan('\n  beech db:migrate — apply migrations\n'))

  const cwd = process.cwd()
  const apiDir = resolve(cwd, 'apps', 'api')

  // 1. Monorepo layout: apps/api has its own package.json with db:migrate:local
  if (existsSync(resolve(apiDir, 'package.json'))) {
    const result = spawnSync('npm', ['run', 'db:migrate:local'], {
      stdio: 'inherit',
      cwd: apiDir,
      shell: true,
    })
    if (result.status !== 0) {
      reportMigrationFailure()
      process.exit(1)
      return
    }
    console.log(pc.green('\n  ✓ Migrations applied successfully.'))
    return
  }

  // 2. Monorepo with a standalone bootstrap script (legacy/internal)
  if (existsSync(resolve(cwd, 'scripts', 'bootstrap-d1.mjs'))) {
    const result = spawnSync('node', ['scripts/bootstrap-d1.mjs'], {
      stdio: 'inherit',
      cwd,
      shell: true,
    })
    if (result.status !== 0) {
      reportMigrationFailure()
      process.exit(1)
      return
    }
    console.log(pc.green('\n  ✓ Migrations applied successfully.'))
    return
  }

  // 3. Generated consumer project: root package.json with db:migrate:local script
  //    (present in projects scaffolded by `npx @beechcms/cms@latest my-app`)
  const rootPkgPath = resolve(cwd, 'package.json')
  if (existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'))
      if (pkg.scripts?.['db:migrate:local']) {
        const result = spawnSync('npm', ['run', 'db:migrate:local'], {
          stdio: 'inherit',
          cwd,
          shell: true,
        })
        if (result.status !== 0) {
          reportMigrationFailure()
          process.exit(1)
          return
        }
        console.log(pc.green('\n  ✓ Migrations applied successfully.'))
        return
      }
    } catch {
      // malformed package.json — fall through
    }
  }

  console.log(pc.red('  ✗ No migration script found.'))
  console.log(pc.dim('  Expected a `db:migrate:local` script in package.json (present in projects scaffolded by `npx @beechcms/cms@latest my-app`).\n'))
  process.exit(1)
}
