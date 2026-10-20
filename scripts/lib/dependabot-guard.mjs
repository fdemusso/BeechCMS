#!/usr/bin/env node
/**
 * Dependabot PR guard.
 *
 * Compares every package.json of a pull request against its base and reports the two kinds of
 * change that must never be merged without a human: a dependency whose range went DOWN (a grouped
 * or multi-directory update applies one target version everywhere, which downgrades a package that
 * was already ahead) and a MAJOR bump.
 *
 * Usage (from a checkout that contains both commits):
 *   node scripts/lib/dependabot-guard.mjs <baseSha> <headSha>
 *
 * Prints a JSON report on stdout. Exit code is 0 whatever the verdict: the caller decides.
 */

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** package.json sections whose values are dependency ranges. */
const RANGE_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/** Lowest version a range admits, or null when it is not a plain semver range (workspace:, git, tag). */
export function minVersion(range) {
  if (typeof range !== 'string') return null
  if (/^(workspace:|file:|link:|git|github:|http)/.test(range)) return null
  const match = range.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** -1 | 0 | 1 */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1
  }
  return 0
}

/** Every `name -> range` entry of a manifest, keyed by `section:name`. */
function collectRanges(manifest) {
  const ranges = new Map()
  for (const section of RANGE_SECTIONS) {
    for (const [name, range] of Object.entries(manifest?.[section] ?? {})) {
      ranges.set(`${section}:${name}`, range)
    }
  }
  for (const [name, range] of Object.entries(manifest?.pnpm?.overrides ?? {})) ranges.set(`pnpm.overrides:${name}`, range)
  for (const [name, range] of Object.entries(manifest?.overrides ?? {})) {
    if (typeof range === 'string') ranges.set(`overrides:${name}`, range)
  }
  return ranges
}

/**
 * @param {{ file: string, base: object | null, head: object | null }[]} manifests
 * @returns {{ downgrades: object[], majors: object[] }}
 */
export function analyze(manifests) {
  const downgrades = []
  const majors = []

  for (const { file, base, head } of manifests) {
    if (!base || !head) continue
    const before = collectRanges(base)
    const after = collectRanges(head)

    for (const [key, to] of after) {
      const from = before.get(key)
      if (from === undefined || from === to) continue

      const low = minVersion(from)
      const high = minVersion(to)
      if (!low || !high) continue

      const [section, ...rest] = key.split(':')
      const entry = { file, section, name: rest.join(':'), from, to }
      const order = compareVersions(high, low)
      if (order < 0) downgrades.push(entry)
      else if (order > 0 && high[0] > low[0]) majors.push(entry)
    }
  }

  return { downgrades, majors }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

function readManifest(ref, file) {
  try {
    return JSON.parse(git(['show', `${ref}:${file}`]))
  } catch {
    return null
  }
}

/** Compares the package.json files that differ between two commits. */
export function analyzeRefs(baseRef, headRef) {
  const changed = git(['diff', '--name-only', baseRef, headRef, '--', '*package.json'])
    .split('\n')
    .filter(Boolean)

  const manifests = changed.map((file) => ({ file, base: readManifest(baseRef, file), head: readManifest(headRef, file) }))
  return { changed, ...analyze(manifests) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baseRef, headRef] = process.argv.slice(2)
  if (!baseRef || !headRef) {
    console.error('usage: dependabot-guard.mjs <baseSha> <headSha>')
    process.exit(2)
  }
  console.log(JSON.stringify(analyzeRefs(baseRef, headRef), null, 2))
}
