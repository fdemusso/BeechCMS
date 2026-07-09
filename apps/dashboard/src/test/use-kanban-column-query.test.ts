// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Branch, KanbanCardConfig, Seed } from '@beechcms/core'

// Mock react-query to return controlled data synchronously
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useInfiniteQuery: vi.fn(),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  }
})

vi.mock('@/lib/content-api', () => ({
  fetchKanbanColumn: vi.fn(),
}))

const buildModelMock = vi.fn((item: any, _axis: any, _col: any, _seed?: any, _cfg?: any) => ({
  entryId: item.id,
  title: item.data?.title ?? item.id,
  axisValue: null,
  position: null,
}))

vi.mock('@/features/content-kanban/utils/kanban-card-display', () => ({
  buildKanbanCardDisplayModel: (...args: any) => (buildModelMock as any)(...args),
}))

import { useInfiniteQuery } from '@tanstack/react-query'
import { useKanbanColumnQuery } from '@/features/content-kanban/hooks/use-kanban-column-query'

const axisBranch = { id: 'br_01', alias: 'status', type: 'text', label: 'Status' } as Branch
const col = { value: 'open', label: 'Open' }
const config = { axisBranchId: 'br_01', sort: null, hiddenColumnValues: [], collapsedColumnValues: [] }
const seed = { slug: 'tasks', branches: [{ id: 'br_01', alias: 'status', type: 'text', label: 'Status' }] } as unknown as Seed
const cardConfig: KanbanCardConfig = { version: 1, header: { branchId: 'br_01' }, metadata: [] }

const mockItem = { id: 'entry-1', status: 'published', data: { title: 'Task one', status: 'open' } }

beforeEach(() => {
  buildModelMock.mockClear()
  ;(useInfiniteQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: { pages: [{ items: [mockItem], total: 1 }] },
    hasNextPage: false,
    isFetching: false,
    isLoading: false,
    fetchNextPage: vi.fn(),
  })
})

describe('useKanbanColumnQuery', () => {
  it('calls buildKanbanCardDisplayModel with seed and cardConfig when provided', () => {
    renderHook(() =>
      useKanbanColumnQuery('tasks', axisBranch, col as any, config as any, [], '', seed, cardConfig),
    )
    expect(buildModelMock).toHaveBeenCalledWith(mockItem, axisBranch, col.value, seed, cardConfig)
  })

  it('returned cards carry entryId from the model', () => {
    const { result } = renderHook(() =>
      useKanbanColumnQuery('tasks', axisBranch, col as any, config as any, [], '', seed, cardConfig),
    )
    expect(result.current.cards[0]?.entryId).toBe('entry-1')
  })

  it('without cardConfig passes undefined — legacy path', () => {
    renderHook(() =>
      useKanbanColumnQuery('tasks', axisBranch, col as any, config as any, [], '', seed, undefined),
    )
    expect(buildModelMock).toHaveBeenCalledWith(mockItem, axisBranch, col.value, seed, undefined)
    const callArgs = buildModelMock.mock.calls[0]
    expect(callArgs[4]).toBeUndefined()
  })

  it('returns empty cards when data is undefined', () => {
    ;(useInfiniteQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: undefined,
      hasNextPage: false,
      isFetching: false,
      isLoading: true,
      fetchNextPage: vi.fn(),
    })
    const { result } = renderHook(() =>
      useKanbanColumnQuery('tasks', axisBranch, col as any, config as any, [], '', seed, cardConfig),
    )
    expect(result.current.cards).toEqual([])
    expect(result.current.total).toBe(0)
    expect(result.current.isLoading).toBe(true)
  })

  it('with sort config passes sortBy/sortDir to query', () => {
    const configWithSort = { ...config, sort: { branchId: 'br_01', dir: 'ASC' } }
    renderHook(() =>
      useKanbanColumnQuery('tasks', axisBranch, col as any, configWithSort as any, [], '', seed, cardConfig),
    )
    expect(useInfiniteQuery).toHaveBeenCalled()
  })
})
