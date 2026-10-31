// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from '@/lib/rpc'
import type { DashboardLayout } from '@beechcms/core'

// Response shapes are inferred from the routes; there is no hand-written DTO to keep in step.
export const dashboardBuilderApi = {
  /** The caller's filtered view of the stored layout, or `{ layout: null }`. For `manage_roles@*` it keeps every tab. */
  getLayout: async () => {
    const response = await rpc.api['dashboard-layout'].$get()
    return response.json()
  },
  /** Needs `manage_roles@*`. */
  saveLayout: async (layout: DashboardLayout) => {
    const response = await rpc.api['dashboard-layout'].$put({ json: layout })
    return response.json()
  },
  /** Removes the stored layout. Needs `manage_roles@*`. */
  resetLayout: async (): Promise<void> => {
    await rpc.api['dashboard-layout'].$delete()
  },
}
