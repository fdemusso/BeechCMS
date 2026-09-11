// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload, SystemIdGenerator } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import { DEMO_FIXTURES_BY_SEED_SLUG } from '../src/shared/db/fixtures/demo-data.fixtures'
import { DEMO_SEED_DEFINITIONS } from '../src/shared/db/fixtures/demo-seeds'

const seedsMap: Record<string, Seed> = Object.fromEntries(DEMO_SEED_DEFINITIONS.map((seed) => [seed.slug, seed]))

describe('Demo Fixtures vs Seed Validation Engine', () => {
  it('validates every demo fixture in DEMO_FIXTURES_BY_SEED_SLUG without validation errors', () => {
    for (const [slug, fixtures] of Object.entries(DEMO_FIXTURES_BY_SEED_SLUG)) {
      const seed = seedsMap[slug]
      expect(seed).toBeDefined()

      for (const entry of fixtures) {
        const res = validateAndSanitizeSeedPayload(seed, entry.data, {
          operation: 'create',
          allowNull: true,
          requireAtLeastOneValidField: true,
          enforceRequiredFields: true,
          idGenerator: SystemIdGenerator,
        })
        if (res.details.length > 0) {
          console.error(`Validation details for [${slug}:${entry.id}]:`, res.details)
        }
        expect(res.details, `Fixture [${slug}:${entry.id}] failed validation`).toEqual([])
      }
    }
  })
})
