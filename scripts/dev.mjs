import { spawn, execSync } from 'node:child_process'

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
