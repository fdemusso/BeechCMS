// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User, Palette, Shield, HardDrive, Bell, Settings, Layers } from 'reicon-react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { SeedBuilderPage } from '@/features/seed-builder'
import { ProfileTab } from '../components/profile-tab'
import { InterfaceTab } from '../components/interface-tab'
import { SecurityTab } from '../components/security-tab'
import { StorageTab } from '../components/storage-tab'
import { NotificationsTab } from '../components/notifications-tab'
import { GeneralTab } from '../components/general-tab'
import type { SettingsTab } from '../types/settings.types'

function TabContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'profile': return <ProfileTab />
    case 'interface': return <InterfaceTab />
    case 'security': return <SecurityTab />
    case 'storage': return <StorageTab />
    case 'notifications': return <NotificationsTab />
    case 'general': return <GeneralTab />
    case 'content-types': return <SeedBuilderPage />
  }
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const activeTab = (searchParams.get('tab') as SettingsTab) ?? 'profile'

  const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: 'profile', label: t('settings.tabs.profile'), icon: User },
    { id: 'general', label: t('settings.tabs.general'), icon: Settings },
    { id: 'interface', label: t('settings.tabs.interface'), icon: Palette },
    { id: 'security', label: t('settings.tabs.security'), icon: Shield },
    { id: 'storage', label: t('settings.tabs.storage'), icon: HardDrive },
    { id: 'notifications', label: t('settings.tabs.notifications'), icon: Bell },
    { id: 'content-types', label: t('seedBuilder.page.navTitle'), icon: Layers },
  ]

  const currentTab = TABS.find(tab => tab.id === activeTab) ?? TABS[0]
  const Icon = currentTab.icon

  return (
    <div className="[--header-height:calc(--spacing(14))] min-h-screen bg-background/50 dark:bg-background/50">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <main className="flex flex-1 flex-col gap-0 p-6 md:p-8 lg:p-10">
              <div className="content-area-inner">
                <div className="mb-6 flex items-center gap-3">
                  <Icon className="size-5 text-muted-foreground shrink-0" />
                  <div>
                    <h1 className="font-heading text-2xl font-bold tracking-tight">
                      {currentTab.label}
                    </h1>
                  </div>
                </div>
                <TabContent tab={activeTab} />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
