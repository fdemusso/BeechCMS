import pc from 'picocolors'
import { Orchestrator, type ManagedService, type PortAllocation } from './orchestrator'
import type { LogLine } from './log-store'

const SERVICE_LOG_PREFIX: Record<ManagedService['id'], string> = {
  docker: 'docker',
  tunnel: 'tunnel',
  bootstrap: 'bootstrap',
  api: 'api',
  dashboard: 'dashboard',
  core: 'core',
}

function printPorts(ports: PortAllocation): void {
  console.log(pc.cyan('\n📊 Port allocation mapping:'))
  console.log(`  - MinIO API (S3):      http://localhost:${pc.bold(ports.minioPort)} (default: 9000)`)
  console.log(`  - MinIO Console:       http://localhost:${pc.bold(ports.minioConsolePort)} (default: 9001)`)
  console.log(`  - Mailpit SMTP:        ${pc.bold(ports.mailpitSmtpPort)} (default: 1025)`)
  console.log(`  - Mailpit HTTP UI/API: http://localhost:${pc.bold(ports.mailpitUiPort)} (default: 8025)`)
  console.log(`  - SQLite Web UI:       http://localhost:${pc.bold(ports.sqliteWebPort)} (default: 8080)`)
  console.log(`  - Webhook Tester UI:   http://localhost:${pc.bold(ports.webhookTesterPort)} (default: 8084)\n`)
}

function printServiceUpdate(service: ManagedService): void {
  switch (service.id) {
    case 'docker':
      if (service.status === 'starting' && service.detail === 'docker compose up -d') {
        console.log('🚀 Starting Docker containers...')
      } else if (service.status === 'error') {
        console.error(pc.red(`❌ Docker: ${service.detail ?? 'failed to start'}`))
      }
      break
    case 'tunnel':
      if (service.status === 'starting') {
        console.log('🌐 Waiting for Cloudflare quick tunnel...')
      } else if (service.status === 'ready') {
        console.log(`  - Tunnel URL:          ${pc.bold(service.detail ?? '')}`)
      } else if (service.status === 'error') {
        console.log(pc.yellow(`  - ${service.detail}`))
      }
      break
    case 'bootstrap':
      if (service.status === 'starting') {
        console.log('⚙️  Bootstrapping local D1 database...')
      } else if (service.status === 'error') {
        console.error(pc.red(`❌ Database bootstrap failed: ${service.detail}`))
      }
      break
    case 'core':
    case 'api':
    case 'dashboard':
      if (service.status === 'starting' && service.id === 'core') {
        console.log('⚡ Starting Beech dev servers (API + Dashboard)...')
      }
      if (service.status === 'ready') {
        console.log(`✅ ${service.label}: ${service.detail ?? 'ready'}`)
      } else if (service.status === 'error') {
        console.error(pc.red(`❌ ${service.label}: ${service.detail}`))
      }
      break
  }
}

function printLogLine(line: LogLine): void {
  const prefix = `[${SERVICE_LOG_PREFIX[line.source as ManagedService['id']] ?? line.source}]`
  const text = `${prefix} ${line.text}`
  if (line.level === 'error') {
    console.error(pc.red(text))
  } else if (line.level === 'warn') {
    console.warn(pc.yellow(text))
  } else {
    console.log(text)
  }
}

// Non-TTY fallback: reproduces the flat, line-by-line output of the original
// scripts/dev.mjs, driven by the same Orchestrator the TUI uses.
export async function runLegacy(): Promise<void> {
  const orchestrator = new Orchestrator()

  orchestrator.on('ports:update', printPorts)
  orchestrator.on('service:update', printServiceUpdate)
  orchestrator.on('log:line', printLogLine)

  let cleaningUp = false
  const cleanup = async () => {
    if (cleaningUp) return
    cleaningUp = true
    console.log('\n🛑 Stopping Docker containers...')
    await orchestrator.shutdown()
    console.log('✅ Docker containers stopped successfully.')
    process.exit(0)
  }

  process.on('SIGINT', () => void cleanup())
  process.on('SIGTERM', () => void cleanup())

  console.log('🔍 Checking port availability...')
  await orchestrator.start()
}
