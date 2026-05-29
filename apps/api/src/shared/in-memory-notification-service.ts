// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
