import type { IClock } from '@beechcms/core'

const MILLISECONDS_PER_SECOND = 1000

/**
 * Test-only IClock implementation that returns a frozen timestamp on every
 * call. Lets specs assert exact values for `createdAt`, `iat`, and
 * day-bucket computations without resorting to vi.useFakeTimers or
 * patching the global Date constructor.
 */
export class FixedClock implements IClock {
  constructor(private readonly fixedNowMs: number) {}

  now(): number {
    return this.fixedNowMs
  }

  nowSeconds(): number {
    return Math.floor(this.fixedNowMs / MILLISECONDS_PER_SECOND)
  }
}
