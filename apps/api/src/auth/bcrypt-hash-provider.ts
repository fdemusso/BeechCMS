// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import bcrypt from 'bcryptjs'
import type { IHashProvider } from '@beechcms/core'

export const BCRYPT_SALT_ROUNDS = 10

export class BcryptHashProvider implements IHashProvider {
  private readonly saltRounds: number

  constructor(saltRounds: number = BCRYPT_SALT_ROUNDS) {
    this.saltRounds = saltRounds
  }

  async hash(plaintextPassword: string): Promise<string> {
    return bcrypt.hash(plaintextPassword, this.saltRounds)
  }

  async verify(plaintextPassword: string, storedHash: string): Promise<boolean> {
    return bcrypt.compare(plaintextPassword, storedHash)
  }
}
