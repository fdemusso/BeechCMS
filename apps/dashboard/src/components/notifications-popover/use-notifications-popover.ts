import { useState } from "react"
import {
  Bell,
  Database,
  Edit,
  FileText,
  UserPlus,
} from "lucide-react"
import type { Notification, NotificationFilter } from "./types"

/**
 * TODO: Rimuovere questi dati mock una volta implementata l'integrazione con il backend.
 */
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    title: "Contenuto pubblicato",
    description: "L'articolo 'Introduzione al CMS' è stato pubblicato con successo.",
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
    description: "Il backup giornaliero del database è stato completato alle 03:00.",
    icon: Database,
    isNew: false,
    createdAt: new Date(),
  },
  {
    id: "4",
    title: "Aggiornamento disponibile",
    description: "È disponibile una nuova versione di Beech CMS. Controlla la documentazione per i dettagli.",
    icon: Bell,
    isNew: true,
    createdAt: new Date(),
  },
  {
    id: "5",
    title: "Modifica contenuto",
    description: "Qualcuno ha modificato la pagina 'Chi siamo'. Ultima modifica: 2 ore fa.",
    icon: Edit,
    isNew: false,
    createdAt: new Date(),
  },
]

export function useNotificationsPopover() {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)
  const [filter, setFilter] = useState<NotificationFilter>("all")

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

  const hasUnreadNotifications = notifications.some((notification) => notification.isNew)
  
  const unreadCount = notifications.filter((notification) => notification.isNew).length

  return {
    notifications: filteredNotifications,
    filter,
    setFilter,
    hasUnreadNotifications,
    unreadCount,
    handleMarkSeen,
    handleMarkUnseen,
    handleDelete,
  }
}
