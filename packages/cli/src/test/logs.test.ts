// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logs } from '../commands/logs.js'
import { spawnSync } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
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

describe('logs command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(spawnSync).mockImplementation(() => ({ status: 0 } as any))
  })

  it('runs docker compose logs -f for valid service', async () => {
    await logs({ service: 'mailpit' })
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker/docker-compose.yml', 'logs', '-f', 'mailpit'],
      expect.any(Object)
    )
  })

  it('handles db and sqlite inputs as sqlite-web service', async () => {
    await logs({ service: 'sqlite' })
    expect(spawnSync).toHaveBeenCalledWith(
      'docker',
      ['compose', '-f', 'docker/docker-compose.yml', 'logs', '-f', 'sqlite-web'],
      expect.any(Object)
    )
  })

  it('fails and exits when an invalid service is passed', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      await logs({ service: 'invalid' })
      expect(spawnSync).not.toHaveBeenCalled()
      expect(mockExit).toHaveBeenCalledWith(1)
    } finally {
      mockExit.mockRestore()
    }
  })
})
