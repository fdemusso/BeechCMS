import type { IActivityLogger, ActivityLogEntry } from '@beechcms/core'

/**
 * Test double for {@link IActivityLogger}.
 *
 * Captures every call into a public array so test assertions can verify
 * audit-trail side effects without touching D1. Preserves insertion order.
 */
export class InMemoryActivityLogger implements IActivityLogger {
  public readonly entries: ActivityLogEntry[] = []

  log(entry: ActivityLogEntry): void {
    this.entries.push(entry)
  }
}
