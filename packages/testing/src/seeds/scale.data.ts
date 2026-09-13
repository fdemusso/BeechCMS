// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface ScaleEntry {
  id: string;
  slug: string;
  status: 'published' | 'draft';
  title: string;
  author_id: string;
  created_at: number;
  updated_at: number;
}

export interface ScaleAuthor {
  id: string;
  slug: string;
  name: string;
  created_at: number;
  updated_at: number;
}

/**
 * Deterministically generates entries. No Math.random() allowed.
 */
export function generateScaleEntries(count: number): { posts: ScaleEntry[], authors: ScaleAuthor[] } {
  const posts: ScaleEntry[] = [];
  const authors: ScaleAuthor[] = [];
  const baseTime = Date.UTC(2026, 0, 1) / 1000;

  for (let i = 0; i < 50; i++) {
    authors.push({
      id: `00000000-0000-4000-a000-${i.toString(16).padStart(12, '0')}`,
      slug: `scale-author-${i}`,
      name: `Scale Author ${i}`,
      created_at: baseTime + i,
      updated_at: baseTime + i,
    });
  }

  for (let i = 0; i < count; i++) {
    const authorIndex = i % 50;
    posts.push({
      id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      slug: `scale-post-${i}`,
      status: 'published',
      title: `Scale Post ${i}`,
      author_id: authors[authorIndex]!.id,
      created_at: baseTime + i,
      updated_at: baseTime + i,
    });
  }
  return { posts, authors };
}
