#!/usr/bin/env node
/**
 * BeechCMS smart release & version management script.
 *
 * Usage:
 *   node scripts/release.mjs [command|bump] [options]
 *
 * Commands:
 *   list, ls, status                      List all packages, versions, and git diff status
 *   get [package]                         Get current version for a package (or all packages)
 *   set <package> <version>               Manually set version for a package and sync workspace dependencies
 *   [patch|minor|major]                   Run release pipeline for modified packages
 *
 * Options:
 *   --preview                             Publish to 'next' tag with -preview.N suffix
 *   --dry-run                             Simulate release without modifying files or publishing
 *   --bump <type>                         Bump type: patch | minor | major
 *   --filter, -p <name>                   Target specific package(s), comma-separated
 *   --all, --force                        Force bump all packages regardless of git diff
 *   --no-cascade                          Do not cascade bumps to dependent packages
 *   --since <ref>                         Custom git ref/commit to compare diff against
 *   -h, --help                            Show help message
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Package definitions ───────────────────────────────────────────────────────

const PACKAGES = [
  { path: resolve(ROOT, 'packages/core/package.json'),        dir: 'packages/core',        name: '@beechcms/core',        shortName: 'core',        publish: true },
  { path: resolve(ROOT, 'packages/client/package.json'),      dir: 'packages/client',      name: '@beechcms/client',      shortName: 'client',      publish: true },
  { path: resolve(ROOT, 'packages/forms-react/package.json'), dir: 'packages/forms-react', name: '@beechcms/forms-react', shortName: 'forms-react', publish: true },
  { path: resolve(ROOT, 'packages/widget-sdk/package.json'),  dir: 'packages/widget-sdk',  name: '@beechcms/widget-sdk',  shortName: 'widget-sdk',  publish: true },
  { path: resolve(ROOT, 'packages/cli/package.json'),         dir: 'packages/cli',         name: '@beechcms/cli',         shortName: 'cli',         publish: true },
  { path: resolve(ROOT, 'apps/api/package.json'),             dir: 'apps/api',             name: '@beechcms/api',         shortName: 'api',         publish: true },
  { path: resolve(ROOT, 'apps/dashboard/package.json'),       dir: 'apps/dashboard',       name: '@beechcms/dashboard',   shortName: 'dashboard',   publish: false }, // Built into API assets
  { path: resolve(ROOT, 'package.json'),                      dir: '.',                    name: '@beechcms/cms',         shortName: 'cms',         publish: true, rootOnly: true },
]

const DEP_KEYS = ['dependencies', 'devDependencies']

// ── Helpers ───────────────────────────────────────────────────────────────────

function readRaw(path) {
  return readFileSync(path, 'utf8')
}

function readJson(path) {
  return JSON.parse(readRaw(path))
}

function writeRaw(path, content, isDryRun = false) {
  if (isDryRun) return
  writeFileSync(path, content, 'utf8')
}

function writeJson(path, data, isDryRun = false) {
  writeRaw(path, JSON.stringify(data, null, 2) + '\n', isDryRun)
}

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`)
  if (opts.isDryRun && !opts.always) return ''
  const result = execSync(cmd, { cwd: opts.cwd ?? ROOT, stdio: opts.silent ? 'pipe' : 'inherit' })
  return result ? result.toString().trim() : ''
}

function log(msg = '') { console.log(msg) }

function findPackage(query) {
  if (!query) return null
  const q = query.trim().toLowerCase()
  return PACKAGES.find(p => 
    p.shortName.toLowerCase() === q ||
    p.name.toLowerCase() === q ||
    p.name.toLowerCase() === `@beechcms/${q}` ||
    p.name.toLowerCase().endsWith(`/${q}`)
  ) || null
}

// ── Version calculation ───────────────────────────────────────────────────────

function parseVersion(v) {
  const pre = v.match(/^(\d+)\.(\d+)\.(\d+)-preview\.(\d+)$/)
  if (pre) return { major: +pre[1], minor: +pre[2], patch: +pre[3], previewNum: +pre[4], isPreview: true }
  const stable = v.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (stable) return { major: +stable[1], minor: +stable[2], patch: +stable[3], previewNum: 0, isPreview: false }
  throw new Error(`Invalid semver version format: "${v}". Expected format: X.Y.Z or X.Y.Z-preview.N`)
}

function computeNextVersion(current, bumpType, preview) {
  const v = parseVersion(current)
  
  if (preview) {
    if (!bumpType || bumpType === 'patch') {
      if (v.isPreview) {
        return `${v.major}.${v.minor}.${v.patch}-preview.${v.previewNum + 1}`
      }
      return `${v.major}.${v.minor}.${v.patch + 1}-preview.1`
    }
    let { major, minor, patch } = v
    if (bumpType === 'major') { major++; minor = 0; patch = 0 }
    else if (bumpType === 'minor') { minor++; patch = 0 }
    return `${major}.${minor}.${patch}-preview.1`
  }

  // Stable release
  if (v.isPreview) {
    // If it's a preview, releasing stable promotes to the base version (e.g. 0.8.0-preview.1 -> 0.8.0)
    if (!bumpType || bumpType === 'patch') {
      return `${v.major}.${v.minor}.${v.patch}`
    }
    if (bumpType === 'minor') {
      if (v.patch === 0 && v.minor > 0) {
        return `${v.major}.${v.minor}.0`
      }
      return `${v.major}.${v.minor + 1}.0`
    }
    if (bumpType === 'major') {
      if (v.patch === 0 && v.minor === 0 && v.major > 0) {
        return `${v.major}.0.0`
      }
      return `${v.major + 1}.0.0`
    }
  }

  // Currently stable package
  if (!bumpType || bumpType === 'patch') {
    return `${v.major}.${v.minor}.${v.patch + 1}`
  }

  let { major, minor, patch } = v
  if (bumpType === 'major') { major++; minor = 0; patch = 0 }
  else if (bumpType === 'minor') { minor++; patch = 0 }
  return `${major}.${minor}.${patch}`
}

// ── Git change detection ──────────────────────────────────────────────────────

function getPackageBaseRef(pkg, customSince) {
  if (customSince) return customSince

  // 1. Check for specific git tags for this package
  try {
    const tags = execSync(`git tag --list "${pkg.name}@*" "${pkg.shortName}@*" --sort=-v:refname`, { cwd: ROOT, stdio: 'pipe' })
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
    for (const t of tags) {
      try {
        execSync(`git merge-base --is-ancestor "${t}" HEAD`, { cwd: ROOT, stdio: 'pipe' })
        return t
      } catch {}
    }
  } catch {}

  // 2. Find last commit modifying the package manifest
  try {
    const commit = execSync(`git log -n 1 --format="%H" -- "${pkg.path}"`, { cwd: ROOT, stdio: 'pipe' })
      .toString()
      .trim()
    if (commit) return commit
  } catch {}

  // 3. Fallback: last global reachable tag
  try {
    const lastGlobalTag = execSync('git describe --tags --abbrev=0 2>/dev/null', { cwd: ROOT, stdio: 'pipe' }).toString().trim()
    if (lastGlobalTag) return lastGlobalTag
  } catch {}

  return null
}

function detectPackageChanges(pkg, customSince) {
  const baseRef = getPackageBaseRef(pkg, customSince)
  
  if (!baseRef) {
    return { changed: true, files: ['(new package / initial)'], baseRef: 'initial' }
  }

  let changedFiles = []

  // Check committed changes between baseRef and HEAD
  try {
    let diffCmd = `git diff --name-only "${baseRef}..HEAD" -- "${pkg.dir}"`
    if (pkg.rootOnly) {
      diffCmd = `git diff --name-only "${baseRef}..HEAD" -- bin package.json`
    }
    const out = execSync(diffCmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()
    if (out) {
      changedFiles = out.split('\n').filter(f => !f.endsWith('package.json') && !f.endsWith('.DS_Store'))
    }
  } catch (err) {
    return { changed: true, files: [`Error: ${err.message}`], baseRef }
  }

  // Check uncommitted changes (staged & unstaged)
  try {
    let uncommittedCmd = `git status --porcelain -- "${pkg.dir}"`
    if (pkg.rootOnly) {
      uncommittedCmd = `git status --porcelain -- bin package.json`
    }
    const uncommitted = execSync(uncommittedCmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim()
    if (uncommitted) {
      const files = uncommitted.split('\n').map(l => l.slice(3).trim()).filter(f => !f.endsWith('package.json') && !f.endsWith('.DS_Store'))
      changedFiles.push(...files)
    }
  } catch {}

  changedFiles = Array.from(new Set(changedFiles))

  return {
    changed: changedFiles.length > 0,
    files: changedFiles,
    baseRef
  }
}

// ── Subcommand Handlers: list, get, set ────────────────────────────────────────

const args = process.argv.slice(2)
const firstArg = args[0]?.toLowerCase()

if (args.includes('--help') || args.includes('-h') || firstArg === 'help') {
  log(`
🌿 BeechCMS Release & Version Management Tool

Usage:
  pnpm release [command|bump] [options]
  node scripts/release.mjs [command|bump] [options]

Commands:
  list, ls, status            List all packages, versions, and git diff status
  get [package]               Get current version for a package (or all packages)
  set <package> <version>     Manually set version for a package and sync workspace
  [patch|minor|major]         Release modified packages (default: patch bump or promote preview)

Release Options:
  --preview                   Publish to 'next' tag with -preview.N suffix
  --dry-run                   Simulate release without modifying files or publishing
  --bump <type>               Bump type: patch | minor | major
  --filter, -p <name>         Target specific package(s), comma-separated (e.g. -p client,forms-react)
  --all, --force              Force bump and release of ALL packages regardless of git diff
  --no-cascade                Do not cascade bumps to dependent packages
  --since <ref>               Custom git ref to compare diff against
  -h, --help                  Show this help message

Examples:
  pnpm release list                   List all packages and versions
  pnpm release get client             Get current version of @beechcms/client
  pnpm release set client 0.8.0       Set version of @beechcms/client to 0.8.0
  pnpm release patch                  Release modified packages to stable
  pnpm release:preview                Release modified packages to preview channel
  pnpm release -p client patch        Release only @beechcms/client
  pnpm release --dry-run patch        Simulate release plan
`)
  process.exit(0)
}

// ── Subcommand: list / ls / status ─────────────────────────────────────────────

if (firstArg === 'list' || firstArg === 'ls' || firstArg === 'status') {
  log('')
  log('  🌿 BeechCMS Monorepo Packages')
  log('  ' + '─'.repeat(78))
  log('  ' + 'Key'.padEnd(14) + 'Package Name'.padEnd(25) + 'Version'.padEnd(20) + 'Published'.padEnd(12) + 'Directory')
  log('  ' + '─'.repeat(78))

  for (const pkg of PACKAGES) {
    const ver = readJson(pkg.path).version
    const keyStr = pkg.shortName.padEnd(14)
    const nameStr = pkg.name.padEnd(25)
    const verStr = ver.padEnd(20)
    const pubStr = (pkg.publish ? '✅ Yes' : '❌ No').padEnd(12)
    const dirStr = pkg.dir
    log(`  ${keyStr}${nameStr}${verStr}${pubStr}${dirStr}`)
  }
  log('  ' + '─'.repeat(78))

  // Show summary of modified packages
  const modified = PACKAGES.map(pkg => ({ pkg, diff: detectPackageChanges(pkg) })).filter(r => r.diff.changed)
  if (modified.length > 0) {
    log(`  🔍 ${modified.length} package(s) modified since last release: ` + modified.map(m => `${m.pkg.shortName} (${m.diff.files.length} files)`).join(', '))
  } else {
    log('  ✨ All packages are up to date with git history (0 modified).')
  }
  log('')
  process.exit(0)
}

// ── Subcommand: get [package] ──────────────────────────────────────────────────

if (firstArg === 'get') {
  const target = args[1]
  if (target) {
    const pkg = findPackage(target)
    if (!pkg) {
      console.error(`\n  ✗ Package "${target}" not found.`)
      console.error(`  Available packages: ${PACKAGES.map(p => p.shortName).join(', ')}\n`)
      process.exit(1)
    }
    const ver = readJson(pkg.path).version
    log(`${pkg.name}: ${ver}`)
    process.exit(0)
  }

  // List all versions
  log('')
  for (const pkg of PACKAGES) {
    const ver = readJson(pkg.path).version
    log(`  ${pkg.shortName.padEnd(14)} ${pkg.name.padEnd(25)} ${ver}`)
  }
  log('')
  process.exit(0)
}

// ── Subcommand: set <package> <version> ────────────────────────────────────────

if (firstArg === 'set') {
  const target = args[1]
  const newVer = args[2]

  if (!target || !newVer) {
    console.error('\n  ✗ Syntax error: missing package or version.')
    console.error('  Usage: pnpm release set <package> <version>')
    console.error('  Example: pnpm release set client 0.8.0-preview.1\n')
    process.exit(1)
  }

  const pkg = findPackage(target)
  if (!pkg) {
    console.error(`\n  ✗ Package "${target}" not found.`)
    console.error(`  Available packages: ${PACKAGES.map(p => p.shortName).join(', ')}\n`)
    process.exit(1)
  }

  // Validate version format
  try {
    parseVersion(newVer)
  } catch (err) {
    console.error(`\n  ✗ ${err.message}\n`)
    process.exit(1)
  }

  const oldJson = readJson(pkg.path)
  const oldVer = oldJson.version
  oldJson.version = newVer
  writeJson(pkg.path, oldJson)

  log('')
  log(`  ✓ Updated ${pkg.name}: ${oldVer} → ${newVer}`)

  // Update references in all other package.jsons
  let updatedDepsCount = 0
  for (const other of PACKAGES) {
    const json = readJson(other.path)
    let modified = false
    for (const key of DEP_KEYS) {
      if (!json[key]) continue
      for (const dep of Object.keys(json[key])) {
        if (dep === pkg.name) {
          const prefix = json[key][dep].startsWith('workspace:') ? 'workspace:' : ''
          json[key][dep] = `${prefix}^${newVer}`
          modified = true
        }
      }
    }
    if (modified) {
      writeJson(other.path, json)
      log(`     Updated dependency in ${other.name}`)
      updatedDepsCount++
    }
  }

  log('')
  log('  Syncing lockfile with pnpm install...')
  try {
    execSync('pnpm install --no-frozen-lockfile', { cwd: ROOT, stdio: 'inherit' })
    log('  ✓ Sincronizzazione lockfile completata.')
  } catch (err) {
    console.error(`  ⚠️  pnpm install failed: ${err.message}`)
  }
  log('')
  process.exit(0)
}

// ── Main Release Pipeline ─────────────────────────────────────────────────────

const isPreview = args.includes('--preview') || process.env.npm_config_preview === 'true'
const isDryRun = args.includes('--dry-run') || process.env.npm_config_dry_run === 'true'
const forceAll = args.includes('--all') || args.includes('--force') || process.env.npm_config_all === 'true'
const noCascade = args.includes('--no-cascade') || process.env.npm_config_no_cascade === 'true'

// --filter / -p <pkg>
let filterPkg = null
const filterIdx = args.findIndex(a => a === '--filter' || a === '-p' || a === '--package')
if (filterIdx !== -1 && args[filterIdx + 1]) {
  filterPkg = args[filterIdx + 1]
} else {
  const npmFilter = process.env.npm_config_filter || process.env.npm_config_package
  if (npmFilter) filterPkg = npmFilter
}

// --since <ref>
let sinceRef = null
const sinceIdx = args.indexOf('--since')
if (sinceIdx !== -1 && args[sinceIdx + 1]) {
  sinceRef = args[sinceIdx + 1]
}

// --bump patch, npm config, or positional argument
const validBumps = ['patch', 'minor', 'major']
const bumpIdx = args.indexOf('--bump')
let bump = bumpIdx !== -1 ? args[bumpIdx + 1] : null

if (!validBumps.includes(bump)) {
  const npmBump = process.env.npm_config_bump
  if (typeof npmBump === 'string' && validBumps.includes(npmBump)) {
    bump = npmBump
  } else {
    bump = args.find(a => validBumps.includes(a)) || null
  }
}

// ── Snapshot (rollback) ───────────────────────────────────────────────────────

const snapshots = [
  ...PACKAGES.map(pkg => ({ path: pkg.path, content: readRaw(pkg.path) })),
  { path: resolve(ROOT, '.github/LICENSE'), content: readRaw(resolve(ROOT, '.github/LICENSE')) }
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

log('')
log('  🌿 BeechCMS Smart Release')
log('  ────────────────────────────────────────────────────────')
log(`  Mode      : ${isPreview ? 'Preview (npm tag: next)' : 'Stable (npm tag: latest)'}`)
log(`  Bump type : ${bump ?? (isPreview ? 'increment preview' : 'auto (promote or patch)')}`)
log(`  Dry run   : ${isDryRun ? 'YES (no files will be modified)' : 'NO'}`)
if (filterPkg) log(`  Filter    : ${filterPkg}`)
if (forceAll)  log(`  Force All : YES`)
if (sinceRef)  log(`  Since Ref : ${sinceRef}`)
log('  ────────────────────────────────────────────────────────')
log('')

// Parse filter list if provided
const targetFilterList = filterPkg
  ? filterPkg.split(',').map(s => s.trim().toLowerCase())
  : null

function matchesFilter(pkg) {
  if (!targetFilterList) return true
  return targetFilterList.some(target => 
    pkg.name.toLowerCase() === target ||
    pkg.name.toLowerCase() === `@beechcms/${target}` ||
    pkg.shortName.toLowerCase() === target
  )
}

// 1. Detect changes per package
const packageStates = []

for (const pkg of PACKAGES) {
  const currentVer = readJson(pkg.path).version
  const changeInfo = detectPackageChanges(pkg, sinceRef)
  
  let willBump = false
  let reason = 'unchanged'

  if (forceAll) {
    willBump = true
    reason = 'forced (--all)'
  } else if (filterPkg) {
    if (matchesFilter(pkg)) {
      willBump = true
      reason = 'selected (--filter)'
    } else {
      willBump = false
      reason = 'filtered out'
    }
  } else if (changeInfo.changed) {
    willBump = true
    reason = `modified (${changeInfo.files.length} file${changeInfo.files.length > 1 ? 's' : ''})`
  }

  packageStates.push({
    ...pkg,
    currentVersion: currentVer,
    nextVersion: currentVer,
    willBump,
    reason,
    changeInfo
  })
}

// Special case: If apps/dashboard changed, apps/api must be rebuilt and published
const dashboardState = packageStates.find(p => p.shortName === 'dashboard')
const apiState = packageStates.find(p => p.shortName === 'api')
if (dashboardState && dashboardState.willBump && apiState && !apiState.willBump) {
  apiState.willBump = true
  apiState.reason = 'dashboard assets updated'
}

// 2. Cascade dependency bumps if enabled
if (!noCascade && !filterPkg) {
  let changed = true
  while (changed) {
    changed = false
    const bumpedPkgNames = new Set(packageStates.filter(p => p.willBump).map(p => p.name))
    
    for (const pkgState of packageStates) {
      if (pkgState.willBump) continue
      
      const json = readJson(pkgState.path)
      let dependsOnBumped = false
      
      for (const key of DEP_KEYS) {
        if (!json[key]) continue
        for (const dep of Object.keys(json[key])) {
          if (bumpedPkgNames.has(dep)) {
            dependsOnBumped = true
            break
          }
        }
        if (dependsOnBumped) break
      }

      if (dependsOnBumped) {
        pkgState.willBump = true
        pkgState.reason = 'dependency cascade'
        changed = true
      }
    }
  }
}

// Compute nextVersion for packages marked for bump
for (const pkg of packageStates) {
  if (pkg.willBump) {
    pkg.nextVersion = computeNextVersion(pkg.currentVersion, bump, isPreview)
  }
}

// Display Plan Table
log('  Release Plan:')
log('  ' + 'Package'.padEnd(25) + 'Current'.padEnd(18) + 'Next'.padEnd(18) + 'Status / Reason')
log('  ' + '─'.repeat(75))

for (const pkg of packageStates) {
  const nameStr = pkg.name.padEnd(25)
  const currStr = pkg.currentVersion.padEnd(18)
  const nextStr = (pkg.willBump ? pkg.nextVersion : '-').padEnd(18)
  const statusStr = pkg.willBump ? `🚀 ${pkg.reason}` : `💤 ${pkg.reason}`
  log(`  ${nameStr}${currStr}${nextStr}${statusStr}`)
}
log('  ' + '─'.repeat(75))
log('')

const packagesToBump = packageStates.filter(p => p.willBump)
const packagesToPublish = packagesToBump.filter(p => p.publish)

if (packagesToBump.length === 0) {
  log('  ✓ All packages are up to date. No changes detected via git diff since last release.')
  log('  To force a release anyway, use: pnpm release --all [patch|minor|major]')
  log('  To release a specific package:  pnpm release -p <name> [patch|minor|major]')
  log('')
  process.exit(0)
}

const npmTag = isPreview ? 'next' : 'latest'

// ── Step 1: Bump versions & workspace dependencies ───────────────────────────

log(`1/4  Bumping versions and updating internal dependencies...`)

// Create a map of bumped package versions
const bumpedVersionMap = new Map(packagesToBump.map(p => [p.name, p.nextVersion]))

for (const pkg of PACKAGES) {
  const json = readJson(pkg.path)
  const state = packageStates.find(p => p.name === pkg.name)
  
  if (state && state.willBump) {
    json.version = state.nextVersion
    log(`     ${pkg.name.padEnd(24)} ${state.currentVersion} → ${state.nextVersion}`)
  }

  // Update internal workspace dependencies across all packages
  let depsUpdated = false
  for (const key of DEP_KEYS) {
    if (!json[key]) continue
    for (const dep of Object.keys(json[key])) {
      if (bumpedVersionMap.has(dep)) {
        const newVer = bumpedVersionMap.get(dep)
        const prefix = json[key][dep].startsWith('workspace:') ? 'workspace:' : ''
        json[key][dep] = `${prefix}^${newVer}`
        depsUpdated = true
      }
    }
  }

  writeJson(pkg.path, json, isDryRun)
}

log('')
log('1b/4  Updating LICENSE change date...')

const licensePath = resolve(ROOT, '.github/LICENSE')
let licenseContent = readRaw(licensePath)
const changeDate = new Date()
changeDate.setFullYear(changeDate.getFullYear() + 4)
const changeDateStr = changeDate.toISOString().split('T')[0]
licenseContent = licenseContent.replace(/Change Date:\s+\d{4}-\d{2}-\d{2}/, `Change Date:          ${changeDateStr}`)
writeRaw(licensePath, licenseContent, isDryRun)

// ── Step 1c: Sync lockfile after version bump ─────────────────────────────────

log('')
log('1c/4  Syncing lockfile after version bump...')

try {
  run('pnpm install --no-frozen-lockfile', { isDryRun })
} catch {
  rollback('pnpm install failed after version bump.')
}

// ── Step 2: Build ─────────────────────────────────────────────────────────────

log('')
log('2/4  Building packages...')

try {
  run('pnpm turbo run type-check --force', { isDryRun })
} catch {
  rollback('Type-check failed.')
}

try {
  run('pnpm turbo run build --force', { isDryRun })
} catch {
  rollback('Build failed.')
}

// ── Step 2b: Copy dashboard dist into API package ─────────────────────────────

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

// ── Step 3: Publish ───────────────────────────────────────────────────────────

log('')
log(`3/4  Publishing ${packagesToPublish.length} package(s) to npm (tag: ${npmTag})...`)

for (const pkg of packagesToPublish) {
  log(`     publishing ${pkg.name}@${pkg.nextVersion}...`)
  try {
    run(`pnpm publish --access public --no-git-checks --tag ${npmTag}`, { cwd: resolve(pkg.path, '..'), isDryRun })
  } catch {
    rollback(`Publish failed for ${pkg.name}.\n  Note: previously published packages in this run are NOT rolled back on npm — bump manually if needed.`)
  }
}

// ── Step 4: Git commit + tags ─────────────────────────────────────────────────

log('')
log('4/4  Creating git commit and tags...')

const tagList = packagesToBump.map(p => `${p.name}@${p.nextVersion}`)

// Also include root vX.Y.Z tag if root package (@beechcms/cms) was bumped
const cmsPkg = packagesToBump.find(p => p.name === '@beechcms/cms')
if (cmsPkg) {
  tagList.push(`v${cmsPkg.nextVersion}`)
}

const commitMsg = packagesToBump.length === 1
  ? `chore: release ${packagesToBump[0].name}@${packagesToBump[0].nextVersion}`
  : `chore: release ${packagesToBump.map(p => `${p.shortName}@${p.nextVersion}`).join(', ')}`

try {
  run(`pnpm install --no-frozen-lockfile`, { isDryRun })

  // Add all modified package.json files
  for (const pkg of PACKAGES) run(`git add ${pkg.path}`, { isDryRun })
  run(`git add .github/LICENSE`, { isDryRun })
  run(`git add pnpm-lock.yaml`, { isDryRun })
  
  if (packagesToBump.length > 0) {
    run(`git commit -m "${commitMsg}"`, { isDryRun })
    for (const tag of tagList) {
      run(`git tag ${tag}`, { isDryRun })
    }
  }
} catch {
  console.error('  ✗ Git step failed. Packages may be published on npm but git commit/tags failed.')
  console.error(`  Run manually: git add -A && git commit -m "${commitMsg}"`)
  process.exit(1)
}

log('')
if (isDryRun) {
  log('  ✓ Dry run complete. No changes were made.')
  log('  Tags that would be created:')
  for (const tag of tagList) {
    log(`    - ${tag}`)
  }
} else {
  log(`  ✓ Successfully released ${packagesToBump.length} package(s) (${npmTag})`)
  log(`  Commit: ${commitMsg}`)
  log('  Tags:')
  for (const tag of tagList) {
    log(`    - ${tag}`)
  }
  log(`  Push: git push && git push --tags`)
}
log('')
