import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execaMock = vi.fn()
vi.mock('execa', () => ({ execa: (...args: unknown[]) => execaMock(...args) }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execSync: vi.fn() }
})

const { Orchestrator } = await import('../orchestrator')

interface FakeSubprocess extends Promise<{ exitCode: number }> {
  all: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
  resolveExit: (code: number) => void
}

function createFakeSubprocess(pid = 1000): FakeSubprocess {
  const all = new EventEmitter()
  let resolveFn!: (value: { exitCode: number }) => void
  const promise = new Promise<{ exitCode: number }>((resolve) => {
    resolveFn = resolve
  })
  return Object.assign(promise, {
    all,
    pid,
    kill: vi.fn(),
    resolveExit: (code: number) => resolveFn({ exitCode: code }),
  }) as FakeSubprocess
}

describe('Orchestrator dev server lifecycle', () => {
  let orchestrator: InstanceType<typeof Orchestrator>
  let subprocesses: Record<string, FakeSubprocess>

  beforeEach(() => {
    subprocesses = {}
    let pidCounter = 1000
    execaMock.mockReset()
    execaMock.mockImplementation((_cmd: string, args: string[] = []) => {
      const workspace = args.find((a) => a.startsWith('@beechcms/'))
      const id =
        workspace === '@beechcms/core' ? 'core' : workspace === '@beechcms/api' ? 'api' : workspace === '@beechcms/dashboard' ? 'dashboard' : 'other'
      const fake = createFakeSubprocess(pidCounter++)
      subprocesses[id] = fake
      return fake
    })
    orchestrator = new Orchestrator()
  })

  it('starts dev servers in pending and moves them to starting', () => {
    expect(orchestrator.getService('core').status).toBe('pending')
    expect(orchestrator.getService('api').status).toBe('pending')
    expect(orchestrator.getService('dashboard').status).toBe('pending')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(orchestrator as any).startDevServers()

    expect(orchestrator.getService('core').status).toBe('starting')
    expect(orchestrator.getService('api').status).toBe('starting')
    expect(orchestrator.getService('dashboard').status).toBe('starting')
  })

  it('transitions to ready when the readyMatcher matches piped output', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(orchestrator as any).startDevServers()

    subprocesses.api.all.emit('data', Buffer.from('⛅️ wrangler dev\nReady on http://127.0.0.1:8789\n'))

    const api = orchestrator.getService('api')
    expect(api.status).toBe('ready')
    expect(api.detail).toContain('http://127.0.0.1:8789')
  })

  it('transitions to ready even if the piped output contains ANSI escape codes', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(orchestrator as any).startDevServers()

    subprocesses.dashboard.all.emit('data', Buffer.from('\u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:5173/\u001b[39m\n'))

    const dashboard = orchestrator.getService('dashboard')
    expect(dashboard.status).toBe('ready')
    expect(dashboard.detail).toBe('http://localhost:5173')
  })

  it('transitions a dev server to error on unexpected exit', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(orchestrator as any).startDevServers()

    subprocesses.core.resolveExit(1)
    await Promise.resolve()
    await Promise.resolve()

    const core = orchestrator.getService('core')
    expect(core.status).toBe('error')
    expect(core.detail).toContain('exited with code 1')
  })

  it('marks dev servers as stopped (not error) during shutdown', async () => {
    vi.useFakeTimers()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(orchestrator as any).startDevServers()

      // Simulate the spawned processes exiting in response to shutdown's kill signal.
      subprocesses.core.resolveExit(0)
      subprocesses.api.resolveExit(0)
      subprocesses.dashboard.resolveExit(0)

      // The "docker compose stop" call made by shutdown().
      execaMock.mockImplementationOnce(() => {
        const fake = createFakeSubprocess(9999)
        fake.resolveExit(0)
        return fake
      })

      await orchestrator.shutdown()

      expect(orchestrator.getService('core').status).toBe('stopped')
      expect(orchestrator.getService('api').status).toBe('stopped')
      expect(orchestrator.getService('dashboard').status).toBe('stopped')
      expect(orchestrator.getService('docker').status).toBe('stopped')
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts dev servers when restartDevServers is called', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(orchestrator as any).startDevServers()

    expect(orchestrator.getService('core').status).toBe('starting')

    const restartPromise = orchestrator.restartDevServers()

    // Status is immediately set to stopped while restarting
    expect(orchestrator.getService('core').status).toBe('stopped')
    expect(orchestrator.getService('core').detail).toBe('Restarting…')

    // Simulate processes exiting
    subprocesses.core.resolveExit(0)
    subprocesses.api.resolveExit(0)
    subprocesses.dashboard.resolveExit(0)

    await restartPromise

    // Status transitions back to starting (new dev servers start)
    expect(orchestrator.getService('core').status).toBe('starting')
    expect(orchestrator.getService('api').status).toBe('starting')
    expect(orchestrator.getService('dashboard').status).toBe('starting')
  })
})
