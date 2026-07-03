// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Identifier abstraction. Hides direct calls to {@link crypto.randomUUID}
 * so callers can swap in deterministic generators during tests for stable
 * snapshot assertions and predictable insert ordering.
 */
export interface IIdGenerator {
  /**
   * Generates a new universally unique identifier.
   * Production implementation delegates to crypto.randomUUID().
   * Test implementations return deterministic values for snapshot assertions.
   */
  uuid(): string

  /**
   * Returns true when `value` has the exact shape produced by `uuid()`.
   * The ONLY place in the codebase that knows the id format. Never inline
   * a regex; always go through this method when validating a relation id,
   * a route param, or any user-supplied id.
   */
  isValid(value: unknown): value is string
}

// Internal — never exported. Callers depend on the interface, not the shape.
const SYSTEM_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Production singleton. Delegates to the host runtime CSPRNG-backed UUID
 * generator. Stateless and therefore safe to share across requests.
 */
export const SystemIdGenerator: IIdGenerator = {
  uuid: () => crypto.randomUUID(),
  isValid: (value): value is string =>
    typeof value === 'string' && SYSTEM_ID_REGEX.test(value),
}
