// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from '@/lib/rpc'
import type { DashboardLayout } from '@beechcms/core'

// Response shapes are inferred from the routes; there is no hand-written DTO to keep in step.
export const dashboardBuilderApi = {
  /** Raw stored layout for `scope`, or `{ scope, layout: null }` if nothing is stored. Admin-only. */
  getLayout: async (scope: string) => {
    const response = await rpc.api['dashboard-layout'][':scope'].$get({ param: { scope } })
    return response.json()
  },
  /** Closed set of dashboard scopes annotated with whether each has a stored row. Admin-only. */
  getScopes: async () => {
    const response = await rpc.api['dashboard-layout'].scopes.$get()
    return response.json()
  },
  saveLayout: async (scope: string, layout: DashboardLayout) => {
    const response = await rpc.api['dashboard-layout'][':scope'].$put({ param: { scope }, json: layout })
    return response.json()
  },
  resetLayout: async (scope: string): Promise<void> => {
    await rpc.api['dashboard-layout'][':scope'].$delete({ param: { scope } })
  },
}
