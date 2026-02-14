"use client"

import { useCallback, useState } from "react"
import {
  Bell,
  Database,
  Edit,
  EyeOff,
  FileText,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

// ============================================================================
// Types & Constants
// ============================================================================

/**
 * Tipo di filtro per le notifiche.
 * - "all": mostra tutte le notifiche (lette e non lette)
 * - "new": mostra solo le notifiche non lette
 */
type NotificationFilter = "all" | "new"

/**
 * Altezza fissa (in pixel) dell'area scrollabile delle notifiche.
 */
const NOTIFICATION_SCROLL_HEIGHT = 320

/**
 * Rappresenta una singola notifica nel sistema.
 *
 * @property id - Identificativo univoco della notifica
 * @property title - Titolo breve della notifica
 * @property description - Descrizione dettagliata dell'evento
 * @property icon - Icona Lucide da mostrare (FileText, UserPlus, Database, etc.)
 * @property isNew - Se true, la notifica è non letta e viene evidenziata
 * @property createdAt - Data e ora di creazione della notifica
 *
 * @example
 * // Notifica per pubblicazione contenuto
 * {
 *   id: "notif_123",
 *   title: "Contenuto pubblicato",
 *   description: "L'articolo 'Introduzione al CMS' è stato pubblicato.",
 *   icon: FileText,
 *   isNew: true,
 *   createdAt: new Date()
 * }
 */
interface Notification {
  id: string
  title: string
  description: string
  icon: LucideIcon
  isNew: boolean
  createdAt: Date
}

/**
 * Props per il componente NotificationList.
 */
interface NotificationListProps {
  notifications: Notification[]
  filter: NotificationFilter
  onMarkSeen: (id: string) => void
  onMarkUnseen: (id: string) => void
  onDelete: (id: string) => void
}

/**
 * Props per il componente NotificationCard.
 */
interface NotificationCardProps {
  notification: Notification
  onMarkSeen: (id: string) => void
  onMarkUnseen: (id: string) => void
  onDelete: (id: string) => void
}

// ============================================================================
// Mock Data
// ============================================================================

/**
 * TODO: Rimuovere questi dati mock una volta implementata l'integrazione con il backend.
 *
 * Le notifiche verranno create dinamicamente dal backend tramite:
 * 1. Eventi di sistema (pubblicazione contenuti, completamento backup, modifiche)
 * 2. Azioni utente (nuove registrazioni, cambio permessi, assegnazioni)
 * 3. Notifiche amministrative (aggiornamenti disponibili, manutenzione programmata)
 * 4. Aggiornamenti real-time via WebSocket o polling periodico
 *
 * API proposta:
 * - GET /api/notifications - Lista notifiche dell'utente
 * - PATCH /api/notifications/:id/mark-seen - Segna come letta
 * - PATCH /api/notifications/:id/mark-unseen - Segna come non letta
 * - DELETE /api/notifications/:id - Elimina notifica
 * - WebSocket /ws/notifications - Stream notifiche real-time
 */
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    title: "Contenuto pubblicato",
    description:
      "L'articolo 'Introduzione al CMS' è stato pubblicato con successo.",
    icon: FileText,
    isNew: true,
    createdAt: new Date(),
  },
  {
    id: "2",
    title: "Nuovo utente",
    description: "admin@beech.local si è registrato. Verifica i permessi.",
    icon: UserPlus,
    isNew: true,
    createdAt: new Date(),
  },
  {
    id: "3",
    title: "Backup completato",
    description:
      "Il backup giornaliero del database è stato completato alle 03:00.",
    icon: Database,
    isNew: false,
    createdAt: new Date(),
  },
  {
    id: "4",
    title: "Aggiornamento disponibile",
    description:
      "È disponibile una nuova versione di Beech CMS. Controlla la documentazione per i dettagli.",
    icon: Bell,
    isNew: true,
    createdAt: new Date(),
  },
  {
    id: "5",
    title: "Modifica contenuto",
    description:
      "Qualcuno ha modificato la pagina 'Chi siamo'. Ultima modifica: 2 ore fa.",
    icon: Edit,
    isNew: false,
    createdAt: new Date(),
  },
]

// ============================================================================
// Components
// ============================================================================

/**
 * Renderizza la lista di notifiche con gestione dello stato vuoto.
 *
 * Mostra un empty state quando non ci sono notifiche da visualizzare,
 * altrimenti renderizza le card delle notifiche filtrate.
 *
 * @param notifications - Array di notifiche da mostrare (già filtrate)
 * @param filter - Filtro attivo ("all" o "new"), usato per personalizzare il messaggio empty state
 * @param onMarkSeen - Callback per segnare una notifica come letta
 * @param onMarkUnseen - Callback per segnare una notifica come non letta
 * @param onDelete - Callback per eliminare una notifica
 */
