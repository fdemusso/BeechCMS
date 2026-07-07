// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { dev } from '../commands/dev.js'
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

describe('dev command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs scripts/dev.mjs when it exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    await dev({})
    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      [expect.stringContaining('scripts/dev.mjs')],
      expect.objectContaining({
        env: expect.any(Object),
      })
    )
  })

  it('sets BEECH_DEV_PLAIN when plain option is true', async () => {
    vi.mocked(existsSync).mockReturnValue(true)

    await dev({ plain: true })
    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      [expect.stringContaining('scripts/dev.mjs')],
      expect.objectContaining({
        env: expect.objectContaining({
          BEECH_DEV_PLAIN: '1',
        }),
      })
    )
  })

  it('fails and exits when scripts/dev.mjs does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      await dev({})
      expect(spawnSync).not.toHaveBeenCalled()
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      mockExit.mockRestore()
    }
  })
})
