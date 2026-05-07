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
}

/**
 * Production singleton. Delegates to the host runtime CSPRNG-backed UUID
 * generator. Stateless and therefore safe to share across requests.
 */
export const SystemIdGenerator: IIdGenerator = {
  uuid: () => crypto.randomUUID(),
}
