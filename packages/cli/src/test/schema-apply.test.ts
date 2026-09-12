// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { schemaApply } from '../commands/schema-apply.js'

const { loadManifestSpy, planSpy, applySpy, confirmSpy } = vi.hoisted(() => ({
  loadManifestSpy: vi.fn(),
  planSpy: vi.fn(),
  applySpy: vi.fn(),
  confirmSpy: vi.fn()
}))

vi.mock('../lib/manifest-loader.js', () => ({
  loadManifest: loadManifestSpy,
  DEFAULT_MANIFEST_PATH: 'beech.schema.ts'
}))

vi.mock('../lib/control-plane.js', () => ({
  createControlPlane: () => ({
    baseUrl: 'http://localhost:8789',
    plan: planSpy,
    apply: applySpy
  })
}))

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clack/prompts')>()
  return { ...actual, confirm: confirmSpy, isCancel: (v: any) => v === Symbol.for('cancel') }
})

describe('schema-apply', () => {
  let exitSpy: any
  let consoleSpy: any
  let originalIsTTY: boolean

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    originalIsTTY = process.stdout.isTTY
    process.stdout.isTTY = true
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    process.stdout.isTTY = originalIsTTY
  })

  it('re-plans each seed immediately before writing it so the OCC version is current', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }, { slug: 'b', label: 'b', displayNameAlias: 'b', branches: [] }] })
    
    // First phase: preview plan
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 1, statements: ['CREATE'], issues: [], blockedReasons: [] })
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 1, statements: ['CREATE'], issues: [], blockedReasons: [] })
    
    confirmSpy.mockResolvedValueOnce(true)
    
    // Second phase: fresh plan before apply
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 2, statements: ['CREATE'], issues: [], blockedReasons: [] })
    applySpy.mockResolvedValueOnce({ newVersion: 3 })
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 4, statements: ['CREATE'], issues: [], blockedReasons: [] })
    applySpy.mockResolvedValueOnce({ newVersion: 5 })

    await schemaApply()
    expect(planSpy).toHaveBeenCalledTimes(4)
    expect(applySpy).toHaveBeenCalledTimes(2)
    
    // Received the fresh expectedVersion 2 and 4
    expect(applySpy.mock.calls[0][0].expectedVersion).toBe(2)
    expect(applySpy.mock.calls[1][0].expectedVersion).toBe(4)
  })

  it('writes nothing when any seed in the run is unappliable', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValueOnce({ applicable: false, expectedVersion: 1, statements: [], issues: [], blockedReasons: ['cannot drop'] })
    
    await schemaApply()
    expect(applySpy).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1) // from exitWithError
  })

  it('aborts the seed whose statements changed between review and apply', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    // Preview
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 1, statements: ['CREATE TABLE a'], issues: [], blockedReasons: [] })
    confirmSpy.mockResolvedValueOnce(true)
    // Re-plan changed
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 2, statements: ['CREATE TABLE a_changed'], issues: [], blockedReasons: [] })

    await schemaApply()
    expect(applySpy).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('skips the prompt and applies when yes is set', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValue({ applicable: true, expectedVersion: 1, statements: ['CREATE'], issues: [], blockedReasons: [] })
    applySpy.mockResolvedValue({ newVersion: 2 })

    await schemaApply({ yes: true })
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(applySpy).toHaveBeenCalledTimes(1)
  })

  it('refuses to apply without confirmation in a non-interactive shell', async () => {
    process.stdout.isTTY = false
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValueOnce({ applicable: true, expectedVersion: 1, statements: ['CREATE'], issues: [], blockedReasons: [] })
    
    await schemaApply()
    expect(applySpy).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('passes one plan id to every apply in the run so the audit trail ties them together', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }, { slug: 'b', label: 'b', displayNameAlias: 'b', branches: [] }] })
    planSpy.mockResolvedValue({ applicable: true, expectedVersion: 1, statements: ['CREATE'], issues: [], blockedReasons: [] })
    confirmSpy.mockResolvedValueOnce(true)
    applySpy.mockResolvedValue({ newVersion: 2 })

    await schemaApply()
    expect(applySpy).toHaveBeenCalledTimes(2)
    const planId1 = applySpy.mock.calls[0][0].planId
    const planId2 = applySpy.mock.calls[1][0].planId
    expect(typeof planId1).toBe('string')
    expect(planId1).toBe(planId2)
  })
})
