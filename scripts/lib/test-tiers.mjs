// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Single source of truth for test tiers. Consumed by scripts/test-coverage-diff.mjs and
// scripts/dev-cli/commands/test.ts (`beech test`).

/** Every tier that exists. */
export const TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale']

/** Tiers with a runner today. `e2e` runs via `pnpm beech test --tier e2e` (Playwright, e2e/). */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale']

/** Tiers `--diff` may select. `e2e` is excluded by policy: pre-merge/nightly only. */
export const DIFF_SELECTABLE_TIERS = ['unit', 'flow', 'integration']

/** What `--diff` selects when no --tier is given. `flow` (Docker) and `e2e` are never implicit. */
export const DEFAULT_DIFF_TIERS = ['unit', 'integration']

/** Repo-relative prefixes `--diff` must never select, whatever changed under them. */
export const NEVER_SELECTED_PREFIXES = ['e2e/']

/**
 * Root/docs tooling configs that carry no runtime code and have no test runner of their own.
 * Any other existing JS/TS file outside WORKSPACES and NEVER_SELECTED_PREFIXES fails `--diff`.
 */
export const NON_RUNTIME_SOURCE_PATTERNS = [
  /^[^/]+\.(?:js|mjs|cjs|ts|mts|cts)$/,
  /^docs\/\.vitepress\//,
]

const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

/**
 * @typedef {object} TierRunner
 * @property {'related'|'all'} mode     'related' = `vitest related <changed files>`; 'all' = whole tier.
 * @property {string|null}     project  value for `--project`, or null when the config has no projects.
 * @property {string|null}     config   value for `--config`, or null for the workspace default config.
 * @property {boolean}         coverage false = run without coverage (workerd pool has no v8 provider).
 * @property {string|null}     [cwd]    repo-relative cwd when vitest `root` differs from `workspace.dir`.
 */

/** @type {TierRunner} */
const UNIT_DEFAULT = { mode: 'related', project: null, config: null, coverage: true, cwd: null }

/**
 * @typedef {object} Workspace
 * @property {string} name
 * @property {string} dir
 * @property {string} config                        vitest config parsed for coverage exclusions
 * @property {Record<string, TierRunner>} tiers
 */

/** @type {Workspace[]} */
export const WORKSPACES = [
  { name: 'packages/core',          dir: 'packages/core',          config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/cli',           dir: 'packages/cli',           config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/mcp',           dir: 'packages/mcp',           config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/client',        dir: 'packages/client',        config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/forms-react',   dir: 'packages/forms-react',   config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/widget-sdk',    dir: 'packages/widget-sdk',    config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/search-client', dir: 'packages/search-client', config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/api-client',    dir: 'packages/api-client',    config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'evals',                  dir: 'evals',                  config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'apps/dashboard',         dir: 'apps/dashboard',         config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  {
    name: 'scripts/dev-cli',
    dir: 'scripts/dev-cli',
    config: 'vitest.config.ts',
    tiers: {
      // scripts/dev-cli/vitest.config.ts pins `root` to the repo root, so Vitest runs from `.`.
      unit: { mode: 'related', project: null, config: 'scripts/dev-cli/vitest.config.ts', coverage: false, cwd: '.' },
    },
  },
  {
    name: 'apps/api',
    dir: 'apps/api',
    config: 'vitest.config.ts',
    tiers: {
      unit:  { mode: 'related', project: 'unit', config: null, coverage: true, cwd: null },
      flow:  { mode: 'related', project: 'flow', config: null, coverage: true, cwd: null },
      // One suite, workerd pool, no v8 coverage: selection is all-or-nothing by design.
      integration: { mode: 'all', project: null, config: 'vitest.workers.config.ts', coverage: false, cwd: null },
      scale: { mode: 'all', project: null, config: 'vitest.scale.config.ts', coverage: false, cwd: null },
    },
  },
]

/** @param {string} file repo-relative path @returns {string} */
function toPosix(file) {
  return file.replace(/\\/g, '/')
}

/** @param {string} file repo-relative path @returns {Workspace|null} */
export function matchWorkspace(file) {
  const normalized = toPosix(file)
  for (const ws of WORKSPACES) {
    if (normalized.startsWith(ws.dir + '/')) return ws
  }
  return null
}

/**
 * Shared test infrastructure without a Vitest suite of its own: changes here exercise
 * the `apps/api` integration tier (`@beechcms/testing` is consumed there).
 * @param {string} file repo-relative path
 */
export function isSharedHarnessFile(file) {
  return toPosix(file).startsWith('packages/testing/')
}

/**
 * Repo-level script/scaffolder files covered by `node --test scripts/lib/*.test.mjs`.
 * @param {string} file repo-relative path
 */
export function isNodeTestScriptFile(file) {
  const normalized = toPosix(file)
  return (
    normalized.startsWith('scripts/lib/') ||
    normalized.startsWith('bin/') ||
    normalized === 'scripts/test-coverage-diff.mjs'
  )
}

/**
 * Existing JS/TS files outside every tracked workspace (and not covered by another runner or
 * explicitly ignored) that would otherwise be silently skipped with zero tests run.
 * @param {string[]} unmatchedFiles repo-relative paths
 * @param {(relPath: string) => boolean} existsFn
 * @returns {string[]}
 */
export function findUntrackedSourceFiles(unmatchedFiles, existsFn) {
  const untracked = []
  for (const rawFile of unmatchedFiles) {
    const file = toPosix(rawFile)
    if (isNeverSelected(file)) continue
    if (!SOURCE_FILE_RE.test(file)) continue
    if (!existsFn(file)) continue
    if (NON_RUNTIME_SOURCE_PATTERNS.some((re) => re.test(file))) continue
    untracked.push(file)
  }
  return untracked
}

/**
 * @param {string|null} value comma-separated tier list, or null for the default set
 * @returns {{ tiers: string[], error: string|null }}
 */
export function parseTiers(value) {
  if (!value) return { tiers: [...DEFAULT_DIFF_TIERS], error: null }

  const requested = value.split(',').map((t) => t.trim()).filter(Boolean)
  if (requested.length === 0) return { tiers: [], error: `--tier needs at least one of: ${DIFF_SELECTABLE_TIERS.join(', ')}` }

  for (const tier of requested) {
    if (tier === 'e2e') {
      return { tiers: [], error: `tier 'e2e' is never selected by --diff (pre-merge/nightly only). Run it with: pnpm beech test --tier e2e` }
    }
    if (!DIFF_SELECTABLE_TIERS.includes(tier)) {
      return { tiers: [], error: `unknown tier '${tier}'. Valid tiers: ${DIFF_SELECTABLE_TIERS.join(', ')}` }
    }
  }
  return { tiers: [...new Set(requested)], error: null }
}

/** @param {string} file repo-relative path @returns {boolean} */
export function isNeverSelected(file) {
  return NEVER_SELECTED_PREFIXES.some((prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix))
}
