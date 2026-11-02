// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { WidgetSdkProvider, type WidgetSdkClient } from '../provider.js'
import { useWidgetAggregate, useWidgetList } from './use-widget-data.js'

/** A client whose `route` answers with `body`; the spy records the arguments of the call. */
function clientAnswering(route: keyof WidgetSdkClient, body: unknown) {
  const get = vi.fn().mockResolvedValue({ json: async () => body })
  const unused = { ':seed': { $get: vi.fn() } }
  const client = {
    aggregate: unused,
    growth: unused,
    timeseries: unused,
    distribution: unused,
    list: unused,
    [route]: { ':seed': { $get: get } },
  } as WidgetSdkClient
  return { client, get }
}

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
    const { client, get } = clientAnswering('aggregate', { value: 42, window: 'month' })

    const { result } = renderHook(() => useWidgetAggregate('articoli', { op: 'count' }, 'month'), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ value: 42, window: 'month' })
    expect(get).toHaveBeenCalledWith({
      param: { seed: 'articoli' },
      query: { formula: JSON.stringify({ op: 'count' }), window: 'month' },
    })
  })

  it('fetches widget list data through the injected client', async () => {
    const { client, get } = clientAnswering('list', { entries: [], total: 0 })

    const { result } = renderHook(() => useWidgetList('articoli', { limit: 10, offset: 0 }), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(get).toHaveBeenCalledWith({
      param: { seed: 'articoli' },
      query: { limit: '10', offset: '0', search: undefined, orderBy: undefined, orderDir: undefined },
    })
  })

  it('serialises a date range as unix-second from/to instead of a preset', async () => {
    const { client, get } = clientAnswering('aggregate', { value: 1, window: { from: 100, to: 200 } })

    const { result } = renderHook(() => useWidgetAggregate('articoli', { op: 'count' }, { from: 100, to: 200 }), {
      wrapper: wrapperWith(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(get).toHaveBeenCalledWith({
      param: { seed: 'articoli' },
      query: { formula: JSON.stringify({ op: 'count' }), from: '100', to: '200' },
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
