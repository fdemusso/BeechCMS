import type { ColumnDef } from "@tanstack/react-table"
import type { Seed } from "@beech/core"
import { ArrowUpDown, MoreHorizontal } from "lucide-react"
import React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"

const TEXT_TRUNCATE_LENGTH = 50
const JSON_TRUNCATE_LENGTH = 40
const MIN_TRUNCATE_LENGTH = 20
const SORTABLE_BRANCH_TYPES = ["text", "number", "date"] as const
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
import { ExpandableCell } from "@/components/ui/expandable-cell"

/**
 * Wrapper cliccabile che copia il valore negli appunti e mostra un toast.
 * @param value - Testo da copiare negli appunti
 * @param label - Nome della colonna (usato nel toast, es. "Titolo copiato")
 * @param children - Contenuto renderizzato (cella)
 */
function CopyableCell({
  value,
  label,
  children,
}: {
  value: string
  label: string
  children: React.ReactNode
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copiato`),
      () => toast.error("Copia fallita")
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
      className="cursor-pointer select-none hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
    >
      {children}
    </div>
  )
}

/**
 * Componente per renderizzare tags collassabili con Badge colorati.
 * Mostra il primo tag + un badge "+N" cliccabile per espandere gli altri.
 * @param entries - Array di [tag, colore] da Object.entries del JSON tags
 */
function CollapsibleTags({ entries }: { entries: [string, string][] }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  
  if (entries.length === 0) {
    return <div className="text-muted-foreground">-</div>
  }
  
  // Se c'è solo 1 tag, mostralo direttamente
  if (entries.length === 1) {
    const [tag, color] = entries[0]
    return (
      <Badge
        variant="secondary"
        style={{
          backgroundColor: color,
          color: "#fff",
          borderColor: color,
        }}
      >
        {tag}
      </Badge>
    )
  }
  
  // Se ci sono più tag, mostra il primo + badge "+N" espandibile
  const [firstTag, firstColor] = entries[0]
  const remainingCount = entries.length - 1
  
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {/* Primo tag sempre visibile */}
      <Badge
        variant="secondary"
        style={{
          backgroundColor: firstColor,
          color: "#fff",
          borderColor: firstColor,
        }}
      >
        {firstTag}
      </Badge>
      
      {/* Badge "+N" cliccabile per espandere/comprimere */}
      {!isExpanded && (
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(true)
          }}
        >
          +{remainingCount}
        </Badge>
      )}
      
      {/* Tags espansi (visibili solo quando isExpanded = true) */}
      {isExpanded && (
        <>
          {entries.slice(1).map(([tag, color]) => (
            <Badge
              key={tag}
              variant="secondary"
              style={{
                backgroundColor: color,
                color: "#fff",
                borderColor: color,
              }}
            >
              {tag}
            </Badge>
          ))}
          {/* Badge per comprimere */}
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-muted transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(false)
            }}
          >
            −
          </Badge>
        </>
      )}
    </div>
  )
}

/**
 * Interfaccia ContentEntry per tipizzazione.
 * Corrisponde alla struttura restituita dall'API.
 */
export interface ContentEntry {
  id: string
  schema_slug: string
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
      if (isTagsField) continue // I tag non usano ExpandableCell con lunghezza stringa
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
 * Crea automaticamente colonne per tutti i Branch + colonne Select e Actions.
 * @param maxLengths - Mappa alias -> lunghezza max per troncamento (da computeMaxLengths).
 *   Se fornita, le stringhe più lunghe vengono troncate con "..."; altrimenti si usano i default.
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

  // Genera colonne dinamiche dai Branch
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

    // Cell rendering basato sul tipo di Branch
    switch (branch.type) {
      case "text":
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            const value = row.original.data[branch.alias]
            if (value == null) return <div>-</div>
            const text = String(value)
            const maxLen = maxLengths?.[branch.alias] ?? TEXT_TRUNCATE_LENGTH
            return (
              <CopyableCell value={text} label={branch.label}>
                <ExpandableCell content={text} maxLength={maxLen} />
              </CopyableCell>
            )
          },
        })
        break

      case "number":
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            const value = row.original.data[branch.alias]
            if (value == null) return <div>-</div>
            
            const num = Number(value)
            const formatted = new Intl.NumberFormat("it-IT", {
              maximumFractionDigits: 2,
            }).format(num)
            
            return (
              <CopyableCell value={formatted} label={branch.label}>
                <div className="font-medium">{formatted}</div>
              </CopyableCell>
            )
          },
        })
        break

      case "boolean":
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            const value = row.original.data[branch.alias]
            const isTrue = value === true || value === "true"
            
            return (
              <div className="flex items-center">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    isTrue
                      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {isTrue ? "Sì" : "No"}
                </span>
              </div>
            )
          },
        })
        break

      case "date":
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            const value = row.original.data[branch.alias]
            if (!value) return <div>-</div>
            
            try {
              const date = new Date(value as string | number)
              const formatted = date.toLocaleDateString("it-IT", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
              return <div>{formatted}</div>
            } catch {
              return <div>{String(value)}</div>
            }
          },
        })
        break

      case "json":
        // Distingui tra tags (oggetto {tag: colore}) e metadati (oggetto generico)
        const isTagsField = branch.alias.toLowerCase().includes("tag")
        
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            let value = row.original.data[branch.alias]
            if (!value) return <div className="text-muted-foreground">-</div>
            
            // Se il valore è una stringa, prova a parsarlo come JSON
            if (typeof value === "string") {
              try {
                value = JSON.parse(value)
              } catch {
                // Se fallisce, mantieni la stringa
              }
            }
            
            try {
              // Se è un campo "tags" e contiene un oggetto, renderizza con Badge colorati
              if (isTagsField && typeof value === "object" && !Array.isArray(value)) {
                const entries = Object.entries(value as Record<string, string>)
                
                // Component per tags collassabili
                return <CollapsibleTags entries={entries} />
              }
              
              // Supporto legacy: se è ancora un array, renderizza senza colori
              if (isTagsField && Array.isArray(value)) {
                return (
                  <div className="flex flex-wrap gap-1">
                    {value.map((tag, index) => (
                      <Badge key={index} variant="secondary">
                        {String(tag)}
                      </Badge>
                    ))}
                  </div>
                )
              }
              
              // Altrimenti renderizza JSON comprimibile (per metadati)
              const str = JSON.stringify(value, null, 2)
              const maxLen = maxLengths?.[branch.alias] ?? JSON_TRUNCATE_LENGTH
              return (
                <ExpandableCell
                  content={str}
                  maxLength={maxLen}
                  className="font-mono text-xs text-muted-foreground"
                />
              )
            } catch {
              return <div className="text-muted-foreground">Invalid JSON</div>
            }
          },
        })
        break

      default:
        // Fallback per tipi non riconosciuti (stringhe)
        columns.push({
          ...baseColumn,
          cell: ({ row }) => {
            const value = row.original.data[branch.alias]
            if (value == null) return <div>-</div>
            const text = String(value)
            const maxLen = maxLengths?.[branch.alias] ?? TEXT_TRUNCATE_LENGTH
            return (
              <ExpandableCell content={text} maxLength={maxLen} />
            )
          },
        })
    }
  })

  // Colonna Actions (sempre ultima)
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
              <DropdownMenuItem onClick={() => onEdit(entry.id)}>
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
