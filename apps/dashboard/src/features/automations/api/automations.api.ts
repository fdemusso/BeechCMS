// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from '@/lib/api'
import type { Automation, WhenNode } from '@beechcms/core'

// Local DTO types — mirror of API schema. Do not import API code directly.
export interface CreateAutomationDto {
  seed_slug: string
  name: string
  triggers: Array<{ event: 'create' | 'update' | 'delete' | 'cron'; cron?: string | null }>
  trigger_conditions?: WhenNode | Array<{ field: string; op: string; value: unknown }> | null
  actions: Array<unknown>
}

export type UpdateAutomationDto = Partial<Omit<CreateAutomationDto, 'seed_slug'>>

const BASE = '/automations'

export const automationsApi = {
  list: (seedSlug: string) =>
    api.get<Automation[]>(BASE, { params: { seed: seedSlug } }).then((r) => r.data),

  get: (id: string) =>
    api.get<Automation>(`${BASE}/${id}`).then((r) => r.data),

  create: (body: CreateAutomationDto) =>
    api.post<{ id: string }>(BASE, body).then((r) => r.data),

  update: (id: string, body: UpdateAutomationDto) =>
    api.put<void>(`${BASE}/${id}`, body),

  toggle: (id: string, enabled: boolean) =>
    api.patch<void>(`${BASE}/${id}/toggle`, { enabled }),

  remove: (id: string) =>
    api.delete<void>(`${BASE}/${id}`),
}
