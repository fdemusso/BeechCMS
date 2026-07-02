// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dbMigrate } from '../commands/db-migrate.js'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
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

describe('db:migrate command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs db:migrate:local when package.json exists in apps/api', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('apps') && path.includes('package.json')) {
        return true
      }
      return false
    })

    await dbMigrate({})
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'db:migrate:local'],
      expect.objectContaining({
        cwd: expect.stringMatching(/apps[/\\]api/),
      })
    )
  })

  it('runs scripts/bootstrap-d1.mjs when apps/api package.json is missing but bootstrap script exists', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('bootstrap-d1.mjs')) {
        return true
      }
      return false
    })

    await dbMigrate({})
    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      ['scripts/bootstrap-d1.mjs'],
      expect.objectContaining({
        cwd: expect.any(String),
      })
    )
  })

  it('warns when neither script is found', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    try {
      await dbMigrate({})
      expect(spawnSync).not.toHaveBeenCalled()
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      mockExit.mockRestore()
    }
  })
})
