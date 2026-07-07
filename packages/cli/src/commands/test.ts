import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface TestOptions {
  coverage?: boolean
  diff?: boolean
}

export async function test(args: TestOptions): Promise<void> {
  console.log(pc.cyan('\n  beech test — run test suite\n'))

  const cwd = process.cwd()
  let command = 'turbo'
  let commandArgs = ['run', 'test']

  if (args.diff) {
    const diffScript = resolve(cwd, 'scripts', 'test-coverage-diff.mjs')
    if (existsSync(diffScript)) {
      command = 'node'
      commandArgs = ['scripts/test-coverage-diff.mjs']
    } else {
      console.log(pc.red('  ✗ Coverage diff script not found (scripts/test-coverage-diff.mjs).'))
      process.exit(1)
      return
    }
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
