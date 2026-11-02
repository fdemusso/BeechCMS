// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from '@/lib/rpc'
import type { DashboardLayout } from '@beechcms/core'

/** `If-Match` with the loaded version, or `If-None-Match: *` when nothing was stored. */
function layoutPrecondition(updatedAt: number | null): Record<string, string> {
  return updatedAt === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${updatedAt}"` }
}

// Response shapes are inferred from the routes; there is no hand-written DTO to keep in step.
export const dashboardBuilderApi = {
  /** The caller's projected layout and its `updatedAt` version, or `{ layout: null, updatedAt: null }`. Layout editors keep every tab. */
  getLayout: async () => {
    const response = await rpc.api['dashboard-layout'].$get()
    return response.json()
  },
  /** Every role as `{ id, name, icon }`, ordered by name. Needs `manage_roles@*`. */
  getRoles: async () => {
    const response = await rpc.api['dashboard-layout'].roles.$get()
    return response.json()
  },
  /** Needs `manage_layout@*` or `manage_roles@*`; `updatedAt` is the version loaded with the layout. */
  saveLayout: async (layout: DashboardLayout, updatedAt: number | null) => {
    const response = await rpc.api['dashboard-layout'].$put({ json: layout }, { headers: layoutPrecondition(updatedAt) })
    return response.json()
  },
  /** Removes the stored layout. Needs `manage_roles@*`; `updatedAt` is the version loaded with the layout. */
  resetLayout: async (updatedAt: number | null): Promise<void> => {
    await rpc.api['dashboard-layout'].$delete(undefined, { headers: layoutPrecondition(updatedAt) })
  },
}
