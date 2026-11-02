// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { createContext, useContext, type ReactNode } from 'react'
import type {
  WidgetAggregateResponse,
  WidgetDistributionResponse,
  WidgetGrowthResponse,
  WidgetListResponse,
  WidgetTimeseriesResponse,
} from './hooks/use-widget-data.js'

/** The time window of every widget route, as the query string carries it. */
export interface WidgetWindowQuery {
  window?: string
  from?: string
  to?: string
}

/** One widget route as the typed `hc` client exposes it: `client.<route>[':seed'].$get(...)`. */
export interface WidgetRoute<Query, Response> {
  $get(args: { param: { seed: string }; query: Query }): Promise<{ json(): Promise<Response> }>
}

/**
 * Typed client contract the SDK's data hooks depend on: the `widget` subtree of the dashboard's
 * `hc` client (`rpc.api.widget`). It is declared here, structurally, so the SDK imports nothing
 * from the API; the host's `<WidgetSdkProvider client={...}>` only compiles while the server routes
 * still answer these shapes.
 */
export interface WidgetSdkClient {
  aggregate: { ':seed': WidgetRoute<{ formula: string } & WidgetWindowQuery, WidgetAggregateResponse> }
  growth: { ':seed': WidgetRoute<{ formula: string } & WidgetWindowQuery, WidgetGrowthResponse> }
  timeseries: {
    ':seed': WidgetRoute<
      { formula: string; valueColumn?: string; groupColumn: string } & WidgetWindowQuery,
      WidgetTimeseriesResponse
    >
  }
  distribution: {
    ':seed': WidgetRoute<{ column: string; limit: string } & WidgetWindowQuery, WidgetDistributionResponse>
  }
  list: {
    ':seed': WidgetRoute<
      { limit: string; offset: string; search?: string; orderBy?: string; orderDir?: string },
      WidgetListResponse
    >
  }
}

const WidgetSdkContext = createContext<WidgetSdkClient | null>(null)

export interface WidgetSdkProviderProps {
  client: WidgetSdkClient
  children: ReactNode
}

/** Mounted once by the host app, carrying its authenticated typed client. */
export function WidgetSdkProvider({ client, children }: WidgetSdkProviderProps) {
  return <WidgetSdkContext.Provider value={client}>{children}</WidgetSdkContext.Provider>
}

/** Used by SDK data hooks; throws if rendered outside a {@link WidgetSdkProvider}. */
export function useWidgetSdkClient(): WidgetSdkClient {
  const client = useContext(WidgetSdkContext)
  if (!client) {
    throw new Error('useWidgetSdkClient must be used within a <WidgetSdkProvider>.')
  }
  return client
}
