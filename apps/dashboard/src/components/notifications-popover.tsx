"use client"

import { useState } from "react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  title: string
  description: string
  icon: LucideIcon
  isNew: boolean
  createdAt: Date
}

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

function NotificationList({
  notifications,
  filter,
  onMarkUnseen,
  onDelete,
}: {
  notifications: Notification[]
  filter: "all" | "new"
  onMarkUnseen: (id: string) => void
  onDelete: (id: string) => void
}) {
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
            onMarkUnseen={onMarkUnseen}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  )
}

function NotificationCard({
  notification,
  onMarkUnseen,
  onDelete,
}: {
  notification: Notification
  onMarkUnseen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const Icon = notification.icon

  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex cursor-context-menu items-center gap-3 rounded-lg border bg-card p-3 transition-colors",
            "hover:bg-muted/50"
          )}
        >
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

export function NotificationsPopover() {
  const [notifications, setNotifications] =
    useState<Notification[]>(MOCK_NOTIFICATIONS)
  const [filter, setFilter] = useState<"all" | "new">("all")

  const filteredNotifications =
    filter === "new"
      ? notifications.filter((n) => n.isNew)
      : notifications

  const handleMarkUnseen = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isNew: false } : n))
    )
  }

  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  const hasUnread = notifications.some((n) => n.isNew)

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
          {hasUnread && (
            <span
              className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-destructive"
              aria-hidden
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 p-0 sm:w-96"
      >
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as "all" | "new")}
            className="mt-2"
          >
            <TabsList variant="line" className="h-auto w-full justify-start">
              <TabsTrigger value="all">Tutte</TabsTrigger>
              <TabsTrigger value="new">Nuove</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-0">
              <ScrollArea className="h-[320px]">
                <NotificationList
                  notifications={filteredNotifications}
                  filter={filter}
                  onMarkUnseen={handleMarkUnseen}
                  onDelete={handleDelete}
                />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="new" className="mt-0">
              <ScrollArea className="h-[320px]">
                <NotificationList
                  notifications={filteredNotifications}
                  filter={filter}
                  onMarkUnseen={handleMarkUnseen}
                  onDelete={handleDelete}
                />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </PopoverContent>
    </Popover>
  )
}
