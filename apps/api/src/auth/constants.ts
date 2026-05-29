// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** API auth error messages - used by handlers and tests */
export const AUTH_ERRORS = {
  INVALID_REQUEST: 'Invalid request',
  INVALID_CREDENTIALS: 'Invalid credentials',
  DATABASE_ERROR: 'Database error',
  /** Generic message for 500 errors - does not reveal system details */
  GENERIC_ERROR: 'An error occurred',
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: 'Too many requests',
} as const
