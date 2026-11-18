// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { NotificationPrefs } from '../types/settings.types'

/** One notification switch: shared by the Notifications tab and the command palette. */
export interface NotificationPrefItem {
  /** DOM id of the tab's switch. */
  readonly id: string
  readonly key: keyof NotificationPrefs
  /** The value shown while the server holds none for the key. */
  readonly fallback: boolean
  /** Locale stem under `settings.notifications`, e.g. "contentCreate". */
  readonly text: string
}

export const NOTIFICATION_PREF_ITEMS: readonly NotificationPrefItem[] = [
  { id: 'notif-content-create', key: 'contentCreate', fallback: true, text: 'contentCreate' },
  { id: 'notif-content-update', key: 'contentUpdate', fallback: true, text: 'contentUpdate' },
  { id: 'notif-content-delete', key: 'contentDelete', fallback: true, text: 'contentDelete' },
  { id: 'notif-media-upload', key: 'mediaUpload', fallback: false, text: 'mediaUpload' },
]
