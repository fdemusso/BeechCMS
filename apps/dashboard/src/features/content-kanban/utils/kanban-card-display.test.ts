// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { buildKanbanCardDisplayModel } from './kanban-card-display'
import type { ContentEntry } from '@/lib/dynamic-columns'
import type { Branch, Seed, KanbanCardConfig } from '@beechcms/core'

const axisBranch: Branch = { id: 'br_axis', alias: 'status_col', label: 'Status', type: 'text' }

function makeEntry(overrides: Partial<ContentEntry> = {}, extra: Record<string, unknown> = {}): ContentEntry {
  return {
    id: 'entry-1',
    schema_slug: 'articles',
    slug: 'entry-1',
    status: 'draft',
    data: {},
    created_at: null,
    updated_at: null,
    ...overrides,
    ...extra,
  } as ContentEntry
}

describe('buildKanbanCardDisplayModel — legacy heuristic path', () => {
  it('picks the first non-system string field as title and a path/URL-like field as image', () => {
    const entry = makeEntry({ data: { title: 'Hello world', cover: '/media/hello.png' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.title).toBe('Hello world')
    expect(model.imageUrl).toBe('/media/hello.png')
  })

  it('falls back to entry.id when no non-system string field exists', () => {
    const entry = makeEntry({ data: { count: 3 } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.title).toBe('entry-1')
  })

  it('carries the entry position through when it is a string', () => {
    const entry = makeEntry({ data: { title: 'T' } }, { position: 'a0' })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.position).toBe('a0')
  })

  it('defaults position to null when absent or non-string', () => {
    const entry = makeEntry({ data: { title: 'T' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.position).toBeNull()
  })
})

describe('buildKanbanCardDisplayModel — resolveImageUrl (via legacy path)', () => {
  it('trims a plain string value', () => {
    const entry = makeEntry({ data: { file: '  /media/a.png  ' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.imageUrl).toBe('/media/a.png')
  })

  it('resolves nested url/src/path from a JSON-stringified object', () => {
    const entry = makeEntry({ data: { file: JSON.stringify({ url: '/media/b.png' }) } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.imageUrl).toBe('/media/b.png')
  })

  it('resolves src from a plain object value via the slot path', () => {
    const seed: Seed = { slug: 'articles', label: 'Article', branches: [
      { id: 'br_media', alias: 'media', label: 'Media', type: 'file' },
    ] } as Seed
    const card: KanbanCardConfig = { version: 1, media: { branchId: 'br_media' }, metadata: [] }
    const entry = makeEntry({ data: { media: { src: '/media/c.png' } } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null, seed, card)
    expect(model.slots?.media?.value).toEqual({ src: '/media/c.png' })
  })

  it('returns undefined when the object has none of url/src/path', () => {
    const entry = makeEntry({ data: { blob: { foo: 'bar' } } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.imageUrl).toBeUndefined()
  })
})

describe('buildKanbanCardDisplayModel — toPlainText (via title)', () => {
  it('strips HTML tags and collapses whitespace from a string title', () => {
    const entry = makeEntry({ data: { title: '<p>Hello   <b>world</b></p>' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.title).toBe('Hello world')
  })

  // toPlainText's number/boolean/array/object branches are unreachable from
  // this entrypoint: it's a private helper called only from the legacy title
  // heuristic, which only ever selects string-typed fields — not testable
  // without exporting the helper (out of scope: no source changes to this file).
})

describe('buildKanbanCardDisplayModel — slot-resolution path', () => {
  const seed: Seed = {
    slug: 'articles',
    label: 'Article',
    branches: [
      { id: 'br_media', alias: 'cover', label: 'Cover', type: 'file' },
      { id: 'br_header', alias: 'title', label: 'Title', type: 'text' },
      { id: 'br_subtitle', alias: 'subtitle', label: 'Subtitle', type: 'text' },
      { id: 'br_meta1', alias: 'author', label: 'Author', type: 'text' },
    ],
  } as Seed

  it('resolves media/header/subtitle/metadata slots via findBranchById', () => {
    const card: KanbanCardConfig = {
      version: 1,
      media: { branchId: 'br_media' },
      header: { branchId: 'br_header' },
      subtitle: { branchId: 'br_subtitle' },
      metadata: [{ branchId: 'br_meta1' }],
    }
    const entry = makeEntry({ data: { cover: '/c.png', title: 'T', subtitle: 'S', author: 'A' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null, seed, card)
    expect(model.slots?.media?.value).toBe('/c.png')
    expect(model.slots?.header?.value).toBe('T')
    expect(model.slots?.subtitle?.value).toBe('S')
    expect(model.slots?.metadata).toEqual([{ branch: seed.branches[3], value: 'A' }])
  })

  it('yields undefined for an unresolvable branchId and filters it out of metadata', () => {
    const card: KanbanCardConfig = {
      version: 1,
      header: { branchId: 'br_missing' },
      metadata: [{ branchId: 'br_missing' }, { branchId: 'br_meta1' }],
    }
    const entry = makeEntry({ data: { author: 'A' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null, seed, card)
    expect(model.slots?.header).toBeUndefined()
    expect(model.slots?.metadata).toEqual([{ branch: seed.branches[3], value: 'A' }])
  })

  it('defaults metadata to an empty array when the card config omits it', () => {
    const card = { version: 1, header: { branchId: 'br_header' } } as KanbanCardConfig
    const entry = makeEntry({ data: { title: 'T' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null, seed, card)
    expect(model.slots?.metadata).toEqual([])
  })
})

describe('buildKanbanCardDisplayModel — statusBadge', () => {
  it('is undefined when entry.status is "published"', () => {
    const entry = makeEntry({ status: 'published', data: { title: 'T' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.statusBadge).toBeUndefined()
  })

  it('is the status string otherwise', () => {
    const entry = makeEntry({ status: 'draft', data: { title: 'T' } })
    const model = buildKanbanCardDisplayModel(entry, axisBranch, null)
    expect(model.statusBadge).toBe('draft')
  })
})
