// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ProfileTab } from "./profile-tab"
import { SecurityTab } from "./security-tab"

/** My account: profile, password, sessions and activity, as sections of one page (the sidebar bookmarks). */
export function AccountTab() {
  return (
    <div className="space-y-10">
      <ProfileTab />
      <SecurityTab />
    </div>
  )
}
