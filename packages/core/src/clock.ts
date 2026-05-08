/**
 * Time abstraction. Hides direct calls to {@link Date.now} so callers can
 * swap in deterministic clocks during tests without resorting to global
 * timer mocks (e.g. vi.useFakeTimers, sinon, monkey-patching Date).
 */
export interface IClock {
  /**
   * Returns the current Unix timestamp in milliseconds.
   * Equivalent to Date.now() in production.
   * Overridable in tests for deterministic time-sensitive assertions.
   */
  now(): number

  /**
   * Returns the current Unix timestamp in whole seconds.
   * Equivalent to Math.floor(Date.now() / 1000) in production.
   * Used by JWT issuance, session expiry, and analytics day-bucket computations.
   */
  nowSeconds(): number
}

const MILLISECONDS_PER_SECOND = 1000

/**
 * Production singleton. Delegates to the host runtime clock. Stateless and
 * therefore safe to share across requests.
 */
export const SystemClock: IClock = {
  now: () => Date.now(),
  nowSeconds: () => Math.floor(Date.now() / MILLISECONDS_PER_SECOND),
}
