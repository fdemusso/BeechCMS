// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { draftBodySchema } from './draft.schema'

describe('draftBodySchema', () => {
  it.each([[null], [[]], [5], [{}], [{ title: 'a', updated_at: 1 }]])(
    'accepts %j, because the handler reads anything that is not an object as an empty draft',
    (body) => {
      const result = draftBodySchema.safeParse(body)

      expect(result.success).toBe(true)
    },
  )
})
