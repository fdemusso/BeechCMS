import type { INotificationService, CreateNotificationInput } from '@beechcms/core'

/**
 * Test double for {@link INotificationService}.
 *
 * Captures every call into a public array so tests can assert what would have
 * been delivered without touching D1.
 */
export class InMemoryNotificationService implements INotificationService {
  public readonly receivedNotifications: CreateNotificationInput[] = []

  notify(input: CreateNotificationInput): void {
    this.receivedNotifications.push(input)
  }
}
