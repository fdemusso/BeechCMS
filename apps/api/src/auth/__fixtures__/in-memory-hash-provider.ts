// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { IHashProvider } from '@beechcms/core'

const HASH_PREFIX = 'HASH:'

export class InMemoryHashProvider implements IHashProvider {
  async hash(plaintextPassword: string): Promise<string> {
    return HASH_PREFIX + plaintextPassword
  }

  async verify(plaintextPassword: string, storedHash: string): Promise<boolean> {
    return storedHash === HASH_PREFIX + plaintextPassword
  }
}
