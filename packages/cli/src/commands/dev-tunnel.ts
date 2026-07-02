import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export async function devTunnel(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:tunnel — get Cloudflare Tunnel URL\n'))

  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'logs', 'tunnel'], {
    encoding: 'utf-8',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    console.log(pc.red('  ✗ Failed to retrieve tunnel logs.'))
    process.exit(1)
    return
  }

  const logs = result.stdout + (result.stderr || '')
  const match = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)

  if (match && match.length > 0) {
    const url = match[match.length - 1]
    console.log(pc.green(`  ✓ Active Cloudflare Tunnel URL: ${pc.bold(url)}`))
  } else {
    console.log(pc.yellow('  ⚠ No active Cloudflare Tunnel URL found in logs.'))
    console.log(pc.dim('    Make sure the dev server is running with Docker (`pnpm beech dev`).'))
  }
}
