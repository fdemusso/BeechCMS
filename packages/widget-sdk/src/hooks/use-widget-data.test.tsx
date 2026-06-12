// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { WidgetSdkProvider, type WidgetSdkClient } from '../provider.js'
import { useWidgetAggregate, useWidgetList } from './use-widget-data.js'

function wrapperWith(client: WidgetSdkClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WidgetSdkProvider client={client}>{children}</WidgetSdkProvider>
      </QueryClientProvider>
    )
  }
}

describe('SDK data hooks', () => {
  it('fetches widget aggregate data through the injected client', async () => {
    const get = vi.fn().mockResolvedValue({ data: { value: 42, window: 'month' } })
    const client: WidgetSdkClient = { get }

    const { result } = renderHook(() => useWidgetAggregate('articoli', { op: 'count' }, 'month'), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ value: 42, window: 'month' })
    expect(get).toHaveBeenCalledWith('/widget/aggregate/articoli', {
      params: { formula: JSON.stringify({ op: 'count' }), window: 'month' },
    })
  })

  it('fetches widget list data through the injected client', async () => {
    const get = vi.fn().mockResolvedValue({ data: { entries: [], total: 0 } })
    const client: WidgetSdkClient = { get }

    const { result } = renderHook(() => useWidgetList('articoli', { limit: 10, offset: 0 }), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(get).toHaveBeenCalledWith('/widget/list/articoli', {
      params: { limit: 10, offset: 0, search: undefined, orderBy: undefined, orderDir: undefined },
    })
  })

  it('throws when used outside a WidgetSdkProvider', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    expect(() =>
      renderHook(() => useWidgetAggregate('articoli', { op: 'count' }, 'month'), {
        wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
      }),
    ).toThrow(/WidgetSdkProvider/)
  })
})
