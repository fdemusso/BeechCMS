// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { applyD1Migrations, env } from 'cloudflare:test'

// Top-level await: runs once per test file, inside the file's storage frame, before any test.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
