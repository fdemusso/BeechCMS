// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { savePlan, takePlan, PLAN_TTL_MS } from './plans.js'

const BASE_PLAN = {
  slug: 'products',
  candidate: { slug: 'products', label: 'Product', branches: [] },
  expectedVersion: 1,
  classification: 'create' as const,
  statements: ['CREATE TABLE content_products (id TEXT PRIMARY KEY)'],
  ftsRebuildNeeded: false,
}

describe('plans', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores a plan and returns it once via takePlan', () => {
    const stored = savePlan(BASE_PLAN)
    const result = takePlan(stored.planId)
    expect(result).toEqual({ status: 'ok', plan: stored })
  })

  it('is single-use: a second takePlan on the same id fails', () => {
    const stored = savePlan(BASE_PLAN)
    takePlan(stored.planId)
    const second = takePlan(stored.planId)
    expect(second).toEqual({ status: 'not_found' })
  })

  it('returns not_found for an unknown planId', () => {
    expect(takePlan('does-not-exist')).toEqual({ status: 'not_found' })
  })

  it('expires a plan after the 10-minute TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const stored = savePlan(BASE_PLAN)
    vi.setSystemTime(PLAN_TTL_MS + 1)
    const result = takePlan(stored.planId)
    expect(result).toEqual({ status: 'expired' })
  })

  it('a second takePlan on an expired id also reports not_found (already deleted)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const stored = savePlan(BASE_PLAN)
    vi.setSystemTime(PLAN_TTL_MS + 1)
    takePlan(stored.planId)
    expect(takePlan(stored.planId)).toEqual({ status: 'not_found' })
  })
})
