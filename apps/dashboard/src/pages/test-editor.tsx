// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// TODO: TEMPORARY TESTING PAGE. Disconnect and delete this file before merging to production.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { slugify } from "@beechcms/core"
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, AlertCircle, Monitor, Tablet, Smartphone, Maximize2, Code } from "lucide-react"
import { toast } from "sonner"

import { FieldEdit } from "@/features/fields"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"

// ============================================================================
// SANDBOX SEED CONFIGURATION
// ============================================================================

type EditorBranch = {
  id: string
  alias: string
  label: string
  type: string
  options?: string[]
  numberOptions?: Record<string, unknown>
  [key: string]: unknown
}

const SANDBOX_SEED = {
  slug: "sandbox-test",
  label: "Sandbox Entry",
  labelPlural: "Sandbox Entries",
  displayNameAlias: "title",
  allowPublicRead: true,
  allowDrafts: true,
  branches: [
    { id: "br_01", alias: "title", label: "Titolo Principale (text)", type: "text", requiredOnCreate: true },
    { id: "br_02", alias: "subtitle", label: "Sottotitolo (text)", type: "text" },
    { id: "br_03", alias: "publishedAt", label: "Data di Pubblicazione (date)", type: "date" },
    {
      id: "br_04",
      alias: "price",
      label: "Prezzo (number - currency)",
      type: "number",
      numberOptions: { format: "currency", currency: "EUR", decimals: 2, min: 0 }
    },
    {
      id: "br_05",
      alias: "rating",
      label: "Valutazione (number - rating)",
      type: "number",
      numberOptions: { min: 1, max: 5, step: 0.5, control: "rating" }
    },
    {
      id: "br_06",
      alias: "progress",
      label: "Completamento % (number - slider)",
      type: "number",
      numberOptions: { min: 0, max: 100, step: 5, control: "slider" }
    },
    {
      id: "br_07",
      alias: "featured",
      label: "Metti in Evidenza (boolean)",
      type: "boolean"
    },
    {
      id: "br_08",
      alias: "category",
      label: "Categoria (text - options)",
      type: "text",
      options: ["News", "Guide", "Tutorial", "Review"]
    },
    { id: "br_09", alias: "tags", label: "Tag Correlati (tags)", type: "tags" },
    { id: "br_10", alias: "coverImage", label: "Immagine Copertina (file)", type: "file" },
    { id: "br_11", alias: "gallery", label: "Galleria Immagini (file multiple)", type: "file", multiple: true, format: "asset-list" },
    { id: "br_12", alias: "body", label: "Contenuto Articolo (richtext)", type: "richtext" },
    { id: "br_13", alias: "metadata", label: "Configurazione Avanzata (json)", type: "json" },
    { id: "br_14", alias: "metaTitle", label: "Meta Title SEO (SEO)", type: "text" },
    { id: "br_15", alias: "metaDescription", label: "Meta Description SEO (SEO)", type: "text" }
  ] as EditorBranch[]
}

const INITIAL_POPULATED_DATA: Record<string, unknown> = {
  title: "Benvenuti nel Sandbox di BeechCMS v0.5.0!",
  subtitle: "Un ambiente di prova per testare il layout a colonne e tutti i tipi di campi.",
  publishedAt: "2026-06-03",
  price: 149.99,
  rating: 4.5,
  progress: 80,
  featured: true,
  category: "Tutorial",
  tags: ["React", "TypeScript", "Vite", "TailwindCSS"],
  coverImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1000&auto=format&fit=crop",
  gallery: [
    "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=600&auto=format&fit=crop"
  ],
  body: {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Introduzione al Componente Editor" }]
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Questo è un campo " },
          { type: "text", attrs: { bold: true }, text: "RichText" },
          { type: "text", text: " simulato. Puoi modificarne la visualizzazione a destra o inserire testi formattati." }
        ]
      }
    ]
  },
  metadata: JSON.stringify({
    schema_version: "1.0",
    system_info: {
      agent: "Antigravity",
      environment: "playground"
    }
  }, null, 2),
  metaTitle: "Test Sandbox Editor | BeechCMS",
  metaDescription: "Pagina sandbox per testare in isolamento il layout e tutti i campi del pannello di controllo dell'entry editor."
}

// ============================================================================
// HELPER FUNCTIONS (Similar to entry-editor.tsx)
// ============================================================================

function isSeoBranch(branch: { alias: string }): boolean {
  return branch.alias.startsWith("meta")
}

function createEmptyRichtextDoc(): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  }
}

