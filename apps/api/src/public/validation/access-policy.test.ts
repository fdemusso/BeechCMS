// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { defineSeed } from '@beechcms/core'
import { checkPublicOperation, type PublicOperation } from './access-policy'

const closedSeed = defineSeed({
  slug: 'catalog',
  label: 'Catalog',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
})

describe('checkPublicOperation', () => {
  it('a refused operation names the seed flag that opens it', () => {
    const cases: Array<[PublicOperation, string]> = [
      ['read', 'allowPublicRead'],
      ['add', 'allowPublicPost'],
      ['edit', 'allowPublicEdit'],
    ]

    const details = cases.map(([operation]) => {
      const result = checkPublicOperation(closedSeed, operation)
      return result.ok ? null : result.error.message
    })

    // The flag name is a config identifier the integrator must set, so the 403 detail carries it.
    cases.forEach(([, flag], index) => expect(details[index]).toContain(flag))
  })

  it('a refused anonymous add points at the secret key as the server-side alternative', () => {
    const result = checkPublicOperation(closedSeed, 'add')

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.error.message).toContain('secret key')
  })
})
