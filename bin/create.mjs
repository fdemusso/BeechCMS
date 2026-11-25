#!/usr/bin/env node
// @ts-check

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { spawnSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  DEV_PUBLISHABLE_KEY,
  PRODUCTION_SECRETS,
  buildDevVars,
  buildPackageJson,
  buildTsConfig,
  buildWorkerTs,
  buildWranglerJsonc,
} from './template.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Dependency ranges for the generated project. A published @beechcms/cms ships them in
 * `template-versions.json` (written at release time); in the monorepo they are read from the
 * manifests that own them.
 */
async function loadTemplateVersions() {
  const published = join(__dirname, 'template-versions.json')
  if (existsSync(published)) return JSON.parse(readFileSync(published, 'utf8'))

  const helper = join(__dirname, '..', 'scripts', 'lib', 'template-versions.mjs')
  if (existsSync(helper)) {
    const { computeTemplateVersions } = await import(pathToFileURL(helper).href)
    return computeTemplateVersions(join(__dirname, '..'))
  }
  throw new Error('template-versions.json is missing from this @beechcms/cms install; reinstall the package.')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeFile(path, content) {
  writeFileSync(path, content, 'utf8')
}

// ── Cloudflare prompts ────────────────────────────────────────────────────────

async function askCloudflareConfig(name) {
  p.note(
    [
      'You will need a free Cloudflare account with:',
      '',
      `  D1 database  →  ${pc.cyan('npx wrangler d1 create ' + name + '-db')}`,
      `  R2 bucket    →  ${pc.cyan('npx wrangler r2 bucket create ' + name + '-media')}`,
      '',
      'Docs:  https://developers.cloudflare.com/d1/',
      '       https://developers.cloudflare.com/r2/',
    ].join('\n'),
    'Prerequisites'
  )

  const accountId = await p.text({
    message: 'Cloudflare Account ID',
    hint: 'dash.cloudflare.com → right sidebar → "Account ID"',
    validate: (v) => { if (!v.trim()) return 'Required' },
  })
  if (p.isCancel(accountId)) return null

  const autoCreate = await p.confirm({
    message: `Auto-create Cloudflare D1 (${name}-db) and R2 (${name}-media) now?`,
    hint: 'Runs `wrangler d1 create` and `wrangler r2 bucket create`',
    initialValue: true,
  })
  if (p.isCancel(autoCreate)) return null

  let d1Id = ''
  const d1Name = `${name}-db`
  const r2Bucket = `${name}-media`

  if (autoCreate) {
    const s = p.spinner()
    s.start(`Creating D1 database: ${pc.bold(d1Name)}…`)
    const d1Res = spawnSync('npx', ['wrangler', 'd1', 'create', d1Name], { encoding: 'utf-8', shell: true })
    const d1Out = (d1Res.stdout || '') + (d1Res.stderr || '')
    const idMatch = d1Out.match(/database_id\s*=\s*["']?([a-f0-9-]{36})["']?/i) ||
                    d1Out.match(/"database_id":\s*"([a-f0-9-]{36})"/i) ||
                    d1Out.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
    if (idMatch) {
      d1Id = idMatch[1]
      s.stop(pc.green(`✓ D1 database ready (${d1Id})`))
    } else {
      s.stop(pc.yellow(`ℹ D1 status: ${d1Out.trim().slice(0, 100)}`))
    }

    s.start(`Creating R2 bucket: ${pc.bold(r2Bucket)}…`)
    spawnSync('npx', ['wrangler', 'r2', 'bucket', 'create', r2Bucket], { encoding: 'utf-8', shell: true })
    s.stop(pc.green(`✓ R2 bucket ready (${r2Bucket})`))
  }

  if (!d1Id) {
    const d1IdInput = await p.text({
      message: 'D1 Database ID',
      placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      hint: `Run: npx wrangler d1 create ${d1Name} — paste the "database_id" here`,
      validate: (v) => { if (!v.trim()) return 'Required — paste database_id from D1' },
    })
    if (p.isCancel(d1IdInput)) return null
    d1Id = d1IdInput.trim()
  }

  p.note(
    [
      'Direct client uploads use Presigned URLs (SigV4) to stream files directly to R2.',
      'Create an R2 API token:',
      '  Cloudflare Dashboard → R2 → "Manage R2 API Tokens"',
      `  → Create Token → Object Read & Write → bucket: ${r2Bucket}`,
      'Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
    ].join('\n'),
    'R2 S3 Credentials (for Presigned URLs)'
  )

  const r2AccessKey = await p.text({
    message: 'R2 Access Key ID',
    validate: (v) => { if (!v.trim()) return 'Required' },
  })
  if (p.isCancel(r2AccessKey)) return null

  const r2SecretKey = await p.password({
    message: 'R2 Secret Access Key',
    validate: (v) => { if (!v.trim()) return 'Required' },
  })
  if (p.isCancel(r2SecretKey)) return null

  const appUrl = await p.text({
    message: 'Production dashboard URL (for CORS)',
    placeholder: `https://cms.${name}.com`,
    hint: 'Leave empty to configure later in wrangler.jsonc',
  })
  if (p.isCancel(appUrl)) return null

  return {
    accountId: accountId.trim(),
    d1Name: d1Name.trim(),
    d1Id: d1Id.trim(),
    r2Bucket: r2Bucket.trim(),
    r2AccessKey: r2AccessKey.trim(),
    r2SecretKey: r2SecretKey.trim(),
    r2Endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
    appUrl: appUrl?.trim() ?? '',
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const silent = argv.includes('--yes') || argv.includes('-y') || !process.stdout.isTTY

  console.log()
  p.intro(pc.bgGreen(pc.black(' @beechcms/cms ')))

  let name, cloudflare

  if (silent) {
    // Non-interactive: use first positional arg or default name, skip Cloudflare
    const positional = argv.find((a) => !a.startsWith('-'))
    name = positional ?? 'my-beech-project'
    cloudflare = null
    console.log(pc.dim(`  Running in non-interactive mode. Project name: ${name}`))
  } else {
    // Project name
    const projectName = await p.text({
      message: 'Project name',
      placeholder: 'my-website',
      validate: (v) => {
        if (!v.trim()) return 'Required'
        if (!/^[a-z0-9][a-z0-9-]*$/.test(v.trim())) return 'Lowercase letters, numbers and hyphens only'
      },
    })
    if (p.isCancel(projectName)) { p.cancel('Cancelled'); process.exit(0) }
    name = projectName.trim()

    // Cloudflare now or later?
    const configureNow = await p.confirm({
      message: 'Configure Cloudflare credentials now?',
      hint: 'Choose "No" to scaffold the project and fill in the values later',
      initialValue: true,
    })
    if (p.isCancel(configureNow)) { p.cancel('Cancelled'); process.exit(0) }

    if (configureNow) {
      cloudflare = await askCloudflareConfig(name)
      if (!cloudflare) { p.cancel('Cancelled'); process.exit(0) }
    }
  }

  const targetDir = resolve(process.cwd(), name)
  if (existsSync(targetDir)) {
    p.cancel(`Directory '${name}' already exists. Choose a different name or delete the folder.`)
    process.exit(1)
  }

  // wrangler keeps the local D1 file under the project folder; past ~130 characters Windows refuses
  // it and wrangler answers with an opaque "internal error" (see packages/cli/src/lib/path-limits.ts).
  if (process.platform === 'win32' && targetDir.length > 125) {
    p.log.warn(
      `This folder path is ${targetDir.length} characters long: the local database may fail with "internal error". ` +
      'Scaffold into a shorter folder (for example C:/dev) or enable Windows long paths.'
    )
  }

  const corsOrigins = cloudflare
    ? ['http://localhost:5173', 'http://localhost:5174', cloudflare.appUrl]
        .filter(Boolean).join(',')
    : 'http://localhost:5173,http://localhost:5174'

  const d1Name = cloudflare?.d1Name ?? `${name}-db`
  const versions = await loadTemplateVersions()

  // Scaffold
  const s = p.spinner()
  s.start('Scaffolding project…')

  mkdirSync(targetDir, { recursive: true })

  writeFile(join(targetDir, 'worker.ts'), buildWorkerTs())
  writeFile(join(targetDir, 'package.json'), buildPackageJson(name, d1Name, versions))
  writeFile(join(targetDir, 'tsconfig.json'), buildTsConfig())
  writeFile(join(targetDir, 'wrangler.jsonc'), buildWranglerJsonc({
    name,
    d1Name,
    d1Id: cloudflare?.d1Id ?? 'FILL_IN_YOUR_D1_DATABASE_ID',
    r2Bucket: cloudflare?.r2Bucket ?? `${name}-media`,
    corsOrigins,
    appUrl: cloudflare?.appUrl ?? '',
  }))
  writeFile(join(targetDir, '.dev.vars'), buildDevVars(cloudflare))
  writeFile(join(targetDir, '.gitignore'), '.wrangler\nnode_modules\n.dev.vars\ndist\n')

  s.stop('Project scaffolded')

  // Install dependencies so `npm run dev` works straight away
  let installed = false
  if (!argv.includes('--no-install')) {
    s.start('Installing dependencies (this can take a minute)…')
    const install = spawnSync('npm', ['install', '--no-fund', '--no-audit'], {
      cwd: targetDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    installed = install.status === 0
    if (installed) {
      s.stop('Dependencies installed')
    } else {
      s.stop(pc.yellow('Dependency install failed'))
      console.log(pc.dim((install.stderr || install.stdout || '').trim().split('\n').slice(-8).join('\n')))
    }
  }

  // Init git
  s.start('Initialising git repository…')
  try {
    execSync(`git -C "${targetDir}" init -q`, { stdio: 'pipe' })
    execSync(`git -C "${targetDir}" add -A`, { stdio: 'pipe' })
    execSync(`git -C "${targetDir}" commit -q -m "feat: initialise BeechCMS project"`, { stdio: 'pipe' })
    s.stop('Git initialised')
  } catch {
    s.stop('Git skipped (not available)')
  }

  console.log()
  p.note(
    [
      `${pc.bold('Start the project')}`,
      `   ${pc.cyan('cd ' + name)}`,
      ...(installed ? [] : [`   ${pc.cyan('npm install')}`]),
      `   ${pc.cyan('npm run dev')}`,
      `   Applies the local database migrations, then serves the API and dashboard.`,
      `   Open ${pc.underline('http://localhost:8789/admin')} to create your admin account.`,
      '',
      `${pc.bold('Public API keys')}`,
      `   Publishable key: ${pc.cyan(DEV_PUBLISHABLE_KEY)} (browser and server, read only, in wrangler.jsonc)`,
      `   The secret key (server only, reads and writes) is in ${pc.underline('.dev.vars')}.`,
      '',
      `${pc.bold('When you are ready to deploy')}`,
      ...(cloudflare ? [] : [
        `   Edit ${pc.underline('wrangler.jsonc')}  →  fill in ${pc.yellow('database_id')} (D1) and ${pc.yellow('bucket_name')} (R2)`,
      ]),
      ...PRODUCTION_SECRETS.map((secret) => `   ${pc.cyan('npx wrangler secret put ' + secret)}`),
      `   Use fresh values, not the local ones.`,
      `   The secret key starts with beech_sk_live_; the API refuses the local development key outside development.`,
      `   Set PRIVACY_MASTER_KEY once and never change it after data is stored.`,
      `   Generate a value: ${pc.cyan(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)}`,
      `   Set the R2 S3 secrets (direct uploads): ${pc.cyan('npx wrangler secret put R2_ACCESS_KEY_ID')}, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME`,
      `   Guide: https://developers.cloudflare.com/r2/api/s3/tokens/`,
      `   ${pc.cyan('npm run deploy')}`,
      '',
      `${pc.dim('Uploads work locally with no setup. Local secrets are in .dev.vars, which git ignores.')}`,
    ].join('\n'),
    'Next steps'
  )
  p.outro(pc.green(`✔ BeechCMS project ready — ${name}/`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

