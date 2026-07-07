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

export async function devReset(): Promise<void> {
  console.log(pc.cyan('\n  beech dev:reset — reset Docker environment\n'))

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

  console.log(pc.dim('  Resetting Docker containers and volumes…\n'))
  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status === 0) {
    console.log(pc.green('\n  ✓ Docker containers stopped and volumes removed.'))
  } else {
    console.log(pc.red('\n  ✗ Docker reset failed.'))
    process.exit(1)
    return
  }
}
