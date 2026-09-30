import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Tiers with a runner. Mirrors RUNNABLE_TIERS in scripts/lib/test-tiers.mjs, which this
 * bundled package cannot import; packages/cli/src/test/test.test.ts asserts the two agree.
 */
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale'] as const
export type TestTier = (typeof RUNNABLE_TIERS)[number]

export interface TestOptions {
  coverage?: boolean
  diff?: boolean
  /** Comma-separated tier list, e.g. "unit" or "unit,integration". */
  tier?: string
}

interface TestResourcesModule {
  resolveTestResources(): { turboConcurrency: number } | null
  testResourceEnv(resources: unknown): Record<string, string>
  lowerProcessPriority(): void
  describeTestResources(resources: unknown): string
}

/**
 * Local-only CPU budget (thermal protection). The policy lives in scripts/lib/test-resources.mjs,
 * shared with scripts/test-runner.mjs; this bundled package loads it from the repo at runtime and
 * runs unthrottled when it is absent (e.g. outside the monorepo).
 */
async function loadTestResources(cwd: string): Promise<{ env: Record<string, string>; turboArgs: string[] }> {
  const modulePath = resolve(cwd, 'scripts', 'lib', 'test-resources.mjs')
  if (!existsSync(modulePath)) return { env: {}, turboArgs: [] }
  try {
    const mod = (await import(pathToFileURL(modulePath).href)) as TestResourcesModule
    const resources = mod.resolveTestResources()
    console.log(pc.dim(`  ${mod.describeTestResources(resources)}\n`))
    if (!resources) return { env: {}, turboArgs: [] }
    mod.lowerProcessPriority()
    return { env: mod.testResourceEnv(resources), turboArgs: [`--concurrency=${resources.turboConcurrency}`] }
  } catch {
    return { env: {}, turboArgs: [] }
  }
}

export async function test(args: TestOptions): Promise<void> {
  console.log(pc.cyan('\n  beech test — run test suite\n'))

  const cwd = process.cwd()

  const tiers = (args.tier ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const invalid = tiers.filter((t) => !RUNNABLE_TIERS.includes(t as TestTier))
  if (invalid.length > 0) {
    console.log(pc.red(`  ✗ Unknown tier(s): ${invalid.join(', ')}. Valid tiers: ${RUNNABLE_TIERS.join(', ')}.`))
    process.exit(1)
    return
  }

  if (args.diff && (tiers.includes('e2e') || tiers.includes('scale'))) {
    console.log(pc.red('  ✗ The e2e and scale tiers are never selected by --diff.'))
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

  const resources = await loadTestResources(cwd)
  if (command === 'turbo') commandArgs.push(...resources.turboArgs)

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd,
    shell: true,
    env: { ...process.env, ...resources.env },
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }
}
