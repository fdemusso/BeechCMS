// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * MediaRepository - Interface for tracking media assets in the database.
 */
export interface MediaObject {
  key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: number;
}

export interface MediaRepository {
  /**
   * Tracks a new file upload in the database.
   */
  trackUpload(media: Omit<MediaObject, 'created_at'>): Promise<void>;

  /**
   * Retrieves tracking info for a file by its key.
   */
  getByKey(key: string): Promise<MediaObject | null>;

  /**
   * Removes tracking info for a file.
   */
  untrack(key: string): Promise<void>;

  /**
   * Lists all tracked media with pagination.
   */
  list(options: { limit: number; offset: number }): Promise<{ items: MediaObject[]; total: number }>;

  /**
   * Gets the total number of tracked media objects.
   */
  count(): Promise<number>;
}

/**
 * SystemStatsRepository - Interface for managing global system metrics.
 */
export interface SystemStatsRepository {
  /**
   * Increments the total storage counter.
   */
  incrementStorage(bytes: number): Promise<void>;

  /**
   * Decrements the total storage counter.
   */
  decrementStorage(bytes: number): Promise<void>;

  /**
   * Sets a specific value for a storage stat (e.g. after a full sync).
   */
  setStorage(bytes: number): Promise<void>;

  /**
   * Gets the current total storage usage in bytes.
   */
  getStorageUsage(): Promise<number>;
}
