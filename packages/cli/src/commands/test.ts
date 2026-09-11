import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Tiers with a runner. Mirrors RUNNABLE_TIERS in scripts/lib/test-tiers.mjs, which this
 * bundled package cannot import; packages/cli/src/test/test.test.ts asserts the two agree.
 */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration'] as const
export type TestTier = (typeof RUNNABLE_TIERS)[number]

export interface TestOptions {
  coverage?: boolean
  diff?: boolean
  /** Comma-separated tier list, e.g. "unit" or "unit,integration". */
  tier?: string
}

export async function test(args: TestOptions): Promise<void> {
  console.log(pc.cyan('\n  beech test — run test suite\n'))

  const cwd = process.cwd()

  const tiers = (args.tier ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const invalid = tiers.filter((t) => !RUNNABLE_TIERS.includes(t as TestTier))
  if (invalid.length > 0) {
    console.log(pc.red(`  ✗ Unknown tier(s): ${invalid.join(', ')}. Valid tiers: ${RUNNABLE_TIERS.join(', ')}.`))
    if (invalid.includes('e2e')) {
      console.log(pc.yellow('    The e2e tier is not built yet (see ROADMAP Sprint 4).'))
    }
    process.exit(1)
    return
  }

  let command = 'turbo'
  let commandArgs = ['run', 'test']

  if (args.diff) {
    const diffScript = resolve(cwd, 'scripts', 'test-coverage-diff.mjs')
    if (!existsSync(diffScript)) {
      console.log(pc.red('  ✗ Coverage diff script not found (scripts/test-coverage-diff.mjs).'))
      process.exit(1)
      return
    }
    command = 'node'
    commandArgs = ['scripts/test-coverage-diff.mjs']
    if (tiers.length > 0) commandArgs.push('--tier', tiers.join(','))
  } else if (tiers.length > 0) {
    // --tier wins over --coverage: a tier run is a selection, coverage is a reporting mode.
    commandArgs = ['run', ...tiers.map((t) => `test:${t}`)]
  } else if (args.coverage) {
    commandArgs = ['run', 'test:coverage']
  }

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd,
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }
}
