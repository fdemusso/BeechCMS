// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Minimal HTTP client contract the SDK's data hooks depend on. The
 * dashboard's Axios instance satisfies this shape — no Axios import lives
 * in this package.
 */
export interface WidgetSdkClient {
  get<T>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>
}

const WidgetSdkContext = createContext<WidgetSdkClient | null>(null)

export interface WidgetSdkProviderProps {
  client: WidgetSdkClient
  children: ReactNode
}

/** Mounted once by the host app, carrying its authenticated HTTP client. */
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
