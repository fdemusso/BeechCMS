// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

const FIXTURE_MANIFEST = [
  {
    uri: 'beechcms-docs://reference/example.md',
    title: 'Example',
    description: 'An example doc',
    keywords: ['custom endpoint', 'validation rule'],
    file: 'reference/example.md',
  },
  {
    uri: 'beechcms-docs://build/business-rules.md',
    title: 'Business Rules, Hooks & Automations',
    description: 'Cross-field validation, stock counters, and automations.',
    keywords: ['stock', 'mutateField', 'hooks'],
    file: 'build/business-rules.md',
  },
]
const FIXTURE_CONTENT = '# Example\n\nFixture content.\n'
const BUSINESS_RULES_CONTENT = '# Business Rules\n\nUse hooks and mutateField for stock.\n'

vi.mock('node:fs', () => ({
  statSync: vi.fn(() => ({ mtimeMs: 1000 })),
  readFileSync: vi.fn((path: string) => {
    const normalized = path.replace(/\\/g, '/')
    if (normalized.endsWith('manifest.json')) return JSON.stringify(FIXTURE_MANIFEST)
    if (normalized.endsWith('reference/example.md')) return FIXTURE_CONTENT
    if (normalized.endsWith('build/business-rules.md')) return BUSINESS_RULES_CONTENT
    throw new Error(`unexpected readFileSync path in test: ${path}`)
  }),
}))

describe('resources', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('listResources maps the fixture manifest to MCP resource descriptors and caches manifest', async () => {
    const { listResources } = await import('./resources.js')
    expect(listResources()).toEqual([
      {
        uri: 'beechcms-docs://reference/example.md',
        name: 'Example',
        description: 'An example doc',
        mimeType: 'text/markdown',
      },
      {
        uri: 'beechcms-docs://build/business-rules.md',
        name: 'Business Rules, Hooks & Automations',
        description: 'Cross-field validation, stock counters, and automations.',
        mimeType: 'text/markdown',
      },
    ])
    // Second call to test caching branch
    expect(listResources()).toHaveLength(2)
  })

  it('searchResources matches keywords and supports partial-match fallback mode', async () => {
    const { searchResources } = await import('./resources.js')

    const exact = searchResources('custom endpoint', 5)
    expect(exact[0]?.uri).toBe('beechcms-docs://reference/example.md')

    const andMiss = searchResources('stock nonexistent_word', 5)
    expect(andMiss).toEqual([])

    const anyHit = searchResources('stock nonexistent_word', 5, { matchMode: 'any' })
    expect(anyHit[0]?.uri).toBe('beechcms-docs://build/business-rules.md')
  })

  it('readResource returns the file content for a known URI', async () => {
    const { readResource } = await import('./resources.js')
    expect(readResource('beechcms-docs://reference/example.md')).toEqual({
      uri: 'beechcms-docs://reference/example.md',
      mimeType: 'text/markdown',
      text: FIXTURE_CONTENT,
    })
  })

  it('readResource throws for an unknown URI', async () => {
    const { readResource } = await import('./resources.js')
    expect(() => readResource('beechcms-docs://does/not-exist.md')).toThrow(
      "Unknown resource URI 'beechcms-docs://does/not-exist.md'.",
    )
  })

  it('returns empty array and zero count when manifest.json does not exist (#496)', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.statSync).mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })

    const { listResources, getResourceCount } = await import('./resources.js')
    expect(listResources()).toEqual([])
    expect(getResourceCount()).toBe(0)
  })
})
