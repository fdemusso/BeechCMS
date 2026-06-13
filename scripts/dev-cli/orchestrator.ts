import { execa, type ResultPromise } from 'execa'
import { execSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import stripAnsi from 'strip-ansi'
import { LogStore, type ErrorEntry, type LogLine, type LogSource } from './log-store'

export type ServiceId = 'docker' | 'tunnel' | 'bootstrap' | 'api' | 'dashboard' | 'core'
export type ServiceStatus = 'pending' | 'starting' | 'ready' | 'error' | 'stopped'

export interface ManagedService {
  id: ServiceId
  label: string
  status: ServiceStatus
  detail?: string
  readyMatcher?: RegExp
}

export interface PortAllocation {
  minioPort: number
  minioConsolePort: number
  mailpitSmtpPort: number
  mailpitUiPort: number
  sqliteWebPort: number
  webhookTesterPort: number
}

export interface DockerContainerStatus {
  name: string
  service: string
  state: string
  health?: string
}

type OrchestratorEvents = {
  'service:update': (service: ManagedService) => void
  'log:line': (line: LogLine) => void
  'error:entry': (entries: readonly ErrorEntry[]) => void
  'ports:update': (ports: PortAllocation) => void
  'docker:containers': (containers: DockerContainerStatus[]) => void
  'shutdown:progress': (message: string) => void
  'shutdown:done': () => void
  /** Fired alongside every other event above — a generic "something changed" signal for UI subscriptions. */
  change: () => void
}

class TypedEmitter<E extends Record<string, (...args: any[]) => void>> extends EventEmitter {
  protected revision = 0

  override on<K extends keyof E & string>(event: K, listener: E[K]): this {
    return super.on(event, listener)
  }
  override off<K extends keyof E & string>(event: K, listener: E[K]): this {
    return super.off(event, listener)
  }
  override emit<K extends keyof E & string>(event: K, ...args: Parameters<E[K]>): boolean {
    const result = super.emit(event, ...args)
    if (event !== 'change') {
      this.revision++
      super.emit('change')
    }
    return result
  }
}

// --- Port helpers (extracted verbatim from the original scripts/dev.mjs) ---

export function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket4 = new net.Socket()
    socket4.setTimeout(200)

    socket4.once('connect', () => {
      socket4.destroy()
      resolve(false)
    })

    socket4.once('timeout', () => {
      socket4.destroy()
      resolve(false)
    })

    socket4.once('error', () => {
      const socket6 = new net.Socket()
      socket6.setTimeout(200)

      socket6.once('connect', () => {
        socket6.destroy()
        resolve(false)
      })

      socket6.once('timeout', () => {
        socket6.destroy()
        resolve(false)
      })

      socket6.once('error', () => {
        const server4 = net.createServer()
        server4.once('error', () => {
          resolve(false)
        })
        server4.once('listening', () => {
          server4.close(() => {
            const server6 = net.createServer()
            server6.once('error', () => {
              resolve(false)
            })
            server6.once('listening', () => {
              server6.close(() => {
                resolve(true)
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

export async function getAvailablePort(startPort: number, allocatedPorts: Set<number>): Promise<number> {
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

// Safely updates key-value pairs in apps/api/.dev.vars without destroying comments.
// Keys not yet present in the file are appended only if listed in `appendIfMissing`.
export function updateDevVars(updates: Record<string, string | undefined>, appendIfMissing: string[] = []): void {
  const filePath = path.join(process.cwd(), 'apps', 'api', '.dev.vars')
  if (!fs.existsSync(filePath)) {
    return
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const seenKeys = new Set<string>()
  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (match) {
      const key = match[1]
      if (updates[key] !== undefined) {
        seenKeys.add(key)
        return `${key}=${updates[key]}`
      }
    }
    return line
  })

  for (const key of appendIfMissing) {
    if (updates[key] !== undefined && !seenKeys.has(key)) {
      updatedLines.push(`${key}=${updates[key]}`)
    }
  }

  fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf8')
}

// Polls `docker compose logs tunnel` for the cloudflared quick-tunnel URL.
export async function getTunnelUrl(retries = 15, delayMs = 1000): Promise<string | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const logs = execSync('docker compose logs tunnel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const matches = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)
      if (matches && matches.length > 0) {
        return matches[matches.length - 1]
      }
    } catch {
      // tunnel container not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return null
}

// --- Dev server definitions (Option B: spawned directly, bypassing Turbo) ---

interface DevServerSpec {
  id: 'core' | 'api' | 'dashboard'
  label: string
  workspace: string
  readyMatcher: RegExp
  /** Extracts a human-readable detail (e.g. URL) from the line that matched readyMatcher. */
  detailFrom?: (matchedLine: string) => string | undefined
  /** Local port used for the TCP-probe readiness fallback. */
  probePort?: number
}

const DEV_SERVERS: DevServerSpec[] = [
  {
    id: 'core',
    label: 'Core (tsc -w)',
    workspace: '@beechcms/core',
    readyMatcher: /Watching for file changes|Found 0 errors/,
  },
  {
    id: 'api',
    label: 'API (wrangler)',
    workspace: '@beechcms/api',
    readyMatcher: /Ready on (https?:\/\/\S+)/,
    detailFrom: (line) => line.match(/Ready on (https?:\/\/\S+)/)?.[1],
    probePort: 8789,
  },
  {
    id: 'dashboard',
    label: 'Dashboard (vite)',
    workspace: '@beechcms/dashboard',
    readyMatcher: /Local:\s+(https?:\/\/localhost:\d+)/,
    detailFrom: (line) => line.match(/Local:\s+(https?:\/\/localhost:\d+)/)?.[1],
    probePort: 5173,
  },
]

const READY_TIMEOUT_MS = 60_000
const SHUTDOWN_WAIT_MS = 5_000
const DOCKER_PS_POLL_MS = 5_000

const INITIAL_SERVICES: ManagedService[] = [
  { id: 'docker', label: 'Docker Compose', status: 'pending' },
  { id: 'tunnel', label: 'Quick Tunnel', status: 'pending' },
  { id: 'bootstrap', label: 'DB Bootstrap', status: 'pending' },
  ...DEV_SERVERS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    status: 'pending' as ServiceStatus,
    readyMatcher: spec.readyMatcher,
  })),
]

export class Orchestrator extends TypedEmitter<OrchestratorEvents> {
  readonly logStore = new LogStore()

  private services = new Map<ServiceId, ManagedService>(INITIAL_SERVICES.map((s) => [s.id, { ...s }]))
  private ports: PortAllocation | null = null
  private dockerContainers: DockerContainerStatus[] = []
  private subprocesses = new Map<ServiceId, ResultPromise>()
  private dockerPsTimer: ReturnType<typeof setInterval> | null = null
  private cleaningUp = false
  private restartingDevServers = false

  getRevision(): number {
    return this.revision
  }

  getServices(): ManagedService[] {
    return Array.from(this.services.values())
  }

  getService(id: ServiceId): ManagedService {
    const service = this.services.get(id)
    if (!service) throw new Error(`Unknown service: ${id}`)
    return service
  }

  getPorts(): PortAllocation | null {
    return this.ports
  }

  getDockerContainers(): DockerContainerStatus[] {
    return this.dockerContainers
  }

  private updateService(id: ServiceId, patch: Partial<ManagedService>): void {
    const current = this.getService(id)
    const next = { ...current, ...patch }
    this.services.set(id, next)
    this.emit('service:update', next)
  }

  private logLine(source: LogSource, chunk: string): void {
    for (const result of this.logStore.addChunk(source, chunk)) {
      if (result.line) this.emit('log:line', result.line)
      if (result.finalizedError) this.emit('error:entry', this.logStore.getErrors())
    }
  }

  async start(): Promise<void> {
    await this.allocatePorts()
    await this.startDocker()
    this.startDockerPsPolling()
    void this.startTunnel()
    await this.startBootstrap()
    this.startDevServers()
  }

  async restartDevServers(): Promise<void> {
    if (this.restartingDevServers || this.cleaningUp) return
    this.restartingDevServers = true

    this.logLine('system', 'Restarting dev servers (core, api, dashboard)...')

    const devServerSubprocesses: { id: ServiceId; subprocess: ResultPromise }[] = []
    for (const spec of DEV_SERVERS) {
      const subprocess = this.subprocesses.get(spec.id)
      this.updateService(spec.id, { status: 'stopped', detail: 'Restarting…' })
      if (subprocess) {
        devServerSubprocesses.push({ id: spec.id, subprocess })
        this.killTree(subprocess.pid)
      }
    }

    if (devServerSubprocesses.length > 0) {
      const promises = devServerSubprocesses.map((item) => item.subprocess)
      const timeout = new Promise((resolve) => setTimeout(resolve, 3000))
      
      // Wait for processes to exit or a 3-second timeout
      await Promise.race([Promise.allSettled(promises), timeout])

      // Force-kill anything still running and remove them from subprocesses map
      for (const item of devServerSubprocesses) {
        if (this.subprocesses.get(item.id) === item.subprocess) {
          this.killTree(item.subprocess.pid, true)
          this.subprocesses.delete(item.id)
        }
      }
    }

    this.startDevServers()
    this.restartingDevServers = false
  }

  private async allocatePorts(): Promise<void> {
    this.updateService('docker', { status: 'starting', detail: 'Allocating ports…' })

    const allocatedPorts = new Set<number>()
    const ports: PortAllocation = {
      minioPort: await getAvailablePort(9000, allocatedPorts),
      minioConsolePort: await getAvailablePort(9001, allocatedPorts),
      mailpitSmtpPort: await getAvailablePort(1025, allocatedPorts),
      mailpitUiPort: await getAvailablePort(8025, allocatedPorts),
      sqliteWebPort: await getAvailablePort(8080, allocatedPorts),
      webhookTesterPort: await getAvailablePort(8084, allocatedPorts),
    }
    this.ports = ports

    process.env.BEECH_MINIO_PORT = String(ports.minioPort)
    process.env.BEECH_MINIO_CONSOLE_PORT = String(ports.minioConsolePort)
    process.env.BEECH_MAILPIT_SMTP_PORT = String(ports.mailpitSmtpPort)
    process.env.BEECH_MAILPIT_UI_PORT = String(ports.mailpitUiPort)
    process.env.BEECH_SQLITE_WEB_PORT = String(ports.sqliteWebPort)
    process.env.BEECH_WEBHOOK_TESTER_PORT = String(ports.webhookTesterPort)

    updateDevVars({
      R2_ENDPOINT: `http://localhost:${ports.minioPort}`,
      SMTP_PORT: String(ports.mailpitUiPort),
      WEBHOOK_TESTER_URL: `http://localhost:${ports.webhookTesterPort}`,
    })

    this.emit('ports:update', ports)
  }

  private async startDocker(): Promise<void> {
    this.updateService('docker', { status: 'starting', detail: 'docker compose up -d' })
    this.logLine('docker', 'Starting Docker containers via docker compose up -d...')

    const subprocess = execa('docker', ['compose', 'up', '-d'], { reject: false, all: true })
    this.subprocesses.set('docker', subprocess)
    subprocess.all?.on('data', (chunk: Buffer) => this.logLine('docker', chunk.toString()))

    const result = await subprocess
    this.subprocesses.delete('docker')
    const flushResult = this.logStore.flush('docker')
    if (flushResult?.line) this.emit('log:line', flushResult.line)

    if (result.exitCode === 0) {
      this.logLine('docker', 'Docker Compose containers started successfully.')
      this.updateService('docker', { status: 'ready', detail: 'minio · mailpit · sqlite-web · webhook-tester · tunnel' })
    } else {
      this.logLine('docker', `Docker Compose failed to start: process exited with code ${result.exitCode}`)
      this.updateService('docker', { status: 'error', detail: `docker compose up exited with code ${result.exitCode}` })
    }
  }

  private startDockerPsPolling(): void {
    const poll = async () => {
      try {
        const { stdout } = await execa('docker', ['compose', 'ps', '--format', 'json'], { reject: false })
        const containers: DockerContainerStatus[] = stdout
          .split(/\r?\n/)
          .filter((line) => line.trim().length > 0)
          .map((line): DockerContainerStatus | null => {
            try {
              const parsed = JSON.parse(line)
              return {
                name: parsed.Name ?? parsed.Service ?? 'unknown',
                service: parsed.Service ?? parsed.Name ?? 'unknown',
                state: parsed.State ?? 'unknown',
                health: parsed.Health,
              }
            } catch {
              return null
            }
          })
          .filter((c): c is DockerContainerStatus => c !== null)

        this.dockerContainers = containers
        this.emit('docker:containers', containers)
      } catch {
        // docker compose ps failed (e.g. during shutdown) — ignore
      }
    }

    void poll()
    this.dockerPsTimer = setInterval(poll, DOCKER_PS_POLL_MS)
  }

  private async startTunnel(): Promise<void> {
    this.updateService('tunnel', { status: 'starting', detail: 'Waiting for Cloudflare quick tunnel…' })

    const tunnelUrl = await getTunnelUrl()
    if (tunnelUrl) {
      updateDevVars({ QSTASH_CALLBACK_URL: tunnelUrl }, ['QSTASH_CALLBACK_URL'])
      this.updateService('tunnel', { status: 'ready', detail: tunnelUrl })
    } else {
      this.updateService('tunnel', { status: 'error', detail: 'Tunnel URL not detected (run `npm run dev:tunnel-url`).' })
    }
  }

  private async startBootstrap(): Promise<void> {
    this.updateService('bootstrap', { status: 'starting', detail: 'Applying D1 migrations…' })

    let applied = 0
    let skipped = 0
    const subprocess = execa('node', ['apps/api/scripts/bootstrap-d1.mjs'], { reject: false, all: true })
    this.subprocesses.set('bootstrap', subprocess)
    subprocess.all?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.logLine('bootstrap', text)
      for (const line of text.split(/\r?\n/)) {
        if (/\[bootstrap-d1\] applying/.test(line)) applied++
        if (/\[bootstrap-d1\].*skipped/.test(line)) skipped++
      }
    })

    const result = await subprocess
    this.subprocesses.delete('bootstrap')
    const flushResult = this.logStore.flush('bootstrap')
    if (flushResult?.line) this.emit('log:line', flushResult.line)
    if (flushResult?.finalizedError) this.emit('error:entry', this.logStore.getErrors())

    if (result.exitCode === 0) {
      this.logLine('bootstrap', 'DB Bootstrap completed successfully.')
      this.updateService('bootstrap', {
        status: 'ready',
        detail: applied === 0 ? 'No pending migrations' : `${applied} migration(s) applied${skipped ? `, ${skipped} skipped` : ''}`,
      })
    } else {
      this.logLine('bootstrap', `DB Bootstrap failed: process exited with code ${result.exitCode}`)
      this.updateService('bootstrap', { status: 'error', detail: `bootstrap-d1 exited with code ${result.exitCode}` })
    }
  }

  private startDevServers(): void {
    for (const spec of DEV_SERVERS) {
      this.startDevServer(spec)
    }
  }

  private startDevServer(spec: DevServerSpec): void {
    this.updateService(spec.id, { status: 'starting', detail: 'Starting…' })
    this.logLine(spec.id, `Starting dev server: npm run dev -w ${spec.workspace}...`)

    const subprocess = execa('npm', ['run', 'dev', '-w', spec.workspace], {
      reject: false,
      all: true,
      shell: true,
      cwd: process.cwd(),
    })
    this.subprocesses.set(spec.id, subprocess)

    let ready = false

    const readyTimer = setTimeout(() => {
      void this.probeReadiness(spec, ready)
    }, READY_TIMEOUT_MS)

    subprocess.all?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.logLine(spec.id, text)

      if (!ready) {
        const cleanText = stripAnsi(text)
        const match = cleanText.match(spec.readyMatcher)
        if (match) {
          ready = true
          clearTimeout(readyTimer)
          this.updateService(spec.id, { status: 'ready', detail: spec.detailFrom?.(match[0]) ?? 'ready' })
        }
      }
    })

    void subprocess.then((result) => {
      if (this.subprocesses.get(spec.id) !== subprocess) {
        return
      }
      this.subprocesses.delete(spec.id)
      clearTimeout(readyTimer)
      const flushResult = this.logStore.flush(spec.id)
      if (flushResult?.line) this.emit('log:line', flushResult.line)
      if (flushResult?.finalizedError) this.emit('error:entry', this.logStore.getErrors())

      if (this.cleaningUp) {
        this.logLine(spec.id, `Service stopped (during shutdown)`)
        return
      }

      const current = this.getService(spec.id)
      if (current.status !== 'stopped') {
        this.logLine(spec.id, `Service exited unexpectedly with code ${result.exitCode}`)
        this.updateService(spec.id, { status: 'error', detail: `process exited with code ${result.exitCode}` })
      }
    })
  }

  private async probeReadiness(spec: DevServerSpec, alreadyReady: boolean): Promise<void> {
    if (alreadyReady || !spec.probePort) return
    const current = this.getService(spec.id)
    if (current.status === 'ready' || current.status === 'error') return

    const isFree = await checkPort(spec.probePort)
    if (!isFree) {
      // Port is occupied by our own process — treat as ready even though the
      // expected log pattern wasn't matched (pattern may have changed upstream).
      this.updateService(spec.id, { status: 'ready', detail: `http://127.0.0.1:${spec.probePort} (assumed ready)` })
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleaningUp) return
    this.cleaningUp = true

    if (this.dockerPsTimer) {
      clearInterval(this.dockerPsTimer)
      this.dockerPsTimer = null
    }

    for (const id of ['core', 'api', 'dashboard'] as const) {
      const service = this.getService(id)
      if (service.status !== 'error') {
        this.updateService(id, { status: 'stopped' })
      }
    }

    this.emit('shutdown:progress', 'Stopping dev servers…')
    await this.killSubprocesses()

    this.emit('shutdown:progress', 'Stopping Docker containers…')
    this.logLine('docker', 'Stopping Docker containers via docker compose stop...')
    try {
      const subprocess = execa('docker', ['compose', 'stop'], { reject: false, all: true })
      subprocess.all?.on('data', (chunk: Buffer) => this.logLine('docker', chunk.toString()))
      await subprocess
      const flushResult = this.logStore.flush('docker')
      if (flushResult?.line) this.emit('log:line', flushResult.line)
      this.logLine('docker', 'Docker Compose containers stopped successfully.')
      this.updateService('docker', { status: 'stopped' })
    } catch {
      // best-effort
    }

    this.emit('shutdown:done')
  }

  private async killSubprocesses(): Promise<void> {
    const entries = Array.from(this.subprocesses.entries())
    if (entries.length === 0) return

    for (const [, subprocess] of entries) {
      this.killTree(subprocess.pid)
    }

    const timeout = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_WAIT_MS))
    await Promise.race([Promise.allSettled(entries.map(([, sp]) => sp)), timeout])

    // Force-kill anything still alive after the timeout.
    for (const [, subprocess] of entries) {
      this.killTree(subprocess.pid, true)
    }
    this.subprocesses.clear()
  }

  private killTree(pid: number | undefined, force = false): void {
    if (!pid) return
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /T${force ? ' /F' : ''}`, { stdio: 'ignore' })
      } else {
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
      }
    } catch {
      // process already gone
    }
  }
}
