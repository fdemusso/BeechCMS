import type { LucideIcon } from "lucide-react"

/**
 * Tipo di filtro per le notifiche.
 * - "all": mostra tutte le notifiche (lette e non lette)
 * - "new": mostra solo le notifiche non lette
 */
export type NotificationFilter = "all" | "new"

/**
 * Rappresenta una singola notifica nel sistema.
 *
 * @property id - Identificativo univoco della notifica
 * @property title - Titolo breve della notifica
 * @property description - Descrizione dettagliata dell'evento
 * @property icon - Icona Lucide da mostrare (FileText, UserPlus, Database, etc.)
 * @property isNew - Se true, la notifica è non letta e viene evidenziata
 * @property createdAt - Data e ora di creazione della notifica
 */
export interface Notification {
  id: string
  title: string
  description: string
  icon: LucideIcon
  isNew: boolean
  createdAt: Date
}
