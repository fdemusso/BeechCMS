import { spawn, execSync } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import pc from 'picocolors'

// Helper to check if a port is free (dual-stack connect + listen check)
function checkPort(port) {
  return new Promise((resolve) => {
    // 1. Try to connect to IPv4 localhost
    const socket4 = new net.Socket()
    socket4.setTimeout(200)
    
    socket4.once('connect', () => {
      socket4.destroy()
      resolve(false) // Occupied
    })
    
    socket4.once('timeout', () => {
      socket4.destroy()
      resolve(false) // Occupied
    })
    
    socket4.once('error', () => {
      // 2. Try to connect to IPv6 localhost
      const socket6 = new net.Socket()
      socket6.setTimeout(200)
      
      socket6.once('connect', () => {
        socket6.destroy()
        resolve(false) // Occupied
      })
      
      socket6.once('timeout', () => {
        socket6.destroy()
        resolve(false) // Occupied
      })
      
      socket6.once('error', () => {
        // 3. Try to listen on 0.0.0.0 (IPv4 wildcard)
        const server4 = net.createServer()
        server4.once('error', () => {
          resolve(false) // Occupied
        })
        server4.once('listening', () => {
          server4.close(() => {
            // 4. Try to listen on :: (IPv6 wildcard)
            const server6 = net.createServer()
            server6.once('error', () => {
              resolve(false) // Occupied
            })
            server6.once('listening', () => {
              server6.close(() => {
                resolve(true) // Free on both v4 and v6!
              })
            })
            server6.listen(port, '::')
          })
        })
        server4.listen(port, '0.0.0.0')
      })
      
      socket6.connect(port, '::1')
    })
    
    socket4.connect(port, '127.0.0.1')
  })
}

// Find the first available port starting from a default port, avoiding collisions
async function getAvailablePort(startPort, allocatedPorts) {
  let port = startPort
  while (true) {
    if (!allocatedPorts.has(port)) {
      const isFree = await checkPort(port)
      if (isFree) {
        allocatedPorts.add(port)
        return port
      }
    }
    port++
  }
}

// Safely updates key-value pairs in apps/api/.dev.vars without destroying comments
function updateDevVars(updates) {
  const filePath = path.join(process.cwd(), 'apps', 'api', '.dev.vars')
  if (!fs.existsSync(filePath)) {
    console.log(pc.yellow(`⚠️  ${filePath} not found. Skipping .dev.vars update.`))
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (match) {
      const key = match[1]
      if (updates[key] !== undefined) {
        return `${key}=${updates[key]}`
      }
    }
    return line
  })
  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8')
}

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

// Main startup routine
async function run() {
  console.log('🔍 Checking port availability...')
  const allocatedPorts = new Set()

  const minioPort = await getAvailablePort(9000, allocatedPorts)
  const minioConsolePort = await getAvailablePort(9001, allocatedPorts)
  const mailpitSmtpPort = await getAvailablePort(1025, allocatedPorts)
  const mailpitUiPort = await getAvailablePort(8025, allocatedPorts)
  const sqliteWebPort = await getAvailablePort(8080, allocatedPorts)
  const webhookTesterPort = await getAvailablePort(8084, allocatedPorts)

  // Configure environment variables for docker-compose
  process.env.BEECH_MINIO_PORT = String(minioPort)
  process.env.BEECH_MINIO_CONSOLE_PORT = String(minioConsolePort)
  process.env.BEECH_MAILPIT_SMTP_PORT = String(mailpitSmtpPort)
  process.env.BEECH_MAILPIT_UI_PORT = String(mailpitUiPort)
  process.env.BEECH_SQLITE_WEB_PORT = String(sqliteWebPort)
  process.env.BEECH_WEBHOOK_TESTER_PORT = String(webhookTesterPort)

  // Update apps/api/.dev.vars with newly allocated ports
  updateDevVars({
    R2_ENDPOINT: `http://localhost:${minioPort}`,
    SMTP_PORT: String(mailpitUiPort),
    WEBHOOK_TESTER_URL: `http://localhost:${webhookTesterPort}`
  })

  console.log(pc.cyan('\n📊 Port allocation mapping:'))
  console.log(`  - MinIO API (S3):      http://localhost:${pc.bold(minioPort)} (default: 9000)`)
  console.log(`  - MinIO Console:       http://localhost:${pc.bold(minioConsolePort)} (default: 9001)`)
  console.log(`  - Mailpit SMTP:        ${pc.bold(mailpitSmtpPort)} (default: 1025)`)
  console.log(`  - Mailpit HTTP UI/API: http://localhost:${pc.bold(mailpitUiPort)} (default: 8025)`)
  console.log(`  - SQLite Web UI:       http://localhost:${pc.bold(sqliteWebPort)} (default: 8080)`)
  console.log(`  - Webhook Tester UI:   http://localhost:${pc.bold(webhookTesterPort)} (default: 8084)\n`)

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
}

run().catch((err) => {
  console.error(pc.red('Fatal error during dev stack startup:'), err)
  process.exit(1)
})
