// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineSeed, type Seed } from '@beechcms/core'

export const CANONICAL_SEEDS: readonly Seed[] = [
  defineSeed({
    slug: 'categories',
    label: 'Category',
    labelPlural: 'Categories',
    displayNameAlias: 'name',
    allowPublicRead: true,
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true, policies: { public: true } },
    ],
  }),
  defineSeed({
    slug: 'authors',
    label: 'Author',
    labelPlural: 'Authors',
    displayNameAlias: 'name',
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    ],
  }),
  defineSeed({
    slug: 'posts',
    label: 'Post',
    labelPlural: 'Posts',
    displayNameAlias: 'title',
    allowPublicRead: true,
    allowPublicPost: true,
    allowPublicEdit: true,
    allowDrafts: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
      { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { public: true } },
      { id: 'br_03', alias: 'internal_note', label: 'Internal Note', type: 'text', policies: { public: false } },
      { id: 'br_04', alias: 'contact_email', label: 'Contact Email', type: 'text' },
      { id: 'br_05', alias: 'view_count', label: 'View Count', type: 'number' },
      { id: 'br_06', alias: 'image', label: 'Featured Image', type: 'file', fileOptions: { accept: 'image' } },
      { id: 'br_07', alias: 'tags', label: 'Tags', type: 'tags' },
      { id: 'br_08', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' },
      { id: 'br_09', alias: 'category_id', label: 'Category', type: 'relation', targetSeed: 'categories', multiple: false, policies: { public: true } },
      { id: 'br_10', alias: 'related_posts', label: 'Related Posts', type: 'relation', targetSeed: 'posts', multiple: true, policies: { public: true } },
    ],
  }),
] as const

export const CANONICAL_SEED_SLUGS = CANONICAL_SEEDS.map((seed) => seed.slug)
