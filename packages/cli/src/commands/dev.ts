import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DevOptions {
  plain?: boolean
}

export async function dev(args: DevOptions): Promise<void> {
  console.log(pc.cyan('\n  beech dev — start development environment\n'))

  const cwd = process.cwd()
  const devScript = resolve(cwd, 'scripts', 'dev.mjs')

  if (!existsSync(devScript)) {
    console.log(pc.red('  ✗ Could not find development script (scripts/dev.mjs).'))
    process.exit(1)
    return
  }

  const env = { ...process.env }
  if (args.plain) {
    env.BEECH_DEV_PLAIN = '1'
  }

  const result = spawnSync('node', ['scripts/dev.mjs'], {
    stdio: 'inherit',
    cwd,
    env,
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }
}
