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
      'SELECT key, filename, mime_type, size_bytes, uploaded_by, created_at FROM media_objects ORDER BY created_at DESC LIMIT ? OFFSET ?'
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
