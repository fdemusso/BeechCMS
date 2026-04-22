import * as React from 'react'
import { toast } from 'sonner'
import { Loader2, MonitorSmartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useSessions, useRevokeSession, useSettingsActivity } from '../hooks/use-settings'
import type { ActivityEntry, Session } from '../types/settings.types'

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Creato',
  update: 'Modificato',
  delete: 'Eliminato',
  upload: 'Caricato',
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
  upload: 'outline',
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: (id: string) => void }) {
  const [pending, setPending] = React.useState(false)

  const handleRevoke = async () => {
    setPending(true)
    try {
      await onRevoke(session.id)
      toast.success('Sessione revocata')
    } catch {
      toast.error('Errore durante la revoca')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <MonitorSmartphone className="size-4 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Sessione attiva</p>
          <p className="text-xs text-muted-foreground">
            Creata il {formatDate(session.created_at)} · Scade il {formatDate(session.expires_at)}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocare la sessione?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa sessione verrà disconnessa immediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>Revoca</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  let details: Record<string, unknown> = {}
  try { details = JSON.parse(entry.details ?? '{}') } catch { /* noop */ }
  const title = typeof details.title === 'string' ? details.title : entry.entity_slug ?? entry.entity_type

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <Badge variant={ACTION_VARIANT[entry.action] ?? 'secondary'} className="shrink-0 capitalize">
          {ACTION_LABELS[entry.action] ?? entry.action}
        </Badge>
        <div>
          <p className="text-sm font-medium truncate max-w-xs">{title}</p>
          <p className="text-xs text-muted-foreground">{entry.entity_slug ?? entry.entity_type}</p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 ml-4">{formatDate(entry.created_at)}</span>
    </div>
  )
}

export function SecurityTab() {
  const { data: sessions, isLoading: sessionsLoading } = useSessions()
  const { data: activity, isLoading: activityLoading } = useSettingsActivity()
  const revokeSession = useRevokeSession()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sessioni attive</CardTitle>
          <CardDescription>Sessioni di accesso correntemente aperte per il tuo account.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !sessions?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessuna sessione attiva</p>
          ) : (
            <div>
              {sessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onRevoke={(id) => revokeSession.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attività recente</CardTitle>
          <CardDescription>Ultime azioni eseguite nel CMS con il tuo account.</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !activity?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessuna attività registrata</p>
          ) : (
            <ScrollArea className="h-72">
              {activity.map(entry => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
