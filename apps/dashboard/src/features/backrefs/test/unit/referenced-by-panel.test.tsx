// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BackrefsResponse } from '@/features/backrefs/api'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'backrefs.title': 'Referenced by',
        'backrefs.summary_one': '1 entry references this',
        'backrefs.summary_other': `${params?.count} entries reference this`,
        'backrefs.showAll': `Show all ${params?.count}`,
        'backrefs.empty': 'No references',
        'backrefs.deleteBlocked': `Cannot delete: ${params?.count} entries depend on this record`,
      }
      return map[key] ?? key
    },
    i18n: { language: 'en' },
  }),
}))

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 days ago',
}))

vi.mock('date-fns/locale', () => ({
  enUS: {},
  it: {},
}))

const mockFetchBackrefs = vi.fn()
const mockFetchBackrefsGroup = vi.fn()

vi.mock('@/features/backrefs/hooks/use-backrefs', () => ({
  useBackrefs: (slug: string, id: string) => ({
    data: mockFetchBackrefs(slug, id),
    isLoading: false,
  }),
  useBackrefsGroup: (
    tSlug: string,
    tId: string,
    sSlug: string,
    bAlias: string,
    page: number,
  ) => ({
    data: mockFetchBackrefsGroup(tSlug, tId, sSlug, bAlias, page),
    isLoading: false,
  }),
  BACKREF_QUERY_KEY: 'backrefs',
}))

import { ReferencedByPanel } from '@/features/backrefs/referenced-by-panel'

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

function buildQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPanel(props: {
  targetSlug?: string
  targetId?: string
  onRestrictsChange?: (v: boolean) => void
}) {
  const qc = buildQC()
  return render(
    <QueryClientProvider client={qc}>
      <ReferencedByPanel
        targetSlug={props.targetSlug ?? 'team'}
        targetId={props.targetId ?? 'ada-1'}
        onRestrictsChange={props.onRestrictsChange}
      />
    </QueryClientProvider>,
  )
}

const emptyResponse: BackrefsResponse = { groups: [] }

const singleGroupResponse: BackrefsResponse = {
  groups: [{
    sourceSlug: 'articles',
    sourceLabel: 'Articles',
    branchAlias: 'author_id',
    branchLabel: 'Author',
    relationship: 'single',
    restricts: false,
    total: 5,
    items: [
      { id: 'art-1', displayName: 'First Article', status: 'published', updated_at: 1000 },
      { id: 'art-2', displayName: 'Second Article', status: 'draft', updated_at: 900 },
      { id: 'art-3', displayName: 'Third Article', status: 'published', updated_at: 800 },
    ],
  }],
}

const restrictsGroupResponse: BackrefsResponse = {
  groups: [{
    sourceSlug: 'articles',
    sourceLabel: 'Articles',
    branchAlias: 'author_id',
    branchLabel: 'Author',
    relationship: 'single',
    restricts: true,
    total: 2,
    items: [
      { id: 'art-1', displayName: 'Article One', status: 'published', updated_at: 1000 },
    ],
  }],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReferencedByPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when API returns empty groups', () => {
    mockFetchBackrefs.mockReturnValue(emptyResponse)
    const { container } = renderPanel({})
    expect(container.firstChild).toBeNull()
  })

  it('shows "Referenced by" header when groups exist', async () => {
    mockFetchBackrefs.mockReturnValue(singleGroupResponse)
    renderPanel({})
    expect(screen.getByText('Referenced by')).toBeDefined()
  })

  it('counter matches sum of totals', async () => {
    mockFetchBackrefs.mockReturnValue(singleGroupResponse)
    renderPanel({})
    // total is 5
    expect(screen.getByText('5 entries reference this')).toBeDefined()
  })

  it('"Show all N" button appears when total > preview items', async () => {
    mockFetchBackrefs.mockReturnValue(singleGroupResponse)
    renderPanel({})

    // Open collapsible first
    const trigger = screen.getByText('Referenced by')
    fireEvent.click(trigger)

    await waitFor(() => {
      // total=5, items=3, so "Show all 5" should appear
      expect(screen.getByText('Show all 5')).toBeDefined()
    })
  })

  it('calls onRestrictsChange(true) when any group has restricts=true', async () => {
    mockFetchBackrefs.mockReturnValue(restrictsGroupResponse)
    const onRestrictsChange = vi.fn()
    renderPanel({ onRestrictsChange })

    await waitFor(() => {
      expect(onRestrictsChange).toHaveBeenCalledWith(true)
    })
  })

  it('calls onRestrictsChange(false) when no group has restricts=true', async () => {
    mockFetchBackrefs.mockReturnValue(singleGroupResponse)
    const onRestrictsChange = vi.fn()
    renderPanel({ onRestrictsChange })

    await waitFor(() => {
      expect(onRestrictsChange).toHaveBeenCalledWith(false)
    })
  })

  it('opens dialog on "Show all" click', async () => {
    const paginatedResponse: BackrefsResponse = {
      groups: [{
        ...singleGroupResponse.groups[0],
        total: 5,
      }],
    }
    mockFetchBackrefs.mockReturnValue(singleGroupResponse)
    mockFetchBackrefsGroup.mockReturnValue(paginatedResponse)

    renderPanel({})

    // Open collapsible
    const trigger = screen.getByText('Referenced by')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Show all 5')).toBeDefined()
    })

    fireEvent.click(screen.getByText('Show all 5'))

    await waitFor(() => {
      // Dialog title should show the group label
      expect(screen.getByRole('dialog')).toBeDefined()
    })
  })
})

// ---------------------------------------------------------------------------
// Core helper: buildBackrefMap
// ---------------------------------------------------------------------------

describe('buildBackrefMap', () => {
  it('maps targetSlug → sources', async () => {
    const { buildBackrefMap } = await import('@beechcms/core')
    const seeds = [
      {
        slug: 'articles',
        label: 'Article',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' as const },
          { alias: 'author_id', label: 'Author', type: 'relation' as const, targetSeed: 'team' },
        ],
      },
    ]
    const map = buildBackrefMap(seeds as any)
    const sources = map.get('team')
    expect(sources).toHaveLength(1)
    expect(sources![0].sourceSlug).toBe('articles')
    expect(sources![0].branchAlias).toBe('author_id')
    expect(sources![0].relationship).toBe('single')
    expect(sources![0].restricts).toBe(false)
  })

  it('marks restricts=true for RESTRICT branches', async () => {
    const { buildBackrefMap } = await import('@beechcms/core')
    const seeds = [
      {
        slug: 'orders',
        label: 'Order',
        displayNameAlias: 'ref',
        branches: [
          { alias: 'ref', label: 'Ref', type: 'text' as const },
          {
            alias: 'customer_id',
            label: 'Customer',
            type: 'relation' as const,
            targetSeed: 'customers',
            onDelete: 'RESTRICT' as const,
          },
        ],
      },
    ]
    const map = buildBackrefMap(seeds as any)
    expect(map.get('customers')![0].restricts).toBe(true)
  })

  it('marks multi relation correctly', async () => {
    const { buildBackrefMap } = await import('@beechcms/core')
    const seeds = [
      {
        slug: 'articles',
        label: 'Article',
        displayNameAlias: 'title',
        branches: [
          { alias: 'title', label: 'Title', type: 'text' as const },
          {
            alias: 'tags',
            label: 'Tags',
            type: 'relation' as const,
            targetSeed: 'tags',
            multiple: true,
          },
        ],
      },
    ]
    const map = buildBackrefMap(seeds as any)
    expect(map.get('tags')![0].relationship).toBe('multi')
  })
})
