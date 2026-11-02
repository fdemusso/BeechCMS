// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { rpc } from '@/lib/rpc'
import type { FormLayout } from '@beechcms/core'

export async function saveLayout(slug: string, layout: FormLayout): Promise<FormLayout> {
  const response = await rpc.api.schema[':slug'].layout.$put({ param: { slug }, json: layout })
  const { layout: saved } = await response.json()
  return saved
}

export async function resetLayout(slug: string): Promise<void> {
  await rpc.api.schema[':slug'].layout.$delete({ param: { slug } })
}
