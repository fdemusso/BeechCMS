// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { api } from '@/lib/api'
import type { FormLayout } from '@beechcms/core'

export async function saveLayout(slug: string, layout: FormLayout): Promise<FormLayout> {
  const { data } = await api.put<{ ok: true; layout: FormLayout }>(`/schema/${slug}/layout`, layout)
  return data.layout
}

export async function resetLayout(slug: string): Promise<void> {
  await api.delete(`/schema/${slug}/layout`)
}
