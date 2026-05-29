#!/usr/bin/env node
/**
 * BeechCMS release script — atomic: rolls back file changes on any failure.
 *
 * Usage:
 *   node scripts/release.mjs [--bump patch|minor|major] [--preview] [--dry-run]
 *
 * Examples:
 *   node scripts/release.mjs --preview              # 0.4.0-preview.4 → 0.4.0-preview.5
 *   node scripts/release.mjs --bump minor --preview # 0.4.0-preview.4 → 0.5.0-preview.1
 *   node scripts/release.mjs                        # 0.4.0-preview.5 → 0.4.0
 *   node scripts/release.mjs --bump patch           # 0.4.0 → 0.4.1
 *   node scripts/release.mjs --dry-run --bump patch # simulate only
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

// Support both --preview flag and npm config (npm run release --preview)
const isPreview = args.includes('--preview') || process.env.npm_config_preview === 'true'

// Support both --dry-run flag and npm config (npm run release --dry-run)
const isDryRun = args.includes('--dry-run') || process.env.npm_config_dry_run === 'true'

// Support --bump patch, npm config, or positional argument (npm run release patch)
const validBumps = ['patch', 'minor', 'major']
const bumpIdx = args.indexOf('--bump')
let bump = bumpIdx !== -1 ? args[bumpIdx + 1] : null

if (!validBumps.includes(bump)) {
  // fallback to npm config (only if it's a string and valid)
  const npmBump = process.env.npm_config_bump
  if (typeof npmBump === 'string' && validBumps.includes(npmBump)) {
    bump = npmBump
  } else {
    // fallback to positional argument
    bump = args.find(a => validBumps.includes(a)) || null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readRaw(path) {
  return readFileSync(path, 'utf8')
}

function readJson(path) {
  return JSON.parse(readRaw(path))
}

function writeRaw(path, content) {
  if (isDryRun) return
  writeFileSync(path, content, 'utf8')
}

function writeJson(path, data) {
  writeRaw(path, JSON.stringify(data, null, 2) + '\n')
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`)
  if (isDryRun && !opts.always) return ''
  const result = execSync(cmd, { cwd: opts.cwd ?? ROOT, stdio: opts.silent ? 'pipe' : 'inherit' })
  return result ? result.toString().trim() : ''
}

function log(msg) { console.log(msg) }

// ── Version calculation ───────────────────────────────────────────────────────

function parseVersion(v) {
  const pre = v.match(/^(\d+)\.(\d+)\.(\d+)-preview\.(\d+)$/)
  if (pre) return { major: +pre[1], minor: +pre[2], patch: +pre[3], previewNum: +pre[4], isPreview: true }
  const stable = v.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (stable) return { major: +stable[1], minor: +stable[2], patch: +stable[3], previewNum: 0, isPreview: false }
  throw new Error(`Cannot parse version: ${v}`)
}

function computeNextVersion(current, bump, preview) {
  const v = parseVersion(current)
  
  if (preview) {
    if (!bump) {
      const next = v.isPreview ? v.previewNum + 1 : 1
      return `${v.major}.${v.minor}.${v.patch}-preview.${next}`
    }
    let { major, minor, patch } = v
    if (bump === 'major') { major++; minor = 0; patch = 0 }
    else if (bump === 'minor') { minor++; patch = 0 }
    else { patch++ }
    return `${major}.${minor}.${patch}-preview.1`
  }

  // Stable release
  if (!bump) {
    if (!v.isPreview) {
      log(`  ⚠️  Current version ${current} is already stable.`)
      log(`     To release a new version, use: npm run release patch|minor|major`)
      log('')
      return current // We'll handle the 'no change' case in main
    }
    // Promoting preview to stable
    return `${v.major}.${v.minor}.${v.patch}`
  }

  let { major, minor, patch } = v
  if (bump === 'major') { major++; minor = 0; patch = 0 }
  else if (bump === 'minor') { minor++; patch = 0 }
  else { patch++ }
  return `${major}.${minor}.${patch}`
}

// ── Package manifest paths ────────────────────────────────────────────────────

const PACKAGES = [
  { path: resolve(ROOT, 'packages/core/package.json'), name: '@beechcms/core', publish: true },
  { path: resolve(ROOT, 'packages/cli/package.json'),  name: '@beechcms/cli',  publish: true },
  { path: resolve(ROOT, 'packages/api/package.json'),  name: '@beech/api',     publish: false }, // Internal/Legacy
  { path: resolve(ROOT, 'apps/api/package.json'),      name: '@beechcms/api',  publish: true },
  { path: resolve(ROOT, 'apps/dashboard/package.json'),name: '@beechcms/dashboard', publish: false }, // Built into API assets
  { path: resolve(ROOT, 'package.json'),               name: '@beechcms/cms',  publish: true },
]

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies']

// ── Snapshot (rollback) ───────────────────────────────────────────────────────

const snapshots = [
  ...PACKAGES.map(pkg => ({ path: pkg.path, content: readRaw(pkg.path) })),
  { path: resolve(ROOT, 'LICENSE'), content: readRaw(resolve(ROOT, 'LICENSE')) }
]

function rollback(reason) {
  console.error(`\n  ✗ ${reason}`)
  console.error('  Rolling back file changes...')
  for (const snap of snapshots) {
    writeRaw(snap.path, snap.content)
  }
  console.error('  Rollback complete. No files changed, nothing published.\n')
  process.exit(1)
}

// ── Main ──────────────────────────────────────────────────────────────────────

const currentVersion = readJson(resolve(ROOT, 'packages/core/package.json')).version
const nextVersion = computeNextVersion(currentVersion, bump, isPreview)

if (currentVersion === nextVersion && !isDryRun) {
  log('  No version change detected. Aborting release.')
  log('  If you want to release a new version, specify a bump type (patch, minor, major).')
  process.exit(0)
}

const npmTag = isPreview ? 'next' : 'latest'

log('')
log('  BeechCMS Release')
log('  ─────────────────────────────────────')
log(`  Current : ${currentVersion}`)
log(`  Next    : ${nextVersion}${currentVersion === nextVersion ? ' (no change)' : ''}`)
log(`  npm tag : ${npmTag}`)
log(`  Dry run : ${isDryRun}`)
log('  ─────────────────────────────────────')
log('')

// ── Step 1: bump versions ─────────────────────────────────────────────────────

log('1/4  Bumping versions...')

for (const pkg of PACKAGES) {
  const json = readJson(pkg.path)
  const oldVersion = json.version
  json.version = nextVersion
  
  for (const key of DEP_KEYS) {
    if (!json[key]) continue
    for (const dep of Object.keys(json[key])) {
      if (dep.startsWith('@beechcms/') || dep.startsWith('@beech/')) {
        json[key][dep] = `^${nextVersion}`
      }
    }
  }
  
  writeJson(pkg.path, json)
  if (oldVersion !== nextVersion) {
    log(`     ${pkg.name.padEnd(16)}  ${oldVersion} → ${nextVersion}`)
  } else {
    log(`     ${pkg.name.padEnd(16)}  ${nextVersion} (unchanged)`)
  }
}

log('')
log('1b/4  Updating LICENSE change date...')

const licensePath = resolve(ROOT, 'LICENSE')
let licenseContent = readRaw(licensePath)
const changeDate = new Date()
changeDate.setFullYear(changeDate.getFullYear() + 4)
const changeDateStr = changeDate.toISOString().split('T')[0]
licenseContent = licenseContent.replace(/Change Date:\s+\d{4}-\d{2}-\d{2}/, `Change Date:          ${changeDateStr}`)
writeRaw(licensePath, licenseContent)

// ── Step 2: build ─────────────────────────────────────────────────────────────

log('')
log('2/4  Building packages...')

try {
  run('npm run build')
} catch {
  rollback('Build failed.')
}

// ── Step 2b: copy dashboard dist into api package ─────────────────────────────

log('')
log('2b/4  Copying dashboard assets into @beechcms/api...')

try {
  const src  = resolve(ROOT, 'apps/dashboard/dist/admin')
  const dest = resolve(ROOT, 'apps/api/assets/dashboard')
  if (!isDryRun) {
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
  }
  log(`  $ [node] cp ${src} → ${dest}`)
} catch (err) {
  rollback(`Dashboard asset copy failed: ${err.message}`)
}

// ── Step 3: publish ───────────────────────────────────────────────────────────

log('')
log(`3/4  Publishing to npm (tag: ${npmTag})...`)

for (const pkg of PACKAGES) {
  if (!pkg.publish) {
    log(`     skipping ${pkg.name} (not for publication)`)
    continue
  }
  
  log(`     publishing ${pkg.name}...`)
  try {
    run(`npm publish --access public --tag ${npmTag}`, { cwd: resolve(pkg.path, '..') })
  } catch {
    rollback(`Publish failed for ${pkg.name}.\n  Note: previously published packages in this run are NOT rolled back on npm — bump manually if needed.`)
  }
}

// ── Step 4: git commit + tag ──────────────────────────────────────────────────

log('')
log('4/4  Creating git commit and tag...')

const tagName = `v${nextVersion}`

try {
  // Add all package.jsons
  for (const pkg of PACKAGES) run(`git add ${pkg.path}`)
  // Also add dashboard assets if they changed
  run(`git add apps/api/assets/dashboard`)
  run(`git add LICENSE`)
  
  if (currentVersion !== nextVersion) {
    run(`git commit -m "chore: release ${nextVersion}"`)
    run(`git tag ${tagName}`)
  } else {
    log('     skipping git commit/tag (no version change)')
  }
} catch {
  // files already published — don't rollback file changes, just warn
  console.error('  ✗ Git step failed. Packages are published on npm but git tag is missing.')
  console.error(`  Run manually: git add -A && git commit -m "chore: release ${nextVersion}" && git tag ${tagName}`)
  process.exit(1)
}

log('')
if (isDryRun) {
  log('  ✓ Dry run complete. No changes were made.')
} else {
  log(`  ✓ Released ${nextVersion} (${npmTag})`)
  log(`  Tag: ${tagName}`)
  log(`  Push: git push && git push --tags`)
}
log(isPreview
  ? `  Install: npm install @beechcms/api@next`
  : `  Install: npm install @beechcms/api@latest`)
log('')