function NotificationList({
  notifications,
  filter,
  onMarkSeen,
  onMarkUnseen,
  onDelete,
}: NotificationListProps) {
  return (
    <div className="space-y-3 p-2">
      {notifications.length === 0 ? (
        <Empty className="border-0 p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell className="size-6" />
            </EmptyMedia>
            <EmptyTitle>Nessuna notifica</EmptyTitle>
            <EmptyDescription>
              {filter === "new"
                ? "Non hai nuove notifiche."
                : "Non ci sono notifiche da mostrare."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        notifications.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            onMarkSeen={onMarkSeen}
            onMarkUnseen={onMarkUnseen}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}

/**
 * Card singola notifica con interazioni click e menu contestuale.
 *
 * Comportamenti:
 * - Click sinistro sulla card (se isNew=true): segna la notifica come letta
 * - Click destro: apre menu contestuale con opzioni "Segna come non vista" ed "Elimina"
 * - Puntino rosso in alto a destra: indica notifica non letta (solo visivo)
 * - Supporto tastiera: Enter/Spazio per segnare come letta se non letta
 *
 * @param notification - Dati della notifica da renderizzare
 * @param onMarkSeen - Callback per segnare come letta (isNew → false)
 * @param onMarkUnseen - Callback per segnare come non letta (isNew → true)
 * @param onDelete - Callback per eliminare la notifica
 */
function NotificationCard({
  notification,
  onMarkSeen,
  onMarkUnseen,
  onDelete,
}: NotificationCardProps) {
  const Icon = notification.icon

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          role={notification.isNew ? "button" : undefined}
          tabIndex={notification.isNew ? 0 : undefined}
          onClick={() => {
            if (notification.isNew) onMarkSeen(notification.id)
          }}
          onKeyDown={(event) => {
            if (notification.isNew && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault()
              onMarkSeen(notification.id)
            }
          }}
          className={cn(
            "relative flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
            "hover:bg-muted/50",
            notification.isNew
              ? "cursor-pointer"
              : "cursor-context-menu"
          )}
        >
          {notification.isNew && (
            <span
              className="absolute right-2 top-2 inline-block size-2 shrink-0 rounded-full bg-destructive aspect-square"
              aria-hidden
            />
          )}
          <div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-full">
            <Icon className="text-muted-foreground size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{notification.title}</p>
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {notification.description}
            </p>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onMarkUnseen(notification.id)}>
          <EyeOff className="size-4" />
          Segna come non vista
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => onDelete(notification.id)}
        >
          <Trash2 className="size-4" />
          Elimina
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * Chiude forzatamente il ContextMenu di Radix UI simulando un click esterno.
 *
 * Workaround necessario perché Radix ContextMenu non supporta uno stato "open" controllato
 * e rimane aperto durante lo scroll/wheel dell'area notifiche. Questo causa problemi UX
 * perché il menu contestuale resta visibile anche quando si scrolla via dalla notifica.
 *
 * Viene chiamato dagli handler onScroll e onWheel del contenitore scrollabile.
 *
 * Alternativa futura: se Radix aggiungerà supporto per controllare lo stato aperto/chiuso
 * del ContextMenu, questo workaround potrà essere rimosso.
 *
 * @param container - L'elemento HTML su cui simulare il pointerdown event
 */
function dispatchCloseContextMenu(container: HTMLElement) {
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: 0,
    clientY: 0,
  })
  container.dispatchEvent(event)
}

/**
 * Componente principale per la gestione e visualizzazione delle notifiche.
 *
 * Mostra un popover attivabile tramite icona campanella nell'header, con:
 * - Badge rosso quando ci sono notifiche non lette
 * - Segmented control per filtrare tra "Tutte" e "Nuove"
 * - Lista scrollabile di notifiche con interazioni click e menu contestuale
 * - Supporto accessibilità con screen reader
 *
 * Attualmente usa dati mock, da sostituire con chiamate API reali.
 */
export function NotificationsPopover() {
  const [notifications, setNotifications] =
    useState<Notification[]>(MOCK_NOTIFICATIONS)
  const [filter, setFilter] = useState<NotificationFilter>("all")

  const handleScrollClose = useCallback((event: React.UIEvent) => {
    const element = event.currentTarget as HTMLElement
    if (element) dispatchCloseContextMenu(element)
  }, [])

  const filteredNotifications =
    filter === "new"
      ? notifications.filter((notification) => notification.isNew)
      : notifications

  const handleMarkSeen = (id: string) => {
    setNotifications((previousNotifications) =>
      previousNotifications.map((notification) =>
        notification.id === id ? { ...notification, isNew: false } : notification
      )
    )
  }

  const handleMarkUnseen = (id: string) => {
    setNotifications((previousNotifications) =>
      previousNotifications.map((notification) =>
        notification.id === id ? { ...notification, isNew: true } : notification
      )
    )
  }

  const handleDelete = (id: string) => {
    setNotifications((previousNotifications) =>
      previousNotifications.filter((notification) => notification.id !== id)
    )
  }

  const hasUnreadNotifications = notifications.some(
    (notification) => notification.isNew
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="relative ml-auto h-8 w-8"
          variant="ghost"
          size="icon"
          aria-label="Notifiche"
        >
          <Bell className="size-4" />
          {hasUnreadNotifications && (
            <span
              className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-destructive"
              aria-hidden
            />
          )}
          {/* Region live per screen reader: annuncia il conteggio notifiche non lette */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {hasUnreadNotifications
              ? `Hai ${notifications.filter((notification) => notification.isNew).length} notifiche non lette`
              : "Nessuna notifica non letta"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 p-0 sm:w-96"
      >
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) =>
              value && setFilter(value as NotificationFilter)
            }
            variant="outline"
            className="mt-2 w-full justify-start"
          >
            <ToggleGroupItem value="all" className="flex-1">
              Tutte
            </ToggleGroupItem>
            <ToggleGroupItem value="new" className="flex-1">
              Nuove
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div
          style={{ height: `${NOTIFICATION_SCROLL_HEIGHT}px` }}
          className="overflow-y-auto overflow-x-hidden"
          onScroll={handleScrollClose}
          onWheel={handleScrollClose}
        >
          <NotificationList
            notifications={filteredNotifications}
            filter={filter}
            onMarkSeen={handleMarkSeen}
            onMarkUnseen={handleMarkUnseen}
            onDelete={handleDelete}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
