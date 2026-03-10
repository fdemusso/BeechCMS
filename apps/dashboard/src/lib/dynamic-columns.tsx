import type { ColumnDef } from "@tanstack/react-table"
import type { Seed } from "@beech/core"
import { MoreHorizontal } from "lucide-react"
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

type FilterGroupType = "text" | "number" | "date" | "boolean" | "tags" | "select" | "system"
type FilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_empty"
  | "is_not_empty"

type ToolbarFilterGroup = {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: Array<{
    id: string
    op: FilterOperator
    value: string | number | boolean | null
  }>
}

function isToolbarFilterGroup(value: unknown): value is ToolbarFilterGroup {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<ToolbarFilterGroup>
  return (
    typeof v.columnId === "string" &&
    typeof v.label === "string" &&
    typeof v.type === "string" &&
    Array.isArray(v.conditions)
  )
}

function isEmptyValue(v: unknown) {
  if (v == null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v as object).length === 0
  return false
}

function normalizeDateToYmd(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "string") {
    const trimmed = val.trim()
    if (!trimmed) return null
    // Se è già YYYY-MM-DD, usalo.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === "number") {
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  return null
}

function matchesCondition(
  cellValue: unknown,
  group: ToolbarFilterGroup,
  op: FilterOperator,
  filterValue: string | number | boolean | null
) {
  if (op === "is_empty") return isEmptyValue(cellValue)
  if (op === "is_not_empty") return !isEmptyValue(cellValue)

  if (group.type === "tags") {
    const obj =
      typeof cellValue === "string"
        ? (() => {
            try {
              return JSON.parse(cellValue) as unknown
            } catch {
              return null
            }
          })()
        : cellValue

    const keys =
      obj && typeof obj === "object" && !Array.isArray(obj)
        ? Object.keys(obj as Record<string, unknown>)
        : []

    if (op === "contains") {
      if (typeof filterValue !== "string" || !filterValue.trim()) return true
      return keys.includes(filterValue)
    }

    if (op === "eq") {
      if (typeof filterValue !== "string" || !filterValue.trim()) return true
      return keys.includes(filterValue)
    }
  }

  if (group.type === "number") {
    const n =
      typeof cellValue === "number"
        ? cellValue
        : typeof cellValue === "string" && cellValue.trim() !== ""
          ? Number(cellValue)
          : null
    const f = typeof filterValue === "number" ? filterValue : null
    if (n == null || f == null || Number.isNaN(n) || Number.isNaN(f)) return true
    if (op === "eq") return n === f
    if (op === "gt") return n > f
    if (op === "gte") return n >= f
    if (op === "lt") return n < f
    if (op === "lte") return n <= f
    return true
  }

  if (group.type === "date") {
    const d = normalizeDateToYmd(cellValue)
    const f = typeof filterValue === "string" ? normalizeDateToYmd(filterValue) : null
    if (!d || !f) return true
    if (op === "eq") return d === f
    if (op === "gt") return d > f
    if (op === "gte") return d >= f
    if (op === "lt") return d < f
    if (op === "lte") return d <= f
    return true
  }

  if (group.type === "boolean") {
    const b = typeof cellValue === "boolean" ? cellValue : null
    const f = typeof filterValue === "boolean" ? filterValue : null
    if (b == null || f == null) return true
    return op === "eq" ? b === f : true
  }

  if (group.type === "select") {
    const s = cellValue == null ? "" : String(cellValue)
    if (op === "eq") {
      if (filterValue == null) return true
      const f = String(filterValue)
      if (!f.trim()) return true
      return s.trim().toLowerCase() === f.trim().toLowerCase()
    }
    return true
  }

  // text/system fallback
  const s = cellValue == null ? "" : String(cellValue)
  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return true
    return s.toLowerCase().includes(filterValue.toLowerCase())
  }
  if (op === "eq") {
    if (filterValue == null) return true
    const f = String(filterValue)
    if (!f.trim()) return true
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }
  return true
}

function matchesFilterGroup(cellValue: unknown, filterValue: unknown) {
  if (!isToolbarFilterGroup(filterValue)) return true
  // AND tra condizioni della stessa colonna
  for (const cond of filterValue.conditions) {
    if (
      !matchesCondition(cellValue, filterValue, cond.op, cond.value)
    ) {
      return false
    }
  }
  return true
}

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
    filterFn: (row, columnId, filterValue) =>
      matchesFilterGroup(row.getValue(columnId), filterValue),
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
    filterFn: (row, columnId, filterValue) =>
      matchesFilterGroup(row.getValue(columnId), filterValue),
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
      header: () => <div className="font-medium">{branch.label}</div>,
      filterFn: (row, columnId, filterValue) =>
        matchesFilterGroup(row.getValue(columnId), filterValue),
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