function createInitialFormData(branches: EditorBranch[]): Record<string, unknown> {
  const initial: Record<string, unknown> = {}
  for (const branch of branches) {
    if (branch.type === "boolean") {
      initial[branch.alias] = false
    } else if (branch.type === "richtext") {
      initial[branch.alias] = createEmptyRichtextDoc()
    } else {
      initial[branch.alias] = ""
    }
  }
  return initial
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatusAndSlugFields({
  status,
  onStatusChange,
  slug,
  onSlugChange,
  isGrid = false,
}: {
  status: string
  onStatusChange: (val: string) => void
  slug: string
  onSlugChange: (val: string) => void
  isGrid?: boolean
}) {
  const content = (
    <>
      <div className="space-y-2">
        <Label htmlFor="entry-status">Stato di Pubblicazione</Label>
        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger id="entry-status" className="w-full">
            <SelectValue placeholder="Seleziona stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Bozza (Draft)</SelectItem>
            <SelectItem value="published">Pubblicato (Published)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="entry-slug">Slug dell'Entry</Label>
        <Input
          id="entry-slug"
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          maxLength={50}
          placeholder="es. il-mio-articolo"
          className="font-mono text-sm"
        />
      </div>
    </>
  )

  if (isGrid) {
    return <div className="grid gap-4 sm:grid-cols-2">{content}</div>
  }
  return <>{content}</>
}

function BranchFieldsGroup({
  branches,
  formData,
  fieldErrors,
  onInputChange,
}: {
  branches: EditorBranch[]
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onInputChange: (alias: string, value: unknown) => void
}) {
  return (
    <>
      {branches.map((branch) => (
        <div key={branch.alias} className="space-y-2">
          <Label htmlFor={branch.alias} className="flex justify-between">
            <span>{branch.label}</span>
            <span className="text-[10px] text-muted-foreground uppercase">{branch.type}</span>
          </Label>
          <FieldEdit
            branch={branch as any}
            value={formData[branch.alias]}
            onChange={(val) => onInputChange(branch.alias, val)}
          />
          {fieldErrors[branch.alias] && (
            <p className="text-xs text-destructive">{fieldErrors[branch.alias]}</p>
          )}
        </div>
      ))}
    </>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function TestEditorPage() {
  const navigate = useNavigate()

  // KNOBS (Playground Toggles)
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("edit")
  const [draftContext, setDraftContext] = React.useState<boolean>(false)
  const [pendingDraftNotice, setPendingDraftNotice] = React.useState<boolean>(true)
  const [viewportWidth, setViewportWidth] = React.useState<"full" | "desktop" | "tablet" | "mobile">("full")
  const [showPayload, setShowPayload] = React.useState<boolean>(true)
  const [simulateErrors, setSimulateErrors] = React.useState<boolean>(false)

  // EDITOR STATES
  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  const [status, setStatus] = React.useState<string>("draft")
  const [slug, setSlug] = React.useState<string>("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = React.useState(false)

  // Initialize/Reset data based on mode
  const resetForm = React.useCallback(() => {
    if (editorMode === "create") {
      setFormData(createInitialFormData(SANDBOX_SEED.branches))
      setStatus("draft")
      setSlug("")
      setSlugTouched(false)
    } else {
      setFormData(INITIAL_POPULATED_DATA)
      setStatus("published")
      setSlug("benvenuti-nel-sandbox")
      setSlugTouched(true)
    }
    setIsDirty(false)
    setFieldErrors({})
  }, [editorMode])

  React.useEffect(() => {
    resetForm()
  }, [resetForm])

  // Handle auto-slugging in create mode
  const titleVal = formData["title"]
  React.useEffect(() => {
    if (editorMode !== "create" || slugTouched || !titleVal) return
    setSlug(slugify(String(titleVal)))
  }, [editorMode, slugTouched, titleVal])

  // Handle validation error simulations
  React.useEffect(() => {
    if (simulateErrors) {
      setFieldErrors({
        title: "Il titolo è obbligatorio e deve contenere almeno 5 caratteri.",
        price: "Il prezzo deve essere maggiore di zero.",
        metadata: "Formato JSON non valido. Controlla le parentesi graffe."
      })
    } else {
      setFieldErrors({})
    }
  }, [simulateErrors])

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    await new Promise((r) => setTimeout(r, 1000))
    setIsSaving(false)
    setIsDirty(false)
    toast.success("Salvataggio simulato con successo!", {
      description: `Inviato payload con slug: "${slug}"`,
    })
    console.log("Simulated Payload Submitted:", { slug, status, data: formData })
  }

  // Filter branches
  const richtextBranch = SANDBOX_SEED.branches.find((b) => b.type === "richtext")!
  const seoBranches = SANDBOX_SEED.branches.filter((b) => b.alias !== "body" && isSeoBranch(b))
  const contentBranches = SANDBOX_SEED.branches.filter((b) => b.alias !== "body" && !isSeoBranch(b))

  // Determine viewport width wrapper style
  const getViewportStyle = () => {
    switch (viewportWidth) {
      case "mobile":
        return "max-w-[400px] border border-border rounded-xl shadow-2xl p-4 mx-auto bg-background min-h-[750px]"
      case "tablet":
        return "max-w-[768px] border border-border rounded-xl shadow-xl p-4 mx-auto bg-background min-h-[900px]"
      case "desktop":
        return "max-w-[1200px] border border-border rounded-xl shadow-md p-4 mx-auto bg-background min-h-[900px]"
      default:
        return "w-full"
    }
  }

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0 bg-muted/20">
            {/* DEV CONTROLS / KNOBS PANEL */}
            <div className="sticky top-0 z-50 border-b border-border bg-background/95 p-4 backdrop-blur">
              <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
                    <AlertCircle className="size-4 text-amber-500" />
                    <span>Sandbox Knobs</span>
                  </div>

                  {/* Mode select */}
                  <div className="flex rounded-md border p-0.5 bg-muted">
                    <button
                      className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                        editorMode === "edit" ? "bg-background shadow-sm" : "hover:text-foreground/80 text-muted-foreground"
                      }`}
                      onClick={() => setEditorMode("edit")}
                    >
                      Modifica (Popolato)
                    </button>
                    <button
                      className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                        editorMode === "create" ? "bg-background shadow-sm" : "hover:text-foreground/80 text-muted-foreground"
                      }`}
                      onClick={() => setEditorMode("create")}
                    >
                      Nuovo (Vuoto)
                    </button>
                  </div>

                  {/* Width simulation */}
                  <div className="flex rounded-md border p-0.5 bg-muted">
                    <button
                      title="Full Screen"
                      className={`p-1.5 rounded-sm transition-colors ${viewportWidth === "full" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
                      onClick={() => setViewportWidth("full")}
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    <button
                      title="Desktop (1200px)"
                      className={`p-1.5 rounded-sm transition-colors ${viewportWidth === "desktop" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
                      onClick={() => setViewportWidth("desktop")}
                    >
                      <Monitor className="size-3.5" />
                    </button>
                    <button
                      title="Tablet (768px)"
                      className={`p-1.5 rounded-sm transition-colors ${viewportWidth === "tablet" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
                      onClick={() => setViewportWidth("tablet")}
                    >
                      <Tablet className="size-3.5" />
                    </button>
                    <button
                      title="Mobile (400px)"
                      className={`p-1.5 rounded-sm transition-colors ${viewportWidth === "mobile" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
                      onClick={() => setViewportWidth("mobile")}
                    >
                      <Smartphone className="size-3.5" />
                    </button>
                  </div>

                  {/* Context notice toggles */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${draftContext ? "bg-amber-100 hover:bg-amber-200 border-amber-300 dark:bg-amber-900/30 dark:border-amber-800" : ""}`}
                    onClick={() => setDraftContext(!draftContext)}
                  >
                    Bozza context: {draftContext ? "ON" : "OFF"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${pendingDraftNotice ? "bg-amber-100 hover:bg-amber-200 border-amber-300 dark:bg-amber-900/30 dark:border-amber-800" : ""}`}
                    onClick={() => setPendingDraftNotice(!pendingDraftNotice)}
                    disabled={draftContext}
                  >
                    Notifica Bozza: {pendingDraftNotice ? "ON" : "OFF"}
                  </Button>

                  {/* Validation errors simulation */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${simulateErrors ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20" : ""}`}
                    onClick={() => setSimulateErrors(!simulateErrors)}
                  >
                    Simula Errori: {simulateErrors ? "ON" : "OFF"}
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm}>
                    <RefreshCw className="mr-1.5 size-3" /> Ripristina
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs ${showPayload ? "bg-primary/10 text-primary border-primary/20" : ""}`}
                    onClick={() => setShowPayload(!showPayload)}
                  >
                    <Code className="mr-1.5 size-3" /> Payload {showPayload ? "Visibile" : "Nascosto"}
                  </Button>
                </div>
              </div>
            </div>

            {/* SANDBOX CONTAINER */}
            <div className="mx-auto w-full max-w-screen-2xl p-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                
                {/* Editor Container */}
                <div className="min-w-0 flex-1">
                  <div className={getViewportStyle()}>
                    {/* Simulated header context */}
                    {viewportWidth !== "full" && (
                      <div className="mb-4 text-center border-b pb-2 text-[11px] font-mono text-muted-foreground uppercase">
                        Simulatore Breakpoint: {viewportWidth} {viewportWidth === "mobile" ? "(400px)" : viewportWidth === "tablet" ? "(768px)" : "(1200px)"}
                      </div>
                    )}

                    <form className="flex flex-1 flex-col" onSubmit={handleSave}>
                      {/* Top bar */}
                      <div className="mb-6 flex items-center justify-between gap-4">
                        <Button type="button" variant="ghost" size="sm" onClick={() => navigate("/")}>
                          <ArrowLeft className="mr-1 size-4" /> Indietro
                        </Button>
                        <h1 className="text-xl font-semibold truncate pb-1">
                          {editorMode === "create" ? "Nuovo Sandbox Entry" : "Modifica Sandbox Entry"}
                        </h1>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="destructive" size="sm" onClick={() => toast.error("Cancellazione simulata!")}>
                            Elimina
                          </Button>
                          <div className="flex items-center">
                            <Button type="submit" disabled={isSaving}>
                              {isSaving ? (
                                <><Loader2 className="mr-2 size-4 animate-spin" />Salvataggio...</>
                              ) : draftContext ? (
                                "Salva Bozza"
                              ) : (
                                "Salva"
                              )}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" disabled={isSaving} className="rounded-l-none px-2 border-l border-l-primary-foreground/20">
                                  <ChevronDown className="size-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => toast.success("Bozza salvata!")}>Salva come bozza</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast.success("Bozza pubblicata!")}>Pubblica bozza</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>

                      {/* Warnings / Notices */}
                      {draftContext && (
                        <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200 animate-pulse">
                          <span>Stai modificando una bozza salvata localmente.</span>
                        </div>
                      )}

                      {!draftContext && pendingDraftNotice && (
                        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
                          <span className="flex-1">Esiste una bozza non pubblicata per questa voce.</span>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                              onClick={() => {
                                setDraftContext(true)
                                toast.success("Caricata la bozza locale nel form!")
                              }}
                            >
                              Modifica Bozza
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                              onClick={() => {
                                setPendingDraftNotice(false)
                                toast.success("Bozza rimossa correttamente.")
                              }}
                            >
                              Scarta Bozza
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Main Split Layout */}
                      <div className="grid flex-1 gap-6 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] md:min-h-0">
                        {/* Main Left Area: RichText */}
                        <div className="min-h-[50vh] flex flex-col rounded-lg border border-border p-4 bg-background">
                          <Label className="mb-2 block font-medium text-sm text-foreground">{richtextBranch.label}</Label>
                          <div className="flex-1 rounded-md border border-input p-2 min-h-[300px]">
                            <FieldEdit
                              branch={richtextBranch as any}
                              value={formData[richtextBranch.alias]}
                              onChange={(val) => handleInputChange(richtextBranch.alias, val)}
                            />
                          </div>
                          {fieldErrors[richtextBranch.alias] && (
                            <p className="text-xs text-destructive mt-1">{fieldErrors[richtextBranch.alias]}</p>
                          )}
                        </div>

                        {/* Right Sidebar */}
                        <aside className="flex flex-col gap-4">
                          <Card>
                            <CardHeader>
                              <CardTitle>Stato & Metadati</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <StatusAndSlugFields
                                status={status}
                                onStatusChange={setStatus}
                                slug={slug}
                                onSlugChange={(v) => {
                                  setSlug(v)
                                  setSlugTouched(true)
                                }}
                              />
                              <BranchFieldsGroup
                                branches={seoBranches}
                                formData={formData}
                                fieldErrors={fieldErrors}
                                onInputChange={handleInputChange}
                              />
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle>Campi Contenuto</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <BranchFieldsGroup
                                branches={contentBranches}
                                formData={formData}
                                fieldErrors={fieldErrors}
                                onInputChange={handleInputChange}
                              />
                            </CardContent>
                          </Card>
                        </aside>
                      </div>
                    </form>
                  </div>
                </div>

                {/* Right side live output JSON viewer */}
                {showPayload && (
                  <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 sticky top-[90px] self-start space-y-4">
                    <Card className="border-primary/20 bg-primary/5">
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-primary">
                          <Code className="size-4" /> Live JSON Payload
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <pre className="text-[11px] font-mono p-4 rounded-b-lg overflow-x-auto max-h-[70vh] bg-black/5 dark:bg-black/40 whitespace-pre-wrap break-all">
                          {JSON.stringify(
                            {
                              slug: slug.trim() || null,
                              status: status.trim() || "draft",
                              isDirty,
                              slugTouched,
                              data: formData
                            },
                            null,
                            2
                          )}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                )}

              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
