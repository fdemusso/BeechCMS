// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Per-user key namespace for import transport files; the worker deletes only these. */
export function importObjectKeyPrefix(userId: string): string {
  return `imports/${userId}/`
}

export function isImportObjectKeyOwnedBy(objectKey: string, userId: string): boolean {
  return userId !== '' && objectKey.startsWith(importObjectKeyPrefix(userId)) && !objectKey.includes('..')
}
