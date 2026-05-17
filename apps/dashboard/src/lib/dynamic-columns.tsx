import type { ColumnDef, AggregationFn, GroupingColumnDef } from "@tanstack/react-table"
import type { Seed } from "@beechcms/core"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import { FieldDisplay } from "@/features/fields"
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
import {
  matchesFilterGroup,
  normalizeDateToYmd,
} from "@/lib/filter-dsl"

/** Lunghezza minima per troncamento celle (evita celle troppo corte) */
const MIN_TRUNCATE_LENGTH = 20
/** Tetto massimo per troncamento celle (evita colonne ingestibili con testi lunghi). */
const MAX_TRUNCATE_LENGTH = 60

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

// ─── Tipi e costanti per raggruppamento date ──────────────────────────────────

/**
 * Granularità per il raggruppamento di branch di tipo `date`.
 * - `year` e `month` sono combinabili (es. "Gennaio 2024")
 * - `day` è esclusivo: se true, year e month devono essere false
 * Default: year + month → "Gennaio 2024"
 */
export interface DateGroupPrecision {
  year: boolean
  month: boolean
  /** Esclusivo: se true, year e month vengono ignorati */
  day: boolean
}

export const DEFAULT_DATE_GROUP_PRECISION: DateGroupPrecision = {
  year: true,
  month: true,
  day: false,
}

// ─── Helpers per raggruppamento e aggregazione ────────────────────────────────

/**
 * Converte un valore di tipo date nella chiave di gruppo secondo la precisione scelta.
 * - day (esclusivo): "15 gennaio 2024"
 * - year + month (default): "gennaio 2024"
 * - year only: "2024"
 * - month only: "gennaio"
 */
function getDateGroupValue(
  value: unknown,
  precision: DateGroupPrecision = DEFAULT_DATE_GROUP_PRECISION
): string {
  const d = normalizeDateToYmd(value)
  if (!d) return "—"
  // Force UTC midnight to avoid timezone drift
  const date = new Date(d + "T00:00:00")

  if (precision.day) {
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  const parts: string[] = []
  if (precision.month) {
    parts.push(date.toLocaleDateString("en-US", { month: "long" }))
  }
  if (precision.year) {
    parts.push(String(date.getFullYear()))
  }
  return parts.length ? parts.join(" ") : String(date.getFullYear())
}

/**
 * AggregationFn custom per branch boolean:
 * restituisce { trueCount, falseCount } contando i valori true/false
 * tra le leaf rows del gruppo.
 */
const booleanAggFn: AggregationFn<ContentEntry> = (_columnId, leafRows) => {
  let trueCount = 0
  let falseCount = 0
  for (const row of leafRows) {
    const v = row.getValue(_columnId)
    if (v === true) trueCount++
    else if (v === false) falseCount++
  }
  return { trueCount, falseCount }
}

function formatBooleanAggregated(value: unknown): string {
  if (
    value != null &&
    typeof value === "object" &&
    "trueCount" in value &&
    "falseCount" in value
  ) {
    const { trueCount, falseCount } = value as { trueCount: number; falseCount: number }
    return `✓ ${trueCount} / ✗ ${falseCount}`
  }
  return ""
}

function formatSum(value: unknown, count: number, t: (k: string, o?: any) => string): string {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return `Σ ${value.toLocaleString("en-US")} · ${count} ${count === 1 ? t("content.table.item") : t("content.table.items")}`
  }
  return `${count} ${count === 1 ? t("content.table.item") : t("content.table.items")}`
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status.trim().toLowerCase()
  if (!normalized) return "secondary"

  if (["error", "failed", "rejected", "archived"].includes(normalized)) {
    return "destructive"
  }

  if (["published", "active", "approved", "online"].includes(normalized)) {
    return "default"
  }

  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const codePoint = normalized.codePointAt(i)
    if (codePoint == null) continue
    hash = (hash * 31 + codePoint) >>> 0
    // Se è una coppia surrogate, salta il carattere successivo.
    if (codePoint > 0xffff) i++
  }
  return hash % 2 === 0 ? "secondary" : "outline"
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcola la lunghezza massima di stringa (con troncamento consistente) per un branch di tipo "text"/default.
 */
