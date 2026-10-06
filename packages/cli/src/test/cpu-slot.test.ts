// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadCpuSlot } from '../lib/cpu-slot.js'

describe('loadCpuSlot', () => {
  it('loads the repo slot module with the members the CLI relies on', async () => {
    const repoRoot = resolve(__dirname, '../../../..')

    const cpuSlot = await loadCpuSlot(repoRoot)

    expect(cpuSlot).toMatchObject({ HELD_ENV: 'BEECH_CPU_SLOT_HELD', EXIT_SLOT_TIMEOUT: 75 })
    expect(typeof cpuSlot?.acquireCpuSlot).toBe('function')
    expect(typeof cpuSlot?.releaseOnExit).toBe('function')
  })

  it('returns null outside the monorepo, where no slot module exists', async () => {
    const outsideRepo = resolve(__dirname, '../../../../..')

    const cpuSlot = await loadCpuSlot(outsideRepo)

    expect(cpuSlot).toBeNull()
  })
})
