// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { RepositoryError, SlugConflictError } from '@beechcms/core'

/**
 * Base class for D1-backed repositories.
 * Handles the D1 instance and provides common database utilities and error mapping.
 */
export abstract class BaseD1Repository {
  constructor(protected readonly database: D1Database) {}

  /**
   * Utility method to extract a table name for a given seed.
   */
  protected getTableName(slug: string, isDraft = false): string {
    return isDraft ? `content_${slug}_drafts` : `content_${slug}`
  }

  /**
   * Helper to map generic D1 errors to Beech RepositoryErrors.
   * This centralizes error handling for all D1 repositories.
   */
  protected mapError(error: any, context: string): RepositoryError {
    const message = error?.message || 'Unknown database error'
    if (message.includes('UNIQUE constraint failed') && message.includes('slug')) {
      return new SlugConflictError(`${context}: ${message}`)
    }
    // In the future, we can add more specific SQLite error code checks here
    // (e.g., checking for UNIQUE constraint via string matching or codes if available)
    return new RepositoryError(`${context}: ${message}`, error)
  }
}
