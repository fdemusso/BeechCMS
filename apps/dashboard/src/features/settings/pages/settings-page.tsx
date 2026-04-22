import { useSearchParams } from 'react-router-dom'
import { User, Palette, Shield, HardDrive, Bell } from 'lucide-react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { ProfileTab } from '../components/profile-tab'
import { InterfaceTab } from '../components/interface-tab'
import { SecurityTab } from '../components/security-tab'
import { StorageTab } from '../components/storage-tab'
import { NotificationsTab } from '../components/notifications-tab'
import type { SettingsTab } from '../types/settings.types'

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profilo', icon: User },
  { id: 'interface', label: 'Interfaccia', icon: Palette },
  { id: 'security', label: 'Sicurezza', icon: Shield },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'notifications', label: 'Notifiche', icon: Bell },
]

function TabContent({ tab }: { tab: SettingsTab }) {
  switch (tab) {
    case 'profile': return <ProfileTab />
    case 'interface': return <InterfaceTab />
    case 'security': return <SecurityTab />
    case 'storage': return <StorageTab />
    case 'notifications': return <NotificationsTab />
  }
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as SettingsTab) ?? 'profile'

  const currentTab = TABS.find(t => t.id === activeTab) ?? TABS[0]
  const Icon = currentTab.icon

  return (
    <div className="[--header-height:calc(--spacing(14))] min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <main className="flex flex-1 flex-col gap-0 p-6 md:p-8 lg:p-10">
              <div className="content-area-inner">
                {/* Section header */}
                <div className="mb-6 flex items-center gap-3">
                  <Icon className="size-5 text-muted-foreground shrink-0" />
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      {currentTab.label}
                    </h1>
                  </div>
                </div>

                {/* Tab content */}
                <TabContent tab={activeTab} />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
