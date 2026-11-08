// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersTab, RolesTab, InvitationsTab } from "@/features/rbac"
import { usePermissions } from "@/features/shared"
import { TEAM_SECTIONS, type TeamSectionId } from "../lib/settings-registry"

const SECTION_CONTENT: Record<TeamSectionId, () => React.JSX.Element> = {
  users: () => <UsersTab />,
  roles: () => <RolesTab />,
  invitations: () => <InvitationsTab />,
}

/** Users, roles and invitations as the sections of one tab: who is on the team, what they may do, who is coming. */
export function TeamTab() {
  const { t } = useTranslation()
  const { canGlobally, canAnywhere } = usePermissions()
  const sections = TEAM_SECTIONS.filter((section) => section.isVisible({ canGlobally, canAnywhere }))
  const [chosen, setChosen] = useState<TeamSectionId | null>(null)
  const active = sections.find((section) => section.id === chosen)?.id ?? sections[0]?.id

  if (!active) return null

  return (
    <Tabs value={active} onValueChange={(value) => setChosen(value as TeamSectionId)} className="gap-6">
      <TabsList variant="line" className="w-fit justify-start gap-6 p-0">
        {sections.map((section) => (
          <TabsTrigger key={section.id} value={section.id} className="px-0">
            {t(section.labelKey, section.defaultLabel)}
          </TabsTrigger>
        ))}
      </TabsList>
      {sections.map((section) => {
        const Content = SECTION_CONTENT[section.id]
        return (
          <TabsContent key={section.id} value={section.id}>
            <Content />
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
