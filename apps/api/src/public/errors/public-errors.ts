// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Error constants for Public API responses.
 */
export const PUBLIC_ERRORS = {
  API_KEY_UNAUTHORIZED: {
    error: 'Unauthorized',
    message: 'Missing or invalid API key. Send the publishable key (reads) or the secret key (reads and writes) in the X-API-Key header.',
  },
  PUBLIC_NOT_CONFIGURED_READ: {
    error: 'Forbidden',
    message: 'Public API reads are not configured: set BEECH_PUBLISHABLE_KEY (or BEECH_SECRET_KEY). Projects created with 0.10.x: run `npx beech keys:migrate`.',
  },
  PUBLIC_NOT_CONFIGURED_WRITE: {
    error: 'Forbidden',
    message: 'Public API writes are not configured: set BEECH_SECRET_KEY. Projects created with 0.10.x: run `npx beech keys:migrate`.',
  },
  SECRET_KEY_REQUIRED: {
    error: 'Forbidden',
    message: 'This is a publishable key, which is read-only. Writes require the secret key, used server-side only.',
  },
  DEV_SECRET_KEY: {
    error: 'Forbidden',
    message: 'The local development secret key is refused outside ENV=development. Configure a generated BEECH_SECRET_KEY.',
  },
} as const
