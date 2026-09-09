// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

/**
 * Supervisor process manager for hot-reloading the BeechCMS MCP server.
 *
 * @remarks
 * Sits as a transparent stdio proxy between MCP clients (Claude Code, Cursor,
 * Antigravity) and the BeechCMS MCP server child process. When `packages/mcp/dist`
 * or `resources/manifest.json` are rebuilt, the supervisor automatically restarts
 * the child server, replays the initialization handshake, flushes queued requests,
 * and emits `list_changed` notifications without dropping the client connection.
 *
 * @module
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { createInterface } from 'node:readline'

/**
 * Computes a SHA-256 hash from a list of file paths.
 *
 * @param paths - Array of file paths to read and hash.
 * @returns SHA-256 hexadecimal hash string.
 */
export function computeBundleHash(paths: string[]): string {
  const hash = createHash('sha256')
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        hash.update(readFileSync(p))
      } catch {
        // Skip unreadable files
      }
    }
  }
  return hash.digest('hex')
}

/**
 * Configuration options for {@link McpSupervisor}.
 */
export interface McpSupervisorOptions {
  /** Path to the entry file to execute (e.g. `dist/index.js`). */
  entryFile: string
  /** Arguments to pass to the child process. */
  childArgs?: string[]
  /** Files or directories to monitor for changes. */
  watchTargets?: string[]
  /** Debounce interval in milliseconds before triggering restart. */
  debounceMs?: number
  /** Additional or overridden environment variables for the child process. */
  env?: NodeJS.ProcessEnv
  /** Custom callback when output is ready for the client (default: writes to `process.stdout`). */
  onClientOutput?: (line: string) => void
  /** Callback fired after a successful restart. */
  onRestart?: () => void
}

/**
 * Transparent proxy and lifecycle manager for MCP server processes.
 */
export class McpSupervisor {
  private entryFile: string
  private childArgs: string[]
  private watchTargets: string[]
  private debounceMs: number
  private env: NodeJS.ProcessEnv
  private onClientOutput: (line: string) => void
  private onRestartCallback?: () => void

  private child: ChildProcess | null = null
  private childReady = false
  private restarting = false
  private savedInitRequest: string | null = null
  private savedInitId: string | number | null = null
  private clientInitialized = false
  private messageBuffer: string[] = []
  private watchers: FSWatcher[] = []
  private pollInterval: NodeJS.Timeout | null = null
  private lastHash = ''
  private restartTimeout: NodeJS.Timeout | null = null
  private isStopped = false
  private childOutputRemainder = ''
  private clientInputRemainder = ''
  private restartResolve: (() => void) | null = null
  private currentRestartPromise: Promise<void> | null = null

  constructor(options: McpSupervisorOptions) {
    this.entryFile = options.entryFile
    this.childArgs = options.childArgs ?? []
    this.watchTargets = options.watchTargets ?? [this.entryFile]
    this.debounceMs = options.debounceMs ?? 150
    this.env = options.env ?? process.env
    this.onClientOutput = options.onClientOutput ?? ((line) => process.stdout.write(line + '\n'))
    this.onRestartCallback = options.onRestart
    this.lastHash = computeBundleHash(this.watchTargets)
  }

  /**
   * Starts the child MCP server process and attaches stdio streams and watchers.
   */
  async start(): Promise<void> {
    this.isStopped = false
    await this.spawnChild()
    this.setupWatchers()
  }

