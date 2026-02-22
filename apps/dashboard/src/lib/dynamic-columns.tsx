import type { ColumnDef } from "@tanstack/react-table"
import type { Seed } from "@beech/core"
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { FieldDisplay } from "@/components/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Lunghezza minima per troncamento celle (evita celle troppo corte) */
const MIN_TRUNCATE_LENGTH = 20

/** Tipi di branch che supportano l'ordinamento colonna nella tabella */
const SORTABLE_BRANCH_TYPES = ["text", "number", "date"] as const

/**
 * Interfaccia ContentEntry per tipizzazione.
 * Corrisponde alla struttura restituita dall'API GET /api/content/:slug.
 */
export interface ContentEntry {
  id: string
  schema_slug: string
  /** Slug dell'entry (URL-friendly), null se non impostato */
  slug: string | null
  /** Stato di pubblicazione (es. draft, published) */
  status: string
  data: Record<string, unknown>
  created_at: number | null
  updated_at: number | null
}

/**
 * Calcola la lunghezza massima per ogni colonna stringa dalla prima pagina di dati.
 * Usata per troncamento consistente: tutte le stringhe più lunghe vengono tagliate con "..."
 * @param data - Tutti i dati (si usano solo i primi rowsPerPage)
 * @param seed - Seed con definizione dei branch
 * @param rowsPerPage - Numero righe della prima pagina (default 10)
 */
export function computeMaxLengths(
  data: ContentEntry[],
  seed: Seed,
  rowsPerPage: number
): Record<string, number> {
  const result: Record<string, number> = {}
  const firstPage = data.slice(0, rowsPerPage)

  for (const branch of seed.branches) {
    if (branch.type === "text") {
      let max = 0
      for (const row of firstPage) {
        const val = row.data[branch.alias]
        if (val != null) {
          const len = String(val).length
          if (len > max) max = len
        }
      }
      result[branch.alias] = Math.max(max, MIN_TRUNCATE_LENGTH)
    } else if (branch.type === "json") {
      const isTagsField = branch.alias.toLowerCase().includes("tag")
      if (isTagsField) continue // I tag (Badge colorati) non usano troncamento
      let max = 0
      for (const row of firstPage) {
        const val = row.data[branch.alias]
        if (val != null) {
          let str: string
          if (typeof val === "string") {
            try {
              str = JSON.stringify(JSON.parse(val))
            } catch {
              str = val
            }
          } else {
            str = JSON.stringify(val)
          }
          if (str.length > max) max = str.length
        }
      }
      result[branch.alias] = Math.max(max, MIN_TRUNCATE_LENGTH)
    } else {
      // Tipi non riconosciuti: tratta come stringa
      let max = 0
      for (const row of firstPage) {
        const val = row.data[branch.alias]
        if (val != null) {
          const len = String(val).length
          if (len > max) max = len
        }
      }
      result[branch.alias] = Math.max(max, MIN_TRUNCATE_LENGTH)
    }
  }

  return result
}

/**
 * Genera le definizioni delle colonne per TanStack Table basandosi su un Seed.
 * Colonne fisse di sistema: Select, ID, Slug, Stato (Badge), Azioni.
 * Colonne dinamiche: una per ogni seed.branch, con cella renderizzata solo da FieldDisplay.
 * @param maxLengths - Mappa alias -> lunghezza max (da computeMaxLengths); passata a FieldDisplay come options.maxLength.
 */
export function generateColumns(
  seed: Seed,
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
  maxLengths?: Record<string, number>
): ColumnDef<ContentEntry>[] {
  const columns: ColumnDef<ContentEntry>[] = []

  // Colonna Select (checkbox)
  columns.push({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleziona tutto"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleziona riga"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  })

  // Colonna di sistema: ID
  columns.push({
    id: "id",
    accessorFn: (row) => row.id,
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs truncate max-w-[8rem] block" title={row.original.id}>
        {row.original.id}
      </span>
    ),
    enableSorting: false,
  })

  // Colonna di sistema: Slug
  columns.push({
    id: "slug",
    accessorFn: (row) => row.slug,
    header: "Slug",
    cell: ({ row }) => {
      const slug = row.original.slug
      return (
        <span className="text-muted-foreground text-sm">
          {slug ?? "—"}
        </span>
      )
    },
    enableSorting: false,
  })

  // Colonna di sistema: Status (Badge)
  columns.push({
    id: "status",
    accessorFn: (row) => row.status,
    header: "Stato",
    cell: ({ row }) => {
      const status = row.original.status ?? "draft"
      const variant = status === "published" ? "default" : "secondary"
      return (
        <Badge variant={variant} className="capitalize">
          {status}
        </Badge>
      )
    },
    enableSorting: false,
  })

  // Colonne dinamiche: solo da seed.branches, cella = solo FieldDisplay
  seed.branches.forEach((branch) => {
    const baseColumn: ColumnDef<ContentEntry> = {
      accessorFn: (row) => row.data[branch.alias],
      id: branch.alias,
      header: ({ column }) => {
        // Solo text, number e date hanno ordinamento
        const sortable = (SORTABLE_BRANCH_TYPES as readonly string[]).includes(branch.type)
        
        if (sortable) {
          return (
            <div
              className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground/80 transition-colors"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              <span className="font-medium">{branch.label}</span>
              <ArrowUpDown className="size-4" />
            </div>
          )
        }
        
        return <div className="font-medium">{branch.label}</div>
      },
    }

    columns.push({
      ...baseColumn,
      cell: ({ row }) => (
        <FieldDisplay
          branch={branch}
          value={row.original.data[branch.alias]}
          options={
            maxLengths?.[branch.alias] != null
              ? { maxLength: maxLengths[branch.alias] }
              : undefined
          }
        />
      ),
    })
  })

  // Colonna Azioni (sempre ultima): Copia ID, Modifica (TODO), Elimina (DELETE reale via onDelete)
  columns.push({
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const entry = row.original

      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <span className="sr-only">Apri menu</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>Azioni</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard.writeText(entry.id).then(
                    () => toast.success("ID copiato"),
                    () => toast.error("Copia fallita")
                  )
                }}
              >
                Copia ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  // TODO: Navigherà a /content/:slug/:id (Form View)
                  onEdit(entry.id)
                }}
              >
                Modifica
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(entry.id)}
                className="text-destructive focus:text-destructive"
              >
                Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  })

  return columns
}
