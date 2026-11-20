// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { IMPORT_JOBS_SEED_SLUG, SYSTEM_SEED_SLUGS, isSystemSeedSlug } from './system-seeds.js'

describe('isSystemSeedSlug', () => {
  it('flags every registered system slug', () => {
    for (const slug of SYSTEM_SEED_SLUGS) expect(isSystemSeedSlug(slug)).toBe(true)
  })

  it('registers the import_jobs seed bootstrapped by migration 0031', () => {
    expect(IMPORT_JOBS_SEED_SLUG).toBe('import_jobs')
    expect(isSystemSeedSlug(IMPORT_JOBS_SEED_SLUG)).toBe(true)
  })

  it('does not flag user seeds, including near-miss slugs', () => {
    const cases = ['posts', 'import_job', 'import_jobs_archive', 'Import_Jobs', '']
    for (const slug of cases) expect(isSystemSeedSlug(slug)).toBe(false)
  })
})
