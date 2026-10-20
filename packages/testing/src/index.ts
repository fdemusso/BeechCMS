// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export { createTestHarness } from './harness'
export type { TestHarness, HarnessOptions, HarnessAuthProviders, TestApp } from './harness'
export type { TestClient } from './client/test-client'

export { FixedClock } from './services/fixed-clock'
export { FakeTokenService, TEST_TOKEN_PREFIX } from './services/fake-token.service'

export { TEST_ENV, TEST_JWT_SECRET, TEST_PUBLIC_READ_KEY, TEST_PUBLIC_WRITE_KEY } from './env'
export type { TestEnv } from './env'

export { CANONICAL_SEEDS, CANONICAL_SEED_SLUGS } from './seeds/canonical.seeds'
export {
  CANONICAL_USERS,
  CANONICAL_ENTRIES,
  UUID_V4_PATTERN,
} from './seeds/canonical.data'
export type { CanonicalUser, CanonicalUserKey, CanonicalEntry, CanonicalClaims } from './seeds/canonical.data'

export { provisionSeeds, resetContentTables, seedUsers, seedCanonicalEntries } from './seeds/provision'
export type { SeededCanonicalEntry } from './seeds/provision'

export { generateScaleEntries } from './seeds/scale.data'
export { seedScaleEntries } from './seeds/scale.provision'
