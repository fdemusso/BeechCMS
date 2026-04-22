import { useSearchParams } from 'react-router-dom'
import { User, Palette, Shield, HardDrive, Bell } from 'lucide-react'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { Separator } from '@/components/ui/separator'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as SettingsTab) ?? 'profile'

  const currentTab = TABS.find(t => t.id === activeTab) ?? TABS[0]

  const handleTabChange = (id: SettingsTab) => {
    setSearchParams({ tab: id }, { replace: true })
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <main className="flex flex-1 flex-col gap-0 p-6 md:p-8 lg:p-10">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
                <p className="text-muted-foreground mt-1">Gestisci il tuo profilo e le preferenze dell'account.</p>
              </div>

              <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                {/* Left nav */}
                <nav className="lg:w-52 shrink-0">
                  <ul className="space-y-1">
                    {TABS.map(({ id, label, icon: Icon }) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => handleTabChange(id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                            activeTab === id
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          <Icon className="size-4 shrink-0" />
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                <Separator orientation="vertical" className="hidden lg:block h-auto" />

                {/* Content area */}
                <div className="flex-1 min-w-0">
                  <div className="mb-4 lg:hidden">
                    <h2 className="text-lg font-semibold">{currentTab.label}</h2>
                    <Separator className="mt-2" />
                  </div>
                  <TabContent tab={activeTab} />
                </div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
