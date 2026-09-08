// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

const FIXTURE_MANIFEST = [
  { uri: 'beechcms-docs://reference/example.md', title: 'Example', description: 'An example doc', file: 'reference/example.md' },
]
const FIXTURE_CONTENT = '# Example\n\nFixture content.\n'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.endsWith('manifest.json')) return JSON.stringify(FIXTURE_MANIFEST)
    if (path.endsWith('reference/example.md')) return FIXTURE_CONTENT
    throw new Error(`unexpected readFileSync path in test: ${path}`)
  }),
}))

describe('resources', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('listResources maps the fixture manifest to MCP resource descriptors', async () => {
    const { listResources } = await import('./resources.js')
    expect(listResources()).toEqual([
      {
        uri: 'beechcms-docs://reference/example.md',
        name: 'Example',
        description: 'An example doc',
        mimeType: 'text/markdown',
      },
    ])
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
})
