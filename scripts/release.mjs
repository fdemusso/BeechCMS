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
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const isPreview = args.includes('--preview')
const isDryRun = args.includes('--dry-run')
const bumpIdx = args.indexOf('--bump')
const bump = bumpIdx !== -1 ? args[bumpIdx + 1] : null

if (bump && !['patch', 'minor', 'major'].includes(bump)) {
  console.error('Error: --bump must be patch, minor, or major')
  process.exit(1)
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
  if (!bump) return `${v.major}.${v.minor}.${v.patch}`
  let { major, minor, patch } = v
  if (bump === 'major') { major++; minor = 0; patch = 0 }
  else if (bump === 'minor') { minor++; patch = 0 }
  else { patch++ }
  return `${major}.${minor}.${patch}`
}

// ── Package manifest paths ────────────────────────────────────────────────────

const PACKAGES = [
  { path: resolve(ROOT, 'packages/core/package.json'), name: '@beechcms/core' },
  { path: resolve(ROOT, 'packages/cli/package.json'),  name: '@beechcms/cli' },
  { path: resolve(ROOT, 'apps/api/package.json'),      name: '@beechcms/api' },
  { path: resolve(ROOT, 'package.json'),               name: '@beechcms/cms' },
]

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies']

// ── Snapshot (rollback) ───────────────────────────────────────────────────────

const snapshots = PACKAGES.map(pkg => ({ path: pkg.path, content: readRaw(pkg.path) }))

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
const npmTag = isPreview ? 'next' : 'latest'

log('')
log('  BeechCMS Release')
log('  ─────────────────────────────────────')
log(`  Current : ${currentVersion}`)
log(`  Next    : ${nextVersion}`)
log(`  npm tag : ${npmTag}`)
log(`  Dry run : ${isDryRun}`)
log('  ─────────────────────────────────────')
log('')

// ── Step 1: bump versions ─────────────────────────────────────────────────────

log('1/4  Bumping versions...')

for (const pkg of PACKAGES) {
  const json = readJson(pkg.path)
  json.version = nextVersion
  for (const key of DEP_KEYS) {
    if (!json[key]) continue
    for (const dep of Object.keys(json[key])) {
      if (dep.startsWith('@beechcms/')) json[key][dep] = `^${nextVersion}`
    }
  }
  writeJson(pkg.path, json)
  log(`     ${pkg.name}  →  ${nextVersion}`)
}

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
  run('rm -rf apps/api/assets/dashboard')
  run('mkdir -p apps/api/assets/dashboard')
  run('cp -r apps/dashboard/dist/admin/. apps/api/assets/dashboard/')
} catch {
  rollback('Dashboard asset copy failed.')
}

// ── Step 3: publish ───────────────────────────────────────────────────────────

log('')
log(`3/4  Publishing to npm (tag: ${npmTag})...`)

for (const pkg of PACKAGES) {
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
  for (const pkg of PACKAGES) run(`git add ${pkg.path}`)
  run(`git commit -m "chore: release ${nextVersion}"`)
  run(`git tag ${tagName}`)
} catch {
  // files already published — don't rollback file changes, just warn
  console.error('  ✗ Git step failed. Packages are published on npm but git tag is missing.')
  console.error(`  Run manually: git add -A && git commit -m "chore: release ${nextVersion}" && git tag ${tagName}`)
  process.exit(1)
}

log('')
log(`  ✓ Released ${nextVersion} (${npmTag})`)
log(`  Tag: ${tagName}`)
log(`  Push: git push && git push --tags`)
log(isPreview
  ? `  Install: npm install @beechcms/api@next`
  : `  Install: npm install @beechcms/api@latest`)
log('')
