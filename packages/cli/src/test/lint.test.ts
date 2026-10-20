// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lint } from '../commands/lint.js'
import { spawnSync } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

vi.mock('picocolors', () => ({
  default: {
    cyan: (s: string) => s,
  },
}))

describe('lint command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs the test-placement checker before turbo lint, in that order', async () => {
    await lint()

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'node',
      ['scripts/check-test-placement.mjs'],
      expect.objectContaining({ stdio: 'inherit' })
    )
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'turbo',
      ['run', 'lint'],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    )
  })

  it('short-circuits with the checker exit code and never runs turbo lint when placement fails', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as any)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(lint()).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(spawnSync).toHaveBeenCalledTimes(1)
    } finally {
      mockExit.mockRestore()
    }
  })

  it('exits with turbo lint exit code when placement passes but lint fails', async () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as any)
      .mockReturnValueOnce({ status: 2 } as any)
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    try {
      await expect(lint()).rejects.toThrow('process.exit called')

      expect(mockExit).toHaveBeenCalledWith(2)
      expect(spawnSync).toHaveBeenCalledTimes(2)
    } finally {
      mockExit.mockRestore()
    }
  })
})
