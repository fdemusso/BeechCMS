// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed } from '@beechcms/core'
import type { BeechSchemaManifest, ManifestSeed } from '@beechcms/core/schema'
import { compareManifest } from '../lib/manifest-compare.js'

const liveSeed = (overrides: Partial<Seed> = {}): Seed => ({
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text' }],
  ...overrides,
} as Seed)

const authoredSeed = (overrides: Partial<ManifestSeed> = {}): ManifestSeed => ({
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  branches: [{ alias: 'title', label: 'Title', type: 'text' }],
  ...overrides,
} as ManifestSeed)

const manifest = (seeds: ManifestSeed[]): BeechSchemaManifest => ({ version: 1, seeds })

describe('compareManifest', () => {
  it('reports in_sync when the manifest and the deployed definition canonicalize identically', () => {
    const drift = compareManifest(manifest([authoredSeed()]), [liveSeed()])

    expect(drift.seeds).toEqual([{ slug: 'posts', status: 'in_sync' }])
    expect(drift.inSync).toBe(true)
  })

  it('ignores branch ids, which a hand-authored manifest never carries', () => {
    const withDifferentId = liveSeed({ branches: [{ id: 'br_99', alias: 'title', label: 'Title', type: 'text' }] })

    const drift = compareManifest(manifest([authoredSeed()]), [withDifferentId])

    expect(drift.seeds).toEqual([{ slug: 'posts', status: 'in_sync' }])
  })

  it.each([
    ['allowDrafts' as const],
    ['requiredOnCreate' as const],
    ['multiple' as const],
  ])('ignores an omitted boolean flag (%s) that the deployed definition spells out as false', (flag) => {
    const isSeedFlag = flag === 'allowDrafts'
    const authored = isSeedFlag
      ? authoredSeed()
      : authoredSeed({ branches: [{ alias: 'title', label: 'Title', type: 'text' }] })
    const deployed = isSeedFlag
      ? liveSeed({ allowDrafts: false })
      : liveSeed({
          branches: [{ id: 'br_01', alias: 'title', label: 'Title', type: 'text', [flag]: false } as never],
        })

    const drift = compareManifest(manifest([authored]), [deployed])

    expect(drift.seeds).toEqual([{ slug: 'posts', status: 'in_sync' }])
  })

  it('ignores seed ordering on both sides', () => {
    const posts = authoredSeed({ slug: 'posts' })
    const pages = authoredSeed({ slug: 'pages', displayNameAlias: 'title', branches: [] })
    const livePosts = liveSeed({ slug: 'posts' })
    const livePages = liveSeed({ slug: 'pages', branches: [] })

    const forward = compareManifest(manifest([posts, pages]), [livePosts, livePages])
    const reversed = compareManifest(manifest([pages, posts]), [livePages, livePosts])

    expect(forward).toEqual(reversed)
  })

  it('reports differs when a branch alias, type or label changes', () => {
    const changed = liveSeed({ branches: [{ id: 'br_01', alias: 'headline', label: 'Title', type: 'text' }] })

    const drift = compareManifest(manifest([authoredSeed()]), [changed])

    // Labels ARE manifest content here (unlike the fingerprint projection, which excludes them).
    expect(drift.seeds).toEqual([{ slug: 'posts', status: 'differs' }])
    expect(drift.inSync).toBe(false)
  })

  it('reports only_in_manifest for an authored seed that is not deployed', () => {
    const drift = compareManifest(manifest([authoredSeed({ slug: 'drafts-only' })]), [])

    expect(drift.seeds).toEqual([{ slug: 'drafts-only', status: 'only_in_manifest' }])
  })

  it('reports only_in_database for a deployed seed the manifest does not describe', () => {
    const drift = compareManifest(manifest([]), [liveSeed({ slug: 'legacy' })])

    expect(drift.seeds).toEqual([{ slug: 'legacy', status: 'only_in_database' }])
  })

  it('sets inSync false when any seed drifts', () => {
    const clean = authoredSeed({ slug: 'clean' })
    const drifted = authoredSeed({ slug: 'drifted', branches: [{ alias: 'a', label: 'A', type: 'text' }] })
    const liveClean = liveSeed({ slug: 'clean' })
    const liveDrifted = liveSeed({ slug: 'drifted', branches: [{ id: 'br_01', alias: 'b', label: 'B', type: 'text' }] })

    const drift = compareManifest(manifest([clean, drifted]), [liveClean, liveDrifted])

    expect(drift.inSync).toBe(false)
  })
})
