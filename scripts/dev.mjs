import { execSync } from 'node:child_process'
import pc from 'picocolors'
import { isDockerDaemonReachable, tryLaunchDockerDesktopWindows, waitForDockerDaemon } from './docker-autostart.mjs'

// Pre-check if Docker is running and reachable
if (!isDockerDaemonReachable()) {
  let dockerInstalled = false
  try {
    execSync('docker --version', { stdio: 'ignore' })
    dockerInstalled = true
  } catch {
    // Docker not installed
  }

  let recovered = false
  if (dockerInstalled && tryLaunchDockerDesktopWindows()) {
    console.log(pc.yellow('\n🐳 Docker daemon not reachable — launching Docker Desktop, waiting up to 60s...'))
    recovered = await waitForDockerDaemon(60000)
  }

  if (!recovered) {
    console.error(pc.red('\n═══════════════════════════════════════════════════════════════════════'))
    console.error(pc.red('  ❌  Cannot start Beech CMS dev stack — Docker is not running.'))
    console.error(pc.red('═══════════════════════════════════════════════════════════════════════\n'))

    if (dockerInstalled) {
      console.error(pc.yellow('  Docker is installed, but the Docker daemon/service is NOT running.'))
      console.error(pc.yellow('  Please start Docker Desktop (or your system\'s Docker service) and try again.\n'))
    } else {
      console.error(pc.yellow('  Docker is not installed or not found in your PATH.'))
      console.error(pc.yellow('  Docker is required to run the local MinIO, Mailpit, and webhook-tester services.'))
      console.error(pc.yellow('  Please install Docker: https://www.docker.com/get-started/\n'))
    }
    process.exit(1)
  }

  console.log(pc.green('✅ Docker daemon is up.\n'))
}

// Register the tsx loader so the dev CLI (and its dependencies) can be
// imported directly as .ts/.tsx without a separate build step.
const { register } = await import('tsx/esm/api')
const unregister = register()

try {
  if (process.stdout.isTTY && !process.env.BEECH_DEV_PLAIN) {
    await import('./dev-cli/index.tsx')
  } else {
    const { runLegacy } = await import('./dev-cli/legacy-runner.ts')
    await runLegacy()
  }
} catch (err) {
  console.error(pc.red('Fatal error during dev stack startup:'), err)
  process.exitCode = 1
} finally {
  unregister()
}
