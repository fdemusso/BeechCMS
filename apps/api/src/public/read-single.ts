// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { EntryNotFoundError } from '@beechcms/core'
import type { Seed, ContentRepository } from '@beechcms/core'
import { toFlatPublicEntry } from './entry-projection'
import { buildPublicSingleMeta } from './response-builder'

type ReadSingleInput = {
  seed: Seed
  seedSlug: string
  repository: ContentRepository
  id: string | null
  slug: string | null
  publishedOnly: boolean
  fieldsParam?: string
}

export type ReadSingleResult =
  | { ok: true; data: Record<string, unknown>; meta: { seed: string } }
  | { ok: false; detail: string }

export async function readSingleEntry(input: ReadSingleInput): Promise<ReadSingleResult> {
  const { seed, seedSlug, repository, id, slug, publishedOnly, fieldsParam } = input
  const label = id ?? slug!

  try {
    const entry = id
      ? await repository.findById(seed, id)
      : await repository.findBySlug(seed, slug!)

    if (publishedOnly && entry.status !== 'published') {
      return { ok: false, detail: `Entry '${label}' not found or not published.` }
    }

    return {
      ok: true,
      data: toFlatPublicEntry(entry, seed, fieldsParam),
      meta: buildPublicSingleMeta(seedSlug),
    }
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return { ok: false, detail: `Entry '${label}' not found for content type '${seedSlug}'.` }
    }
    throw error
  }
}
