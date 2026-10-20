// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { generateScaleEntries } from './scale.data';

export async function seedScaleEntries(db: D1Database, count: number = 2000): Promise<void> {
  const { posts, authors } = generateScaleEntries(count);
  const statements: D1PreparedStatement[] = [];

  const stmtAuthor = db.prepare(
    `INSERT INTO content_authors (id, status, slug, created_at, updated_at, name) VALUES (?, 'published', ?, ?, ?, ?)`
  );
  for (const author of authors) {
    statements.push(
      stmtAuthor.bind(author.id, author.slug, author.created_at, author.updated_at, author.name)
    );
  }

  const stmt = db.prepare(
    `INSERT INTO content_posts (id, status, slug, created_at, updated_at, title, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const entry of posts) {
    statements.push(
      stmt.bind(entry.id, entry.status, entry.slug, entry.created_at, entry.updated_at, entry.title, entry.author_id)
    );
  }

  // Batch insert in chunks of 100 to avoid D1 limits
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }
}