  /**
   * Stops the supervisor, terminates child process, and closes all watchers.
   */
  async stop(): Promise<void> {
    this.isStopped = true
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout)
      this.restartTimeout = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    for (const w of this.watchers) {
      try {
        w.close()
      } catch {}
    }
    this.watchers = []
    await this.killChild()
  }

  /**
   * Manually or automatically restarts the child server process with fresh code.
   */
  async restart(): Promise<void> {
    if (this.isStopped) return
    if (this.currentRestartPromise) {
      return this.currentRestartPromise
    }

    this.restarting = true
    this.childReady = false

    this.currentRestartPromise = (async () => {
      await this.killChild()
      await this.spawnChild()

      await new Promise<void>((resolve) => {
        this.restartResolve = resolve
        if (this.savedInitRequest && this.child?.stdin?.writable) {
          this.child.stdin.write(this.savedInitRequest + '\n')
        } else {
          this.onChildRestartReady()
        }
      })
    })().finally(() => {
      this.currentRestartPromise = null
    })

    return this.currentRestartPromise
  }

  /**
   * Handles incoming text from the MCP client stdio stream.
   *
   * @param chunk - Raw string or buffer chunk from client stdin.
   */
  handleClientInput(chunk: string): void {
    const full = this.clientInputRemainder + chunk
    const lines = full.split('\n')
    this.clientInputRemainder = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.processClientLine(trimmed)
    }
  }

  private processClientLine(line: string): void {
    try {
      const msg = JSON.parse(line)
      if (msg.method === 'initialize') {
        this.savedInitRequest = line
        this.savedInitId = msg.id
      } else if (msg.method === 'notifications/initialized') {
        this.clientInitialized = true
      }
    } catch {}

    if (this.restarting || !this.childReady || !this.child?.stdin?.writable) {
      this.messageBuffer.push(line)
    } else {
      this.child.stdin.write(line + '\n')
    }
  }

  private async spawnChild(): Promise<void> {
    return new Promise((resolve) => {
      this.child = spawn(process.execPath, [this.entryFile, ...this.childArgs], {
        env: { ...this.env, BEECH_MCP_CHILD: '1' },
        stdio: ['pipe', 'pipe', 'inherit'],
      })

      this.child.stdout?.on('data', (chunk: Buffer) => {
        this.handleChildData(chunk.toString('utf8'))
      })

      this.child.on('error', (err) => {
        console.error('[beech-mcp-supervisor] Child process error:', err)
      })

      this.child.on('exit', (code, signal) => {
        if (!this.restarting && !this.isStopped) {
          console.error(`[beech-mcp-supervisor] Child exited prematurely (code: ${code}, signal: ${signal})`)
        }
      })

      if (!this.restarting) {
        this.childReady = true
      }
      resolve()
    })
  }

  private handleChildData(chunk: string): void {
    const full = this.childOutputRemainder + chunk
    const lines = full.split('\n')
    this.childOutputRemainder = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.processChildLine(trimmed)
    }
  }

  private processChildLine(line: string): void {
    if (this.restarting) {
      try {
        const msg = JSON.parse(line)
        if (msg.id === this.savedInitId && msg.result) {
          if (this.clientInitialized && this.child?.stdin?.writable) {
            this.child.stdin.write(
              JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
            )
          }
          this.onChildRestartReady()
          return
        }
      } catch {}
    }

    this.onClientOutput(line)
  }

  private onChildRestartReady(): void {
    this.childReady = true
    this.restarting = false

    while (this.messageBuffer.length > 0) {
      const buffered = this.messageBuffer.shift()
      if (buffered && this.child?.stdin?.writable) {
        this.child.stdin.write(buffered + '\n')
      }
    }

    this.onClientOutput(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }))
    this.onClientOutput(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' }))

    if (this.onRestartCallback) {
      this.onRestartCallback()
    }

    if (this.restartResolve) {
      const resolve = this.restartResolve
      this.restartResolve = null
      resolve()
    }
  }

  private async killChild(): Promise<void> {
    if (!this.child) return
    const child = this.child
    this.child = null

    if (child.exitCode !== null) return

    return new Promise((resolve) => {
      let resolved = false
      const done = () => {
        if (!resolved) {
          resolved = true
          resolve()
        }
      }

      child.once('exit', done)
      try {
        child.stdin?.destroy()
        child.stdout?.destroy()
        child.kill('SIGTERM')
      } catch {
        done()
      }

      const forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        done()
      }, 500)
      forceKillTimer.unref()
    })
  }

  private setupWatchers(): void {
    const triggerDebouncedRestart = () => {
      if (this.restartTimeout) clearTimeout(this.restartTimeout)
      this.restartTimeout = setTimeout(async () => {
        const currentHash = computeBundleHash(this.watchTargets)
        if (currentHash !== this.lastHash) {
          this.lastHash = currentHash
          console.error('[beech-mcp] Rebuild detected, auto-restarting MCP server...')
          await this.restart()
        }
      }, this.debounceMs)
    }

    for (const target of this.watchTargets) {
      if (existsSync(target)) {
        try {
          const watcher = watch(target, () => triggerDebouncedRestart())
          this.watchers.push(watcher)
        } catch {}
      }
    }

    this.pollInterval = setInterval(() => {
      const currentHash = computeBundleHash(this.watchTargets)
      if (currentHash !== this.lastHash) {
        triggerDebouncedRestart()
      }
    }, 1000)
    this.pollInterval.unref()
  }
}

/**
 * Starts the supervisor listening on standard I/O streams.
 *
 * @param options - Supervisor options.
 */
export async function startSupervisorStdio(options: McpSupervisorOptions): Promise<void> {
  const supervisor = new McpSupervisor(options)
  await supervisor.start()

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  })

  rl.on('line', (line) => {
    supervisor.handleClientInput(line + '\n')
  })

  let isShuttingDown = false
  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true
    try {
      rl.close()
      await supervisor.stop()
    } finally {
      process.exit(0)
    }
  }

  rl.on('close', shutdown)
  process.stdin.on('end', shutdown)
  process.stdin.on('close', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
