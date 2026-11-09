// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { UsersSection, RolesSection, InvitationsSection } from "@/features/rbac"
import { usePermissions } from "@/features/shared"
import { PEOPLE_SECTIONS } from "../lib/settings-registry"

const SECTION_CONTENT: Record<(typeof PEOPLE_SECTIONS)[number]["id"], () => React.JSX.Element> = {
  users: () => <UsersSection />,
  invitations: () => <InvitationsSection />,
  roles: () => <RolesSection />,
}

/** Users, their pending invitations and the roles they hold, stacked in one page: nothing hides behind a tab. */
export function PeopleTab() {
  const { canGlobally, canAnywhere } = usePermissions()
  const sections = PEOPLE_SECTIONS.filter((section) => section.isVisible({ canGlobally, canAnywhere }))

  return (
    <div className="space-y-10">
      {sections.map((section) => {
        const Content = SECTION_CONTENT[section.id]
        return <Content key={section.id} />
      })}
    </div>
  )
}
