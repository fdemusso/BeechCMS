// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Single source of truth for test tiers. Consumed by scripts/test-coverage-diff.mjs and
// mirrored (names only) by packages/cli/src/commands/test.ts, which cannot import a root
// .mjs from its bundled build. packages/cli/src/test/test.test.ts asserts the two agree.

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
 * @typedef {object} TierRunner
 * @property {'related'|'all'} mode     'related' = `vitest related <changed files>`; 'all' = whole tier.
 * @property {string|null}     project  value for `--project`, or null when the config has no projects.
 * @property {string|null}     config   value for `--config`, or null for the workspace default config.
 * @property {boolean}         coverage false = run without coverage (workerd pool has no v8 provider).
 */

/** @type {TierRunner} */
const UNIT_DEFAULT = { mode: 'related', project: null, config: null, coverage: true }

/**
 * @typedef {object} Workspace
 * @property {string} name
 * @property {string} dir
 * @property {string} config                        vitest config parsed for coverage exclusions
 * @property {Record<string, TierRunner>} tiers
 */

/** @type {Workspace[]} */
export const WORKSPACES = [
  { name: 'packages/core',         dir: 'packages/core',         config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/cli',          dir: 'packages/cli',          config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/mcp',          dir: 'packages/mcp',          config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/client',       dir: 'packages/client',       config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/forms-react',  dir: 'packages/forms-react',  config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'packages/widget-sdk',   dir: 'packages/widget-sdk',   config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  { name: 'apps/dashboard',        dir: 'apps/dashboard',        config: 'vitest.config.ts', tiers: { unit: UNIT_DEFAULT } },
  {
    name: 'apps/api',
    dir: 'apps/api',
    config: 'vitest.config.ts',
    tiers: {
      unit:  { mode: 'related', project: 'unit', config: null, coverage: true },
      flow:  { mode: 'related', project: 'flow', config: null, coverage: true },
      // One suite, workerd pool, no v8 coverage: selection is all-or-nothing by design.
      integration: { mode: 'all', project: null, config: 'vitest.workers.config.ts', coverage: false },
      scale: { mode: 'all', project: null, config: 'vitest.scale.config.ts', coverage: false },
    },
  },
]

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
