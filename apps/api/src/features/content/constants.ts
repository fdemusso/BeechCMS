// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const CONTENT_ERRORS = {
  INVALID_SLUG: 'Invalid slug',
  INVALID_SLUG_OR_ID: 'Invalid slug or id',
  INVALID_JSON_BODY: 'Invalid JSON body',
  NOT_FOUND: 'Not found',
  SEED_NOT_FOUND: 'Seed not found',
  DATABASE_ERROR: 'Database error',
  SLUG_CONFLICT: 'Slug already exists for this schema',
  UPDATE_CONFLICT: 'The entry was modified after you last read it. Reload the entry and reapply your changes.',
  SENSITIVE_FIELD_EDIT: 'Cannot edit sensitive fields',
  BULK_SIZE_EXCEEDED: 'Cannot edit more than 500 entries at once',
  FIELD_NOT_BULK_EDITABLE: 'Field cannot be bulk-edited',
  SOFT_DELETE_DISABLED: 'Soft delete is not enabled for this content type',
  INVALID_EXPORT_FORMAT: 'Unsupported export format',
  CSV_REQUIRES_FLAT_SEED: 'CSV cannot represent relation, repeater, tags or json fields — request format=ndjson',
  EXPORT_TOO_LARGE: 'Export exceeds the synchronous row limit — narrow the filter or search range',
  INVALID_IMPORT_FORMAT: 'Unsupported import format',
  IMPORT_OBJECT_KEY_REQUIRED: 'objectKey is required',
  IMPORT_OBJECT_NOT_FOUND: 'No uploaded object found for that key',
  IMPORT_FILE_TOO_LARGE: 'Import file exceeds the maximum size — split the file and retry',
  IMPORT_JOBS_SEED_MISSING: 'The import_jobs system content type is not installed — run database migrations',
  IMPORT_JOB_NOT_FOUND: 'Import job not found',
  IMPORT_JOB_FORBIDDEN: 'Not authorized to read this import job',
} as const

/**
 * Default ceiling on the R2 object an import job will read. Matches DEFAULT_MAX_UPLOAD_BYTES in
 * features/upload/index.ts:L15 — the presign route already refuses anything larger, so a bigger
 * value here could never be reached, and a smaller one would accept an upload it then refuses.
 */
export const DEFAULT_IMPORT_MAX_BYTES = 50 * 1024 * 1024
