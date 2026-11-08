// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { InterfaceTab } from "./interface-tab"
import { NotificationsTab } from "./notifications-tab"

/** What each person tunes for themselves: how the dashboard looks and which events notify them. */
export function PreferencesTab() {
  return (
    <div className="space-y-6">
      <InterfaceTab />
      <NotificationsTab />
    </div>
  )
}
