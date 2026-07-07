import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function doctor(): Promise<void> {
  console.log(pc.cyan('\n  beech doctor — React diagnostics\n'))

  const result = spawnSync('pnpm', ['dlx', 'react-doctor@latest'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
