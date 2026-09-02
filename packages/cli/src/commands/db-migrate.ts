import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DbMigrateOptions {
  local?: boolean
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
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
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
      console.log(pc.red('\n  ✗ Failed to apply migrations.'))
      process.exit(1)
      return
    }
    console.log(pc.green('\n  ✓ Migrations applied successfully.'))
    return
  }

  // 3. Generated consumer project: root package.json with db:migrate:local script
  //    (present in projects scaffolded by `npx @beechcms/cms my-app`)
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
          console.log(pc.red('\n  ✗ Failed to apply migrations.'))
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

  // 4. Last resort: delegate to beech init --db --local which embeds the base schema
  console.log(pc.dim('  No migration script found — initialising database via beech init --db...\n'))
  const { init } = await import('./init.js')
  try {
    await init({ initDb: true, local: true, nonInteractive: true })
  } catch {
    console.log(pc.red('\n  ✗ Database initialisation failed.'))
    console.log(pc.dim('  Run: npm run db:migrate:local  or  npx beech init --db\n'))
    process.exit(1)
  }
}
