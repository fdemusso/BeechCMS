import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function lint(): Promise<void> {
  console.log(pc.cyan('\n  beech lint — check code style\n'))

  const placement = spawnSync('node', ['scripts/check-test-placement.mjs'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  if (placement.status !== 0) {
    process.exit(placement.status ?? 1)
  }

  const result = spawnSync('turbo', ['run', 'lint'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
