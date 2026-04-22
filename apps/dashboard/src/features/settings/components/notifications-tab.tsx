import * as React from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useNotificationPrefs, useUpdateNotificationPrefs } from '../hooks/use-settings'
import type { NotificationPrefs } from '../types/settings.types'

interface PrefItemProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled: boolean
}

function PrefItem({ id, label, description, checked, onCheckedChange, disabled }: PrefItemProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

export function NotificationsTab() {
  const { data: prefs, isLoading } = useNotificationPrefs()
  const updatePrefs = useUpdateNotificationPrefs()

  const handleChange = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return
    const updated: NotificationPrefs = { ...prefs, [key]: value }
    try {
      await updatePrefs.mutateAsync(updated)
      toast.success('Preferenze notifiche salvate')
    } catch {
      toast.error('Errore durante il salvataggio')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    )
  }

  const isPending = updatePrefs.isPending

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Notifiche in-app</CardTitle>
              <CardDescription>Scegli per quali eventi ricevere notifiche nell'interfaccia.</CardDescription>
            </div>
            {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <PrefItem
              id="notif-content-create"
              label="Nuovo contenuto"
              description="Quando viene creata una nuova entry"
              checked={prefs?.contentCreate ?? true}
              onCheckedChange={v => handleChange('contentCreate', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-content-update"
              label="Contenuto modificato"
              description="Quando un'entry viene aggiornata o una bozza viene pubblicata"
              checked={prefs?.contentUpdate ?? true}
              onCheckedChange={v => handleChange('contentUpdate', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-content-delete"
              label="Contenuto eliminato"
              description="Quando un'entry viene eliminata definitivamente"
              checked={prefs?.contentDelete ?? true}
              onCheckedChange={v => handleChange('contentDelete', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-media-upload"
              label="Media caricati"
              description="Quando un nuovo file viene caricato nella media library"
              checked={prefs?.mediaUpload ?? false}
              onCheckedChange={v => handleChange('mediaUpload', v)}
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
