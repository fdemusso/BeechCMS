// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reset } from '../commands/reset.js'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
}))

vi.mock('picocolors', () => ({
  default: {
    cyan: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
  },
}))

describe('reset command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs docker compose down when --docker is passed and docker is running', async () => {
    await reset({ docker: true })
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'],
      expect.any(Object)
    )
  })

  it('does not run docker compose down when docker is not installed', async () => {
    // Mock docker --version to fail
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'docker' && args && args[0] === '--version') {
        return { status: 1 } as any
      }
      return { status: 0 } as any
    })

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await reset({ docker: true })
      expect(spawnSync).not.toHaveBeenCalledWith(
        'docker',
        ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'],
        expect.any(Object)
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      mockExit.mockRestore()
    }
  })

  it('does not run docker compose down when docker daemon is not running', async () => {
    // Mock docker info to fail
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'docker' && args && args[0] === 'info') {
        return { status: 1 } as any
      }
      return { status: 0 } as any
    })

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await reset({ docker: true })
      expect(spawnSync).not.toHaveBeenCalledWith(
        'docker',
        ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'],
        expect.any(Object)
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      mockExit.mockRestore()
    }
  })

  it('runs db reset using npm script when apps/api has package.json', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('apps') && path.includes('package.json')) {
        return true
      }
      return false
    })

    await reset({ db: true })
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'db:reset:local'],
      expect.objectContaining({
        cwd: expect.stringMatching(/apps[/\\]api/),
      })
    )
  })

  it('runs both docker and db when --all is passed', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('apps') && path.includes('package.json')) {
        return true
      }
      return false
    })

    await reset({ all: true })
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker/docker-compose.yml', 'down', '-v'],
      expect.any(Object)
    )
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'db:reset:local'],
      expect.any(Object)
    )
  })
})
