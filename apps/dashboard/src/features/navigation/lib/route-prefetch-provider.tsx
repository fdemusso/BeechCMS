// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ReactNode } from "react"
import { RoutePrefetchContext, type Prefetch } from "./route-prefetch"

/**
 * Lets the composition root hand navigation a way to warm a route (its code and first requests) without this slice
 * knowing which pages or data exist.
 */
export function RoutePrefetchProvider({ prefetch, children }: { readonly prefetch: Prefetch; readonly children: ReactNode }) {
  return <RoutePrefetchContext.Provider value={prefetch}>{children}</RoutePrefetchContext.Provider>
}
