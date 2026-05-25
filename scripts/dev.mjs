import { spawn, execSync } from 'node:child_process'
import pc from 'picocolors'

// Pre-check if Docker is running and reachable
try {
  execSync('docker info', { stdio: 'ignore' })
} catch (error) {
  console.error(pc.red('\n═══════════════════════════════════════════════════════════════════════'))
  console.error(pc.red('  ❌  Cannot start Beech CMS dev stack — Docker is not running.'))
  console.error(pc.red('═══════════════════════════════════════════════════════════════════════\n'))
  
  let dockerInstalled = false
  try {
    execSync('docker --version', { stdio: 'ignore' })
    dockerInstalled = true
  } catch (e) {
    // Docker not installed
  }

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

console.log('🚀 Starting Docker containers...')
try {
  execSync('docker compose up -d', { stdio: 'inherit' })
} catch (error) {
  console.error('❌ Failed to start Docker. Is Docker running?')
  process.exit(1)
}


console.log('⚙️  Bootstrapping local D1 database...')
try {
  execSync('node apps/api/scripts/bootstrap-d1.mjs', { stdio: 'inherit' })
} catch (error) {
  console.error('❌ Database bootstrap failed.')
  process.exit(1)
}

console.log('⚡ Starting Beech dev servers (API + Dashboard)...')
// Start Turbo dev as a child process inheriting standard I/O
const devProcess = spawn('npx', ['turbo', 'run', 'dev', '--parallel'], {
  stdio: 'inherit',
  shell: true,
})

// Cleanup function to stop Docker containers
let cleaningUp = false
const cleanup = () => {
  if (cleaningUp) return
  cleaningUp = true
  console.log('\n🛑 Stopping Docker containers...')
  try {
    execSync('docker compose stop', { stdio: 'inherit' })
    console.log('✅ Docker containers stopped successfully.')
  } catch (err) {
    console.error('❌ Failed to stop Docker containers:', err.message)
  }
  process.exit()
}

// Trap SIGINT (Ctrl+C), SIGTERM, and normal process exit
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// If Turbo dev exits, stop Docker containers as well
devProcess.on('exit', () => {
  cleanup()
})
