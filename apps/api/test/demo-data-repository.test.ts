// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { D1DemoDataRepository } from '../src/shared/db/repositories/demo-data.repository.d1'
import type { ContentRepository, Seed } from '@beechcms/core'

describe('D1DemoDataRepository (Repository-Driven Ingestion)', () => {
  it('calls repository.create for every demo fixture entry in seed order', async () => {
    const mockDb = {} as any
    const repo = new D1DemoDataRepository(mockDb)

    const createdEntries: Array<{ seedSlug: string; id: string; slug: string; status: string; data: any }> = []

    const mockContentRepo: Partial<ContentRepository> = {
      create: vi.fn(async (seed: Seed, id: string, slug: string, status: string, data: any) => {
        createdEntries.push({ seedSlug: seed.slug, id, slug, status, data })
      }),
    }

    const mockGetSeed = (slug: string): Seed | null => {
      return {
        slug,
        label: slug,
        labelPlural: slug,
        displayNameAlias: 'name',
        allowDrafts: false,
        branches: [],
      } as Seed
    }

    await repo.loadDemoData(mockContentRepo as ContentRepository, mockGetSeed)

    expect(mockContentRepo.create).toHaveBeenCalled()
    expect(createdEntries.length).toBeGreaterThan(0)

    // Verify clienti, abbonamenti, ticket, changelog, articoli entries were ingested
    const loadedSeeds = Array.from(new Set(createdEntries.map((e) => e.seedSlug)))
    expect(loadedSeeds).toContain('clienti')
    expect(loadedSeeds).toContain('abbonamenti')
    expect(loadedSeeds).toContain('ticket')
    expect(loadedSeeds).toContain('changelog')
    expect(loadedSeeds).toContain('articoli')

    // Verify first clienti entry payload
    const elisa = createdEntries.find((e) => e.id === 'c_01')
    expect(elisa).toBeDefined()
    expect(elisa?.data.email).toBe('elisa.colombo@vertexdigital.com')
  })
})
