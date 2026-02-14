import * as React from "react"
import { useParams } from "react-router-dom"
import { getSeed } from "@beech/core"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { DataTable } from "@/components/ui/data-table"
import { ContentEditDialog } from "@/components/content-edit-dialog"
import { ContentDeleteDialog } from "@/components/content-delete-dialog"
import {
  fetchContentList,
  createContent,
  updateContent,
  deleteContent,
} from "@/lib/content-api"
import { generateColumns, type ContentEntry } from "@/lib/dynamic-columns"

export function ContentListPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = React.useState<ContentEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [selectedEntry, setSelectedEntry] = React.useState<ContentEntry | null>(
    null
  )
  const [entryToDelete, setEntryToDelete] = React.useState<string | null>(null)

  // Recupera il seed
  const seed = slug ? getSeed(slug) : null

  const loadData = React.useCallback(async () => {
    if (!slug) return

    setIsLoading(true)
    setError(null)

    try {
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

  // Handlers per le azioni
  const handleEdit = React.useCallback((id: string) => {
    const entry = data.find((item) => item.id === id)
    setSelectedEntry(entry || null)
    setEditDialogOpen(true)
  }, [data])

  const handleDelete = React.useCallback((id: string) => {
    setEntryToDelete(id)
    setDeleteDialogOpen(true)
  }, [])

  const handleCreate = React.useCallback(() => {
    setSelectedEntry(null)
    setEditDialogOpen(true)
  }, [])

  const handleSave = React.useCallback(async (formData: Record<string, unknown>) => {
    if (!slug) return

    if (selectedEntry) {
      // Aggiornamento
      await updateContent(slug, selectedEntry.id, formData)
    } else {
      // Creazione
      await createContent(slug, formData)
    }

    // Ricarica i dati
    await loadData()
  }, [slug, selectedEntry, loadData])

  const handleConfirmDelete = React.useCallback(async () => {
    if (!slug || !entryToDelete) return

    await deleteContent(slug, entryToDelete)
    await loadData()
  }, [slug, entryToDelete, loadData])

  // Genera colonne
  const columns = React.useMemo(() => {
    if (!seed) return []
    return generateColumns(seed, handleEdit, handleDelete)
  }, [seed, handleEdit, handleDelete])
  
  // Identifica colonne da nascondere di default (metadata, metadati, etc.)
  const initialHiddenColumns = React.useMemo(() => {
    if (!seed) return []
    return seed.branches
      .filter((branch) => 
        branch.type === "json" && 
        (branch.alias.toLowerCase().includes("metadata") || 
         branch.alias.toLowerCase().includes("metadati"))
      )
      .map((branch) => branch.alias)
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
                {/* Header con titolo e pulsante Crea */}
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold">{seed.label}</h1>
                    <p className="text-muted-foreground text-sm">
                      Gestisci i contenuti di tipo "{seed.slug}"
                    </p>
                  </div>
                  <Button onClick={handleCreate}>
                    <Plus />
                    Crea nuovo
                  </Button>
                </div>

                {/* Errore */}
                {error && (
                  <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4">
                    <p className="text-sm text-destructive">{error}</p>
                  </div>
                )}

                {/* Loading */}
                {isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-muted-foreground">Caricamento...</div>
                  </div>
                )}

                {/* Data Table */}
                {!isLoading && !error && (
                  <DataTable 
                    columns={columns} 
                    data={data}
                    initialHiddenColumns={initialHiddenColumns}
                  />
                )}
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Modal Edit/Create */}
      <ContentEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        seed={seed}
        entry={selectedEntry}
        onSave={handleSave}
      />

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
