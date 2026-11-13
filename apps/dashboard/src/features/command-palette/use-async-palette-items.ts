// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useQueries, type QueryStatus } from "@tanstack/react-query"
import { useDebounce } from "@/hooks/use-debounce"
import { servesContext } from "./lib/collect-palette-items"
import type { PaletteAsyncProvider, PaletteItem, PaletteProvider, PaletteQueryContext } from "./types"

const ASYNC_DEBOUNCE_MS = 300
const ASYNC_STALE_TIME_MS = 30_000

export interface AsyncPaletteItems {
  /** One synchronous provider per async source whose rows for the CURRENT query have arrived; pass to collectPaletteItems. */
  readonly settled: readonly PaletteProvider[]
  /** true while a qualifying source has no answer yet for the current query (debounce window included). */
  readonly pending: boolean
}

interface QueryState {
  readonly data: readonly PaletteItem[] | undefined
  readonly status: QueryStatus
}

// Module-level so useQueries keeps the combined result stable between renders.
function toQueryStates(results: readonly QueryState[]): QueryState[] {
  return results.map(({ data, status }) => ({ data, status }))
}

/**
 * Runs the async providers that qualify for `context`: debounced, one cached query per provider and typed text.
 * A new keystroke moves each observer to a new key, which aborts the in-flight request.
 * A failing provider is dropped silently; the other sources and the local rows are unaffected.
 */
export function useAsyncPaletteItems(
  providers: readonly PaletteAsyncProvider[],
  context: PaletteQueryContext,
): AsyncPaletteItems {
  const { page, prefix, query } = context
  const debouncedQuery = useDebounce(query, ASYNC_DEBOUNCE_MS)

  const states = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["command-palette", provider.id, page, prefix ?? "", query],
      queryFn: ({ signal }: { signal: AbortSignal }) => provider.fetchItems(context, signal),
      enabled:
        servesContext(provider, { page, prefix }) &&
        query.length >= provider.minQueryLength &&
        debouncedQuery === query,
      retry: false,
      staleTime: ASYNC_STALE_TIME_MS,
    })),
    combine: toQueryStates,
  })

  return React.useMemo(() => {
    const settled: PaletteProvider[] = []
    let pending = false
    providers.forEach((provider, index) => {
      if (!servesContext(provider, { page, prefix }) || query.length < provider.minQueryLength) return
      const { data, status } = states[index]
      if (data) {
        settled.push({ id: provider.id, pages: provider.pages, prefix: provider.prefix, getItems: () => data })
      } else if (status === "pending") {
        pending = true
      }
    })
    return { settled, pending }
  }, [providers, states, page, prefix, query])
}
