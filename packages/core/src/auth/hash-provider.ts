// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface IHashProvider {
  /**
   * Hashes a plaintext password using a one-way algorithm so that the original
   * value can never be recovered from the stored digest.
   */
  hash(plaintextPassword: string): Promise<string>

  /**
   * Verifies a plaintext password against a stored hash using a constant-time
   * comparison to prevent timing-based attacks that could reveal whether a hash exists.
   */
  verify(plaintextPassword: string, storedHash: string): Promise<boolean>
}
