import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { getSeed } from "@beech/core"
import type { SortingState } from "@tanstack/react-table"
import type { ColumnFiltersState } from "@tanstack/react-table"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DataTable } from "@/components/ui/data-table"
import { ContentDeleteDialog } from "@/components/content-delete-dialog"
import {
  ContentToolbar,
  type UserViewInstance,
  type ToolbarFiltersState,
} from "@/components/content-toolbar"
import {
  fetchContentList,
  deleteContent,
} from "@/lib/content-api"
import {
  generateColumns,
  computeMaxLengths,
  type ContentEntry,
} from "@/lib/dynamic-columns"

export function ContentListPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [data, setData] = React.useState<ContentEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [entryToDelete, setEntryToDelete] = React.useState<string | null>(null)

  // Vista attiva (per ora solo UI-state; la DataTable rimane sempre visibile)
  // TODO: mostrare viste alternative (Grid/Kanban/Chart) in base ad activeViewId.
  const [activeViewId, setActiveViewId] = React.useState("table")

  // Ricerca tabella (collegata alla barra di ricerca nella toolbar)
  const [tableSearch, setTableSearch] = React.useState("")

  // Ordinamento tabella (controllato, singola colonna)
  const [sorting, setSorting] = React.useState<SortingState>([])

  // Filtri tabella (Notion-like): 1 pill per colonna, più condizioni AND
  const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>(
    {}
  )

  // Recupera il seed
  const seed = slug ? getSeed(slug) : null

  // Viste disponibili per il seed corrente (per ora solo una vista tabellare di default).
  // TODO: caricare e salvare la configurazione delle viste a livello di utente (quando esisterà un sistema di preferenze utente).
  const [views, setViews] = React.useState<UserViewInstance[]>(() => [
    {
      id: "table",
      label: "Tabella",
      type: "table",
      enabledTools: [
        "filter",
        "sort",
        "automation",
        "search",
        "settings",
        "create",
      ],
    },
  ])

  const loadData = React.useCallback(async () => {
    if (!slug) return

    setIsLoading(true)
    setError(null)

    try {
      // Dati da GET /api/content/:slug (id, schema_slug, slug, status, data, created_at, updated_at)
      // TODO: passare al fetch i parametri di filtro/sort/search quando implementati (configurazione per view).
      const entries = await fetchContentList(slug)
      setData(entries)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore durante il caricamento dei dati"
      )
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  // Fetch data iniziale
  React.useEffect(() => {
    if (!slug || !seed) {
      setError(
        slug
          ? `Seed "${slug}" non trovato nel registro`
          : "Slug non specificato"
      )
      setIsLoading(false)
      return
    }

    loadData()
  }, [slug, seed, loadData])

  const handleEdit = React.useCallback(
    (id: string) => {
      if (slug) navigate(`/content/${slug}/${id}`)
    },
    [slug, navigate]
  )

  const handleDelete = React.useCallback((id: string) => {
    setEntryToDelete(id)
    setDeleteDialogOpen(true)
  }, [])

  const handleCreate = React.useCallback(() => {
    if (slug) navigate(`/content/${slug}/create`)
  }, [slug, navigate])

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryToDelete) return

    await deleteContent(slug, entryToDelete)
    await loadData()
  }, [slug, entryToDelete, loadData])

  const ROWS_PER_PAGE = 10

  // Lunghezza max per colonna (dalla prima pagina) per troncamento consistente
  const maxLengths = React.useMemo(() => {
    if (!seed || data.length === 0) return undefined
    return computeMaxLengths(data, seed, ROWS_PER_PAGE)
  }, [seed, data])

  // Genera colonne
  const columns = React.useMemo(() => {
    if (!seed) return []
    return generateColumns(seed, handleEdit, handleDelete, maxLengths)
  }, [seed, handleEdit, handleDelete, maxLengths])

  const singleSort = sorting[0]

  const availableTagsByColumnId = React.useMemo(() => {
    if (!seed) return {}
    const tagBranches = seed.branches.filter(
      (b) => b.type === "json" && b.alias.toLowerCase().includes("tag")
    )
    if (tagBranches.length === 0) return {}

    const result: Record<string, string[]> = {}
    for (const branch of tagBranches) {
      // Parte da branch.options (vocabolario statico del seed), se presenti
      const set = new Set<string>(branch.options ?? [])

      // Aggiunge i tag trovati nelle entry esistenti (vocabolario dinamico)
      for (const row of data) {
        const raw = row.data[branch.alias]
        const obj =
          typeof raw === "string"
            ? (() => {
                try {
                  return JSON.parse(raw) as unknown
                } catch {
                  return null
                }
              })()
            : raw
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          for (const key of Object.keys(obj as Record<string, unknown>)) {
            if (key) set.add(key)
          }
        }
      }
      result[branch.alias] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, "it")
      )
    }
    return result
  }, [data, seed])

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const next: ColumnFiltersState = []
    for (const [columnId, group] of Object.entries(toolbarFilters)) {
      // Passiamo al table state solo i gruppi che hanno almeno 1 condizione “effettiva”.
      const hasEffectiveCondition = group.conditions.some((c) => {
        if (c.op === "is_empty" || c.op === "is_not_empty") return true
        if (c.op === "contains") return typeof c.value === "string" && c.value.trim().length > 0
        if (c.op === "eq") {
          if (group.type === "boolean") return c.value === true || c.value === false
          if (group.type === "number") return typeof c.value === "number" && !Number.isNaN(c.value)
          if (group.type === "date") return typeof c.value === "string" && c.value.trim().length > 0
          if (group.type === "select") return typeof c.value === "string" && c.value.trim().length > 0
          return typeof c.value === "string" && c.value.trim().length > 0
        }
        if (["gt", "gte", "lt", "lte"].includes(c.op)) {
          if (group.type === "number") return typeof c.value === "number" && !Number.isNaN(c.value)
          if (group.type === "date") return typeof c.value === "string" && c.value.trim().length > 0
        }
        return false
      })
      if (!hasEffectiveCondition) continue
      next.push({ id: columnId, value: group })
    }
    return next
  }, [toolbarFilters])

  const handleTableSortingChange = React.useCallback(
    (next: SortingState) => {
      if (!next.length) {
        setSorting([])
        return
      }
      const [first] = next
      setSorting([{ id: first.id, desc: first.desc ?? false }])
    },
    []
  )

  const handleToolbarSortChange = React.useCallback(
    (state: { columnId: string | null; desc: boolean }) => {
      if (!state.columnId) {
        setSorting([])
        return
      }
      setSorting([{ id: state.columnId, desc: state.desc }])
    },
    []
  )
  const handleRenameView = React.useCallback(
    (viewId: string, label: string) => {
      setViews((prev) =>
        prev.map((view) =>
          view.id === viewId ? { ...view, label } : view
        )
      )
    },
    []
  )
  
  // Colonne nascoste di default: id (troppo lungo), json metadata/metadati
  const initialHiddenColumns = React.useMemo(() => {
    const hidden: string[] = ["id"]
    if (!seed) return hidden
    const metaAliases = seed.branches
      .filter(
        (b) =>
          b.type === "json" &&
          (b.alias.toLowerCase().includes("metadata") ||
            b.alias.toLowerCase().includes("metadati"))
      )
      .map((b) => b.alias)
    return [...hidden, ...metaAliases]
  }, [seed])

  // Se non c'è seed, mostra errore
  if (!seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="mx-auto w-full max-w-screen-2xl">
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <h2 className="text-lg font-semibold text-destructive">
                      Errore
                    </h2>
                    <p className="text-sm text-destructive/90">
                      {error || `Seed "${slug}" non trovato`}
                    </p>
                  </div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="mx-auto w-full max-w-screen-2xl">
                {/* Header con titolo */}
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold">{seed.labelPlural ?? seed.label}</h1>
                  <p className="text-muted-foreground text-sm">
                    Gestisci i contenuti di tipo "{seed.slug}"
                  </p>
                </div>

                {/* Toolbar viste, strumenti e contenuto (tabella + controlli) */}
                <ContentToolbar
                  seed={seed}
                  views={views}
                  activeViewId={activeViewId}
                  onChangeView={setActiveViewId}
                  onRenameView={handleRenameView}
                  onCreate={handleCreate}
                  searchValue={tableSearch}
                  onSearchChange={setTableSearch}
                  sortState={{
                    columnId: singleSort?.id ?? null,
                    desc: singleSort?.desc ?? true,
                  }}
                  onSortChange={handleToolbarSortChange}
                  filters={toolbarFilters}
                  onFiltersChange={setToolbarFilters}
                  availableTagsByColumnId={availableTagsByColumnId}
                >
                  {error && (
                    <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  )}
                  {isLoading && !error && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-muted-foreground">Caricamento...</div>
                    </div>
                  )}
                  {!isLoading && !error && (
                    <DataTable
                      columns={columns}
                      data={data}
                      initialHiddenColumns={initialHiddenColumns}
                      globalFilter={tableSearch}
                      onGlobalFilterChange={setTableSearch}
                      sorting={sorting}
                      onSortingChange={handleTableSortingChange}
                      columnFilters={columnFilters}
                    />
                  )}
                </ContentToolbar>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Modal Delete */}
      <ContentDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        seed={seed}
        entryId={entryToDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