function computeMaxStringLength(firstPage: ContentEntry[], alias: string): number {
  let max = 0
  for (const row of firstPage) {
    const val = row.data[alias]
    if (val == null) continue
    const len = String(val).length
    if (len > max) max = len
  }
  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

/**
 * Calcola la lunghezza massima di stringa "renderizzata" per un branch JSON.
 * Se il campo sembra essere "tag", viene escluso (nessun troncamento).
 */
function computeMaxJsonLength(
  firstPage: ContentEntry[],
  alias: string,
): number | null {
  const isTagsField = alias.toLowerCase().includes("tag")
  if (isTagsField) return null // I tag (Badge colorati) non usano troncamento

  let max = 0
  for (const row of firstPage) {
    const val = row.data[alias]
    if (val == null) continue

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

  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

function computeMaxLengthForBranch(
  branch: Seed["branches"][number],
  firstPage: ContentEntry[],
): number | null {
  if (branch.type === "json") return computeMaxJsonLength(firstPage, branch.alias)
  if (branch.type === "text") return computeMaxStringLength(firstPage, branch.alias)
  // Tipi non riconosciuti: tratta come stringa.
  return computeMaxStringLength(firstPage, branch.alias)
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
    const maxLength = computeMaxLengthForBranch(branch, firstPage)
    if (maxLength == null) continue
    result[branch.alias] = maxLength
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
  maxLengths?: Record<string, number>,
  selectedIds: string[] = [],
  onBulkDelete?: (ids: string[]) => void,
  datePrecision: DateGroupPrecision = DEFAULT_DATE_GROUP_PRECISION,
  t: (key: string, options?: any) => string = (k) => k
): ColumnDef<ContentEntry>[] {
  const fixedColumns: ColumnDef<ContentEntry>[] = [
    // Colonna Select (checkbox)
    {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label={t("common.selectAll")}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={t("common.selectRow")}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    },

    // Colonna di sistema: ID
    {
    id: "id",
    accessorFn: (row) => row.id,
    header: "ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs truncate max-w-[8rem] block" title={row.original.id}>
        {row.original.id}
      </span>
    ),
    enableSorting: false,
    },

    // Colonna di sistema: Slug
    {
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
    },

    // Colonna di sistema: Status (Badge)
    {
    id: "status",
    accessorFn: (row) => row.status,
    header: t("content.table.status"),
    filterFn: (row, columnId, filterValue) =>
      matchesFilterGroup(row.getValue(columnId), filterValue),
    cell: ({ row }) => {
      const status = (row.original.status ?? "").trim() || "—"
      const variant = getStatusBadgeVariant(status)
      return (
        <Badge variant={variant}>
          {status}
        </Badge>
      )
    },
    enableSorting: false,
    },
  ]

  // Colonne dinamiche: solo da seed.branches, cella = solo FieldDisplay
  const dynamicColumns: ColumnDef<ContentEntry>[] = seed.branches.map((branch) => {
    const baseColumn: ColumnDef<ContentEntry> & GroupingColumnDef<ContentEntry, unknown> = {
      accessorFn: (row) => row.data[branch.alias],
      id: branch.alias,
      header: () => <div className="font-medium">{branch.label}</div>,
      filterFn: (row, columnId, filterValue) =>
        matchesFilterGroup(row.getValue(columnId), filterValue),
    }

    // Configurazione grouping/aggregation per tipo
    if (branch.type === "date") {
      baseColumn.getGroupingValue = (row) =>
        getDateGroupValue(row.data[branch.alias], datePrecision)
      baseColumn.aggregationFn = "count"
      baseColumn.aggregatedCell = ({ getValue, row }) => {
        const count = row.subRows?.length ?? 0
        const label = getValue<string>()
        if (!label) return null
        return (
          <span className="text-xs text-muted-foreground">
            {label} · {count} {count === 1 ? t("content.table.item") : t("content.table.items")}
          </span>
        )
      }
    } else if (branch.type === "boolean") {
      baseColumn.aggregationFn = booleanAggFn
      baseColumn.aggregatedCell = ({ getValue }) => {
        const formatted = formatBooleanAggregated(getValue())
        return formatted ? (
          <span className="text-xs text-muted-foreground">{formatted}</span>
        ) : null
      }
    } else if (branch.type === "number") {
      baseColumn.aggregationFn = "sum"
      baseColumn.aggregatedCell = ({ getValue, row }) => {
        const count = row.subRows?.length ?? 0
        return (
          <span className="text-xs text-muted-foreground">
            {formatSum(getValue(), count, t)}
          </span>
        )
      }
    } else {
      // text, richtext, file, json e altri → solo conteggio
      baseColumn.aggregationFn = "count"
      baseColumn.aggregatedCell = ({ row }) => {
        const count = row.subRows?.length ?? 0
        return (
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? t("content.table.item") : t("content.table.items")}
          </span>
        )
      }
    }

    const maxLength = maxLengths?.[branch.alias]
    return {
      ...baseColumn,
      cell: ({ row }) => (
        <FieldDisplay
          branch={branch}
          value={row.original.data[branch.alias]}
          options={typeof maxLength === "number" ? { maxLength } : undefined}
        />
      ),
    }
  })

  // Colonna Azioni (sempre ultima): Copia ID, Modifica via onEdit, Elimina via onDelete
  const actionsColumn: ColumnDef<ContentEntry> = {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const entry = row.original
      const hasBulkSelection = selectedIds.length > 1

      return (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <span className="sr-only">{t("common.openMenu")}</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{t("content.actions.label")}</DropdownMenuLabel>
              {hasBulkSelection ? (
                <DropdownMenuItem
                  onClick={() => onBulkDelete?.(selectedIds)}
                  className="text-destructive focus:text-destructive"
                >
                  {t("common.delete")}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(entry.id).then(
                        () => toast.success(t("common.copied")),
                        () => toast.error(t("common.copyFailed"))
                      )
                    }}
                  >
                    {t("content.actions.copyId")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onEdit(entry.id)
                    }}
                  >
                    {t("common.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(entry.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    {t("common.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
  }

  return [...fixedColumns, ...dynamicColumns, actionsColumn]
}
