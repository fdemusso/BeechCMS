#!/usr/bin/env node
// @ts-check

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Template registry ─────────────────────────────────────────────────────────

const TEMPLATES = {
  blog: {
    label: 'Blog',
    hint: 'posts with rich text, cover image, tags and authors',
    file: 'blog.ts',
    registryEntries: ['posts: POST_SEED', 'authors: AUTHOR_SEED'],
  },
  gallery: {
    label: 'Gallery',
    hint: 'media items with image, tags and featured flag',
    file: 'gallery.ts',
    registryEntries: ['gallery: GALLERY_SEED'],
  },
  contact: {
    label: 'Contact',
    hint: 'public form submissions with masked email and read status',
    file: 'contact.ts',
    registryEntries: ['messages: MESSAGE_SEED'],
  },
}

function readTemplate(filename) {
  return readFileSync(join(__dirname, 'templates', filename), 'utf8')
}

function buildSeedsFile(selectedKeys) {
  const header = `import type { Seed } from '@beechcms/core'\n\n`

  if (selectedKeys.length === 0) {
    const example = readFileSync(join(__dirname, 'templates', 'empty.ts'), 'utf8')
    return (
      header +
      example +
      '\nexport const SEED_REGISTRY: Record<string, Seed> = {}\n\n' +
      'export function getSeed(slug: string): Seed | null {\n' +
      '  return SEED_REGISTRY[slug] ?? null\n' +
      '}\n'
    )
  }

  const blocks = selectedKeys.map((key) =>
    readFileSync(join(__dirname, 'templates', TEMPLATES[key].file), 'utf8')
  )

  const registryEntries = selectedKeys.flatMap((key) => TEMPLATES[key].registryEntries)
  const registry =
    'export const SEED_REGISTRY: Record<string, Seed> = {\n' +
    registryEntries.map((e) => `  ${e},`).join('\n') +
    '\n}\n'

  const getSeed =
    '\nexport function getSeed(slug: string): Seed | null {\n' +
    '  return SEED_REGISTRY[slug] ?? null\n' +
    '}\n'

  return header + blocks.join('\n') + '\n' + registry + getSeed
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString('hex')
}

function writeFile(path, content) {
  writeFileSync(path, content, 'utf8')
}

function buildWorkerTs() {
  return `/// <reference types="@cloudflare/workers-types" />
import { createBeechApp } from '@beechcms/api'
import { seeds } from './seeds'

export default createBeechApp({ seeds })
`
}

function buildSeedsTs(selectedKeys) {
  return buildSeedsFile(selectedKeys)
}

function buildPackageJson(name) {
  return JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'wrangler dev --port 8789',
      deploy: 'wrangler deploy --minify',
      'db:migrate:local': 'wrangler d1 migrations apply ' + name + '-db --local',
      'db:reset:local': 'node -e "require(\'fs\').rmSync(\'.wrangler/state\',{recursive:true,force:true})" && npm run db:migrate:local',
    },
    dependencies: {
      '@beechcms/api': '^0.4.0-preview.3',
      '@beechcms/core': '^0.4.0-preview.3',
    },
    devDependencies: {
      '@cloudflare/workers-types': '^4.0.0',
      wrangler: '^4.0.0',
      typescript: '^5.0.0',
    },
  }, null, 2) + '\n'
}

function buildWranglerJsonc(cfg) {
  return `{
  "name": "${cfg.name}-api",
  "main": "worker.ts",
  "compatibility_date": "2025-01-01",

  "vars": {
    "JWT_SECRET": "${cfg.jwtSecret}",
    "CORS_ORIGINS": "${cfg.corsOrigins}",
    "PUBLIC_READ_API_KEY": "${cfg.publicReadKey}",
    "PUBLIC_WRITE_API_KEY": "${cfg.publicWriteKey}",
    "APP_URL": "${cfg.appUrl || 'http://localhost:5173'}"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${cfg.d1Name}",
      "database_id": "${cfg.d1Id}",
      "migrations_dir": "node_modules/@beechcms/api/migrations"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "${cfg.r2Bucket}"
    }
  ]
}
`
}

function buildDevVars(cloudflare) {
  if (cloudflare) {
    return [
      `R2_ACCESS_KEY_ID=${cloudflare.r2AccessKey}`,
      `R2_SECRET_ACCESS_KEY=${cloudflare.r2SecretKey}`,
      `R2_ENDPOINT=${cloudflare.r2Endpoint}`,
      `R2_BUCKET_NAME=${cloudflare.r2Bucket}`,
    ].join('\n') + '\n'
  }
  return [
    '# Fill these in before starting the dev server.',
    '# Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
    'R2_ACCESS_KEY_ID=',
    'R2_SECRET_ACCESS_KEY=',
    'R2_ENDPOINT=https://<YOUR_ACCOUNT_ID>.r2.cloudflarestorage.com',
    'R2_BUCKET_NAME=',
  ].join('\n') + '\n'
}

function buildTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      strict: true,
      types: ['@cloudflare/workers-types'],
    },
    include: ['*.ts'],
  }, null, 2) + '\n'
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

  const d1Name = await p.text({
    message: 'D1 Database name',
    initialValue: `${name}-db`,
    validate: (v) => { if (!v.trim()) return 'Required' },
  })
  if (p.isCancel(d1Name)) return null

  const d1Id = await p.text({
    message: 'D1 Database ID',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    hint: `Run: npx wrangler d1 create ${d1Name} — copy the "database_id" from the output`,
    validate: (v) => { if (!v.trim()) return 'Required — create the D1 database first and paste its ID here' },
  })
  if (p.isCancel(d1Id)) return null

  const r2Bucket = await p.text({
    message: 'R2 Bucket name',
    initialValue: `${name}-media`,
    validate: (v) => { if (!v.trim()) return 'Required' },
  })
  if (p.isCancel(r2Bucket)) return null

  p.note(
    [
      'Create an R2 API token:',
      '  Cloudflare Dashboard → R2 → "Manage R2 API Tokens"',
      `  → Create Token → Object Read & Write → bucket: ${r2Bucket}`,
    ].join('\n'),
    'R2 credentials'
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

  let name, selectedTemplates, cloudflare

  if (silent) {
    // Non-interactive: use first positional arg or default name, no templates, skip Cloudflare
    const positional = argv.find((a) => !a.startsWith('-'))
    name = positional ?? 'my-beech-project'
    selectedTemplates = []
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

    // Content types
    const tmpl = await p.multiselect({
      message: 'Which content types do you need?',
      hint: 'Space to select, Enter to confirm. You can add more later in seeds.ts',
      options: [
        { value: 'blog',    label: 'Blog',    hint: 'posts with rich text, cover image, tags and authors' },
        { value: 'gallery', label: 'Gallery', hint: 'media items with image, tags and featured flag' },
        { value: 'contact', label: 'Contact', hint: 'public form submissions with masked email and read status' },
      ],
      required: false,
    })
    if (p.isCancel(tmpl)) { p.cancel('Cancelled'); process.exit(0) }
    selectedTemplates = tmpl

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

  const jwtSecret = generateSecret(32)
  const publicReadKey = generateSecret(16)
  const publicWriteKey = generateSecret(16)

  const corsOrigins = cloudflare
    ? ['http://localhost:5173', 'http://localhost:5174', cloudflare.appUrl]
        .filter(Boolean).join(',')
    : 'http://localhost:5173,http://localhost:5174'

  // Scaffold
  const s = p.spinner()
  s.start('Scaffolding project…')

  mkdirSync(targetDir, { recursive: true })

  writeFile(join(targetDir, 'seeds.ts'), buildSeedsTs(selectedTemplates))
  writeFile(join(targetDir, 'worker.ts'), buildWorkerTs())
  writeFile(join(targetDir, 'package.json'), buildPackageJson(name))
  writeFile(join(targetDir, 'tsconfig.json'), buildTsConfig())
  writeFile(join(targetDir, 'wrangler.jsonc'), buildWranglerJsonc({
    name,
    d1Name: cloudflare?.d1Name ?? `${name}-db`,
    d1Id: cloudflare?.d1Id ?? 'FILL_IN_YOUR_D1_DATABASE_ID',
    r2Bucket: cloudflare?.r2Bucket ?? `${name}-media`,
    jwtSecret,
    corsOrigins,
    publicReadKey,
    publicWriteKey,
    appUrl: cloudflare?.appUrl ?? '',
  }))
  writeFile(join(targetDir, '.dev.vars'), buildDevVars(cloudflare))
  writeFile(join(targetDir, '.gitignore'), '.wrangler\nnode_modules\n.dev.vars\ndist\n')

  s.stop('Project scaffolded')

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

  const pendingConfig = !cloudflare
  const step = (n) => pc.bold(String(n + (pendingConfig ? 1 : 0)))
  console.log()
  p.note(
    [
      `${pc.bold('1. Enter the project')}`,
      `   ${pc.cyan('cd ' + name)}`,
      '',
      `${pc.bold('2. Install dependencies')}`,
      `   ${pc.cyan('npm install')}`,
      '',
      ...(pendingConfig ? [
        `${pc.bold('3. Complete Cloudflare configuration')}  ${pc.yellow('← pending')}`,
        `   Edit ${pc.underline('wrangler.jsonc')}  →  fill in ${pc.yellow('database_id')} and R2 bucket`,
        `   Edit ${pc.underline('.dev.vars')}        →  fill in R2 credentials`,
        `   Guide: https://developers.cloudflare.com/d1/`,
        '',
      ] : []),
      `${step(3)}. Run local migrations`,
      `   ${pc.cyan('npm run db:migrate:local')}`,
      '',
      `${step(4)}. Start the dev server`,
      `   ${pc.cyan('npx wrangler dev')}`,
      '',
      `${step(5)}. Deploy to production`,
      `   ${pc.cyan('npm run deploy')}`,
      '',
      `${pc.dim('Your content types are defined in seeds.ts')}`,
      `${pc.dim('JWT secret and API keys have been auto-generated.')}`,
    ].join('\n'),
    'Next steps'
  )
  p.outro(pc.green(`✔ BeechCMS project ready — ${name}/`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
