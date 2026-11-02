// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferRequestType } from 'hono/client'
import { rpc } from '@/lib/rpc'

// Read off the routes, not restated: the API is the only place these shapes are defined.
const automations = rpc.api.automations

export type CreateAutomationDto = InferRequestType<typeof automations.$post>['json']
export type UpdateAutomationDto = InferRequestType<(typeof automations)[':id']['$put']>['json']

export const automationsApi = {
  list: async (seedSlug: string) => {
    const response = await automations.$get({ query: { seed: seedSlug } })
    return response.json()
  },

  get: async (id: string) => {
    const response = await automations[':id'].$get({ param: { id } })
    return response.json()
  },

  create: async (body: CreateAutomationDto) => {
    const response = await automations.$post({ json: body })
    return response.json()
  },

  update: async (id: string, body: UpdateAutomationDto): Promise<void> => {
    await automations[':id'].$put({ param: { id }, json: body })
  },

  toggle: async (id: string, enabled: boolean): Promise<void> => {
    await automations[':id'].toggle.$patch({ param: { id }, json: { enabled } })
  },

  remove: async (id: string): Promise<void> => {
    await automations[':id'].$delete({ param: { id } })
  },
}
