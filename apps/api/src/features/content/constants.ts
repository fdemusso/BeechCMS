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
  SENSITIVE_FIELD_EDIT: 'Cannot edit sensitive fields',
} as const
