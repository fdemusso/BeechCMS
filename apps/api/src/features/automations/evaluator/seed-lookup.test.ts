// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { Automation } from '@beechcms/core'
import { collectSeedScopedKeys, seedLookupCacheKey } from './seed-lookup'

function makeAutomation(overrides: Partial<Automation>): Automation {
  return {
    id: 'auto-1',
    seed_slug: 'orders',
    name: 'test',
    enabled: true,
    triggers: [{ event: 'create' }],
    trigger_conditions: null,
    actions: [],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe('collectSeedScopedKeys', () => {
  it('collects seed-scoped keys from when refs and action templates, once each', () => {
    const automation = makeAutomation({
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [
          { kind: 'predicate', left: { kind: 'ref', key: 'customers:byid(c1):credit' }, op: 'gt', right: { kind: 'literal', value: 1 } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'isnotempty' },
        ],
      },
      actions: [
        { type: 'send_mail', to: 'a@example.com', subject_template: 's', body_template: 'Hi {{customers:byid(c1):name}} {{customers:all:count}}' },
        { type: 'webhook', url: 'https://example.com', headers: { 'x-tier': '{{customers:where(tier=gold):name}}' } },
      ],
    })

    const keys = collectSeedScopedKeys(automation).map((k) => seedLookupCacheKey(k.scope, k.selector))

    expect(keys.sort()).toEqual(['customers:all', 'customers:byid(c1)', 'customers:where(tier=gold)'])
  })

  it('ignores this, batch, plain and var_access keys', () => {
    const automation = makeAutomation({
      actions: [{ type: 'edit_field', field: 'f', value: '{{this:name}} {{batch:count}} {{title}} {{vars.firstone.x}} {{ghost:}}' }],
    })

    expect(collectSeedScopedKeys(automation)).toEqual([])
  })
})
