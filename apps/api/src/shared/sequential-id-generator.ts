import type { IIdGenerator } from '@beechcms/core'

const ID_PADDING_WIDTH = 4

/**
 * Test-only IIdGenerator implementation. Each call returns a stable,
 * monotonically increasing identifier (`test-id-0001`, `test-id-0002`, …)
 * so snapshot assertions and insert-order checks remain deterministic
 * across runs.
 */
export class SequentialIdGenerator implements IIdGenerator {
  private counter = 0

  uuid(): string {
    this.counter += 1
    return `test-id-${String(this.counter).padStart(ID_PADDING_WIDTH, '0')}`
  }

  reset(): void {
    this.counter = 0
  }
}
