// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Error constants for Public API responses.
 */
export const PUBLIC_ERRORS = {
  API_KEY_UNAUTHORIZED: {
    error: 'Unauthorized',
    message:
      'Missing or invalid API key. Provide a valid key via X-API-Key header.',
  },
  API_KEY_FORBIDDEN: {
    error: 'Forbidden',
    message: 'Public API access is not configured for this instance.',
  },
} as const

