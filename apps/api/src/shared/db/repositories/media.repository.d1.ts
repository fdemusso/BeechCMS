// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { MediaRepository, MediaObject } from '@beechcms/core'

/**
 * Implementation of MediaRepository using Cloudflare D1.
 * Provides methods to track media uploads, retrieve media metadata, and manage the media library state in the database.
 */
export class D1MediaRepository implements MediaRepository {
  constructor(private database: D1Database) {}

  /**
   * Registers a new media upload in the database.
   */
  async trackUpload(mediaObject: Omit<MediaObject, 'created_at'>): Promise<void> {
    await this.database.prepare(
      'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      mediaObject.key, 
      mediaObject.filename, 
      mediaObject.mime_type, 
      mediaObject.size_bytes, 
      mediaObject.uploaded_by
    ).run()
  }

  /**
   * Registers a media upload and adds its size to total storage in one D1 batch (one transaction).
   * The storage bump is guarded by the key being absent and runs before the insert, so of several
   * racing registrations only the one that inserts the row also counts the bytes.
   */
  async registerUpload(mediaObject: Omit<MediaObject, 'created_at'>): Promise<boolean> {
    const [, insertResult] = await this.database.batch([
      this.database.prepare(
        "UPDATE system_stats SET value = CAST(value AS INTEGER) + ? WHERE id = 'total_storage_bytes' AND NOT EXISTS (SELECT 1 FROM media_objects WHERE key = ?)"
      ).bind(mediaObject.size_bytes, mediaObject.key),
      this.database.prepare(
        'INSERT OR IGNORE INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        mediaObject.key,
        mediaObject.filename,
        mediaObject.mime_type,
        mediaObject.size_bytes,
        mediaObject.uploaded_by
      ),
    ])
    return insertResult.meta.changes === 1
  }

  /**
   * Retrieves a media object's metadata by its unique key.
   */
  async getByKey(mediaKey: string): Promise<MediaObject | null> {
    return await this.database.prepare(
      'SELECT key, filename, mime_type, size_bytes, uploaded_by, created_at FROM media_objects WHERE key = ?'
    ).bind(mediaKey).first<MediaObject>()
  }

  /**
   * Removes the metadata tracking for a specific media key.
   */
  async untrack(mediaKey: string): Promise<void> {
    await this.database.prepare('DELETE FROM media_objects WHERE key = ?').bind(mediaKey).run()
  }

  /**
   * Lists media objects with pagination support.
   */
  async list(paginationOptions: { limit: number; offset: number }): Promise<{ items: MediaObject[]; total: number }> {
    const { results: mediaItems } = await this.database.prepare(
      'SELECT key, filename, mime_type, size_bytes, uploaded_by, created_at FROM media_objects ORDER BY created_at DESC, key DESC LIMIT ? OFFSET ?'
    ).bind(paginationOptions.limit, paginationOptions.offset).all<MediaObject>()

    const totalCountRecord = await this.database.prepare('SELECT COUNT(*) as total FROM media_objects').first<{ total: number }>()

    return {
      items: mediaItems ?? [],
      total: totalCountRecord?.total ?? 0
    }
  }

  /**
   * Returns the total number of media objects in the database.
   */
  async count(): Promise<number> {
    const totalCountRecord = await this.database.prepare('SELECT COUNT(*) as total FROM media_objects').first<{ total: number }>()
    return totalCountRecord?.total ?? 0
  }
}
