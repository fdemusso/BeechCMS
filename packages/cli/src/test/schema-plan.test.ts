// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { renderPlan, schemaPlan } from '../commands/schema-plan.js'
import type { McpPlan } from '../lib/control-plane.js'

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

const planFixture = (overrides: Partial<McpPlan> = {}): McpPlan => ({
  slug: 'posts',
  classification: 'additive',
  requiresConfirmation: false,
  applicable: true,
  blockedReasons: [],
  statements: [],
  definitionChanged: false,
  changedBranches: [],
  ftsRebuildNeeded: false,
  expectedVersion: 1,
  issues: [],
  source: 'code',
  ...overrides,
})

const printedLines = (spy: MockInstance<typeof console.log>): string[] => spy.mock.calls.map(call => String(call[0]))

describe('schema-plan', () => {
  let exitSpy: MockInstance<typeof process.exit>
  let consoleSpy: MockInstance<typeof console.log>

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
    planSpy.mockResolvedValue({ applicable: true, definitionChanged: true, changedBranches: [], statements: [], issues: [], blockedReasons: [] })

    await schemaPlan()
    expect(planSpy).toHaveBeenCalledTimes(2)
    expect(planSpy.mock.calls[0][0]).toBe('a') // a first
    expect(planSpy.mock.calls[1][0]).toBe('b')
  })

  it('sends hand-authored branches without locally minted ids so the server matches stored ids by alias', async () => {
    loadManifestSpy.mockResolvedValueOnce({
      seeds: [{ slug: 'clienti', label: 'Clienti', displayNameAlias: 'name', branches: [
        { alias: 'name', label: 'Name', type: 'text' },
        { id: 'br_c9', alias: 'tier', label: 'Tier', type: 'text' },
        { alias: 'contacts', label: 'Contacts', type: 'repeater', fields: [{ alias: 'email', label: 'Email', type: 'text' }] }
      ] }]
    })
    planSpy.mockResolvedValue({ applicable: true, definitionChanged: true, changedBranches: [], statements: [], issues: [], blockedReasons: [] })

    await schemaPlan()

    const candidate = planSpy.mock.calls[0][1]
    expect(candidate.branches.map((b: { id?: string }) => b.id)).toEqual([undefined, 'br_c9', undefined])
    expect(candidate.branches[2].fields[0].id).toBeUndefined()
  })

  it('exits with code 1 without throwing when any seed is not appliable', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValue({ applicable: false, definitionChanged: true, changedBranches: [], statements: [], issues: [], blockedReasons: ['cannot drop'] })
    
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

  it('renderPlan prints no change and no statement for an applicable plan whose definition is unchanged', () => {
    const plan = planFixture({ statements: ['CREATE INDEX IF NOT EXISTS idx_posts_created ON content_posts(created_at)'] })

    renderPlan(plan)

    // The printed output is the subject here, not a mock's bookkeeping.
    const lines = printedLines(consoleSpy)
    expect(lines.some(line => line.includes('(no change)'))).toBe(true)
    expect(lines.some(line => line.includes('CREATE INDEX'))).toBe(false)
  })

  it('renderPlan prints one definition-changed line per changed branch alias', () => {
    const plan = planFixture({ definitionChanged: true, changedBranches: ['priority'] })

    renderPlan(plan)

    const lines = printedLines(consoleSpy)
    expect(lines.some(line => line.includes('~ priority — definition changed'))).toBe(true)
  })

  it('schemaPlan reports nothing to apply and does not exit for a seed with an unchanged definition', async () => {
    loadManifestSpy.mockResolvedValueOnce({ seeds: [{ slug: 'a', label: 'a', displayNameAlias: 'a', branches: [] }] })
    planSpy.mockResolvedValueOnce(planFixture({ slug: 'a', statements: ['CREATE INDEX IF NOT EXISTS idx_a ON content_a(created_at)'] }))

    await schemaPlan()

    expect(printedLines(consoleSpy).some(line => line.includes('Nothing to apply'))).toBe(true)
    expect(exitSpy).not.toHaveBeenCalled()
  })
})
