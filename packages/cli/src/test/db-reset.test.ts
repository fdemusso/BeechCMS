// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dbReset } from '../commands/db-reset.js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'

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

describe('db:reset command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs db:reset:local in apps/api when package.json exists there', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.includes('apps') && path.includes('package.json')) {
        return true
      }
      return false
    })

    await dbReset({})
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'db:reset:local'],
      expect.objectContaining({
        cwd: expect.stringMatching(/apps[/\\]api/),
      })
    )
  })

  it('runs db:reset:local in root package.json if it exists and has the script', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string' && path.endsWith('package.json') && !path.includes('apps')) {
        return true
      }
      return false
    })
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      scripts: { 'db:reset:local': 'something' }
    }))

    await dbReset({})
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'db:reset:local'],
      expect.objectContaining({
        cwd: expect.any(String),
      })
    )
  })

  it('removes .wrangler/state and runs scripts/bootstrap-d1.mjs if wrangler state and bootstrap exist', async () => {
    vi.mocked(existsSync).mockImplementation((path: any) => {
      if (typeof path === 'string') {
        if (path.includes('apps/api') || path.includes('apps\\api')) {
          return false
        }
        if (path.includes('.wrangler/state') || path.includes('bootstrap-d1.mjs') || path.endsWith('package.json')) {
          return true
        }
      }
      return false
    })
    vi.mocked(readFileSync).mockReturnValue('{}')

    await dbReset({})
    expect(rmSync).toHaveBeenCalledWith(
      expect.stringContaining('.wrangler/state'),
      expect.any(Object)
    )
    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      ['scripts/bootstrap-d1.mjs'],
      expect.any(Object)
    )
  })
})
