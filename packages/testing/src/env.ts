// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** JWT secret used by the integration tier. 32+ bytes: JoseTokenService rejects anything shorter. */
export const TEST_JWT_SECRET = 'beech_cms_super_secret_test_key_2024_!@#'
export const TEST_PUBLISHABLE_KEY = 'beech_pk_test_6f8g9h0j1k2l'
export const TEST_SECRET_KEY = 'beech_sk_test_9a8b7c6d5e4f'

/**
 * Hono `Bindings` for harness requests. Deliberately carries no R2/SMTP/webhook endpoints:
 * the workers tier does not reach the Docker stack. Suites that need MinIO, Mailpit or the
 * webhook tester stay in the `forks` project with `apps/api/test/fixtures.ts` TEST_ENV.
 */
export const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  BEECH_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
  BEECH_SECRET_KEY: TEST_SECRET_KEY,
  PUBLIC_PUBLISHED_ONLY: 'true',
  ENV: 'development',
  CORS_ORIGINS: 'http://localhost:5173',
  DATE_FORMAT: 'DD-MM-YYYY',
  APP_URL: 'http://localhost:5173',
} as const

export type TestEnv = typeof TEST_ENV
