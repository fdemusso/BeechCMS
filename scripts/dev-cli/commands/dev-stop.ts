import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

function isDockerInstalled(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

function isDockerRunning(): boolean {
  try {
    const result = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true })
    return result.status === 0
  } catch {
    return false
  }
}

export async function devStop(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:stop — stop Docker environment\n'))

  if (!isDockerInstalled()) {
    console.log(pc.red('  ✗ Docker is not installed or not found in your PATH.'))
    process.exit(1)
    return
  }

  if (!isDockerRunning()) {
    console.log(pc.yellow('  ⚠ Docker is installed, but the Docker daemon is NOT running.'))
    process.exit(1)
    return
  }

  console.log(pc.dim('  Stopping Docker containers…\n'))
  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'stop'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status === 0) {
    console.log(pc.green('\n  ✓ Docker containers stopped.'))
  } else {
    console.log(pc.red('\n  ✗ Failed to stop Docker containers.'))
    process.exit(1)
    return
  }
}
