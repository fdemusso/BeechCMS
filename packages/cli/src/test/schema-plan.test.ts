// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { schemaPlan } from '../commands/schema-plan.js'

const { loadManifestSpy, planSpy } = vi.hoisted(() => ({
  loadManifestSpy: vi.fn(),
  planSpy: vi.fn()
}))

vi.mock('../lib/manifest-loader.js', () => ({
  loadManifest: loadManifestSpy,
  DEFAULT_MANIFEST_PATH: 'beech.schema.ts'
}))

vi.mock('../lib/control-plane.js', () => ({
  createControlPlane: () => ({
    baseUrl: 'http://localhost:8789',
    plan: planSpy
  })
}))

describe('schema-plan', () => {
  let exitSpy: any
  let consoleSpy: any

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('plans every seed in dependency order and exits 0 when all are applicable', async () => {
    loadManifestSpy.mockResolvedValueOnce({
      seeds: [
        { slug: 'b', label: 'b', displayNameAlias: 'b', branches: [{ type: 'relation', alias: 'r', targetSeed: 'a' }] },
        { slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }
      ]
    })
    planSpy.mockResolvedValue({ applicable: true, statements: [], issues: [], blockedReasons: [] })

    await schemaPlan()
    expect(planSpy).toHaveBeenCalledTimes(2)
    expect(planSpy.mock.calls[0][0]).toBe('a') // a first
    expect(planSpy.mock.calls[1][0]).toBe('b')
  })

  it('exits with code 1 without throwing when any seed is not appliable', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValue({ applicable: false, statements: [], issues: [], blockedReasons: ['cannot drop'] })
    
    await schemaPlan()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with code 1 if the manifest contains a relation cycle', async () => {
    loadManifestSpy.mockResolvedValueOnce({
      seeds: [
        { slug: 'c1', label: 'c1', displayNameAlias: 'c1', branches: [{ type: 'relation', alias: 'r', targetSeed: 'c2' }] },
        { slug: 'c2', label: 'c2', displayNameAlias: 'c2', branches: [{ type: 'relation', alias: 'r', targetSeed: 'c1' }] }
      ]
    })
    
    // We expect it to throw a CliError which is caught and turns into an exit 1 via exitWithError
    await schemaPlan()
    expect(planSpy).not.toHaveBeenCalled() // Proven by what did not happen (Rule 5.6)
    expect(exitSpy).toHaveBeenCalledWith(1) // exitWithError calls process.exit(1)
  })
})
