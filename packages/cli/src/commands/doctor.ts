import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function doctor(): Promise<void> {
  console.log(pc.cyan('\n  beech doctor — React diagnostics\n'))

  const cmd = process.env.npm_config_user_agent?.includes('pnpm') ? 'pnpm' : 'npx'
  const args = cmd === 'pnpm' ? ['dlx', 'react-doctor@latest'] : ['--yes', 'react-doctor@latest']

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
