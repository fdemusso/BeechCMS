import * as React from "react"
import { useParams, useNavigate, useBlocker } from "react-router-dom"
import { getSeed } from "@beech/core"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { AxiosError } from "axios"

import { FieldEdit } from "@/components/fields"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import {
  fetchContentById,
  createContent,
  updateContent,
} from "@/lib/content-api"
import type { ContentEntry } from "@/lib/dynamic-columns"

/** Slug ammessi: solo a-z, 0-9, trattino. Niente accenti/spazi/underscore. */
function slugFromText(text: string): string {
  const normalized = String(text ?? "")
    .toLowerCase()
    .trim()
  const withHyphens = normalized.replace(/[^a-z0-9]+/g, "-")
  return withHyphens.replace(/^-+|-+$/g, "")
}

/** Alias considerati campi SEO (meta titolo, meta descrizione, ecc.). */
function isSeoBranch(branch: { alias: string }): boolean {
  return branch.alias.startsWith("meta")
}

export function EntryEditorPage() {
  const { slug: schemaSlug, id: entryId } = useParams<{
    slug: string
    id?: string
  }>()
  const navigate = useNavigate()
  const isCreate = !entryId

  const seed = schemaSlug ? getSeed(schemaSlug) : null
  const [isLoadingEntry, setIsLoadingEntry] = React.useState(!!entryId)
  const [errorEntry, setErrorEntry] = React.useState<string | null>(null)

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  const [status, setStatus] = React.useState<string>("draft")
  const [slug, setSlug] = React.useState<string>("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  const hasJustSavedRef = React.useRef(false)

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !hasJustSavedRef.current
  )

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  // Fetch entry in edit mode
  React.useEffect(() => {
    if (!schemaSlug || !entryId || !seed) return

    let cancelled = false
    setIsLoadingEntry(true)
    setErrorEntry(null)

    fetchContentById(schemaSlug, entryId)
      .then((data: ContentEntry) => {
        if (!cancelled) {
          setFormData(data.data ?? {})
          setStatus(data.status ?? "draft")
          setSlug(data.slug ?? "")
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorEntry(
            err instanceof Error ? err.message : "Errore nel caricamento"
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEntry(false)
      })

    return () => {
      cancelled = true
    }
  }, [schemaSlug, entryId, seed])

  // Initialize form for create mode
  React.useEffect(() => {
    if (!seed || !isCreate) return
    const initial: Record<string, unknown> = {}
    seed.branches.forEach((branch) => {
      if (branch.type === "boolean") {
        initial[branch.alias] = false
      } else {
        initial[branch.alias] = ""
      }
    })
    setFormData(initial)
    setStatus("draft")
    setSlug("")
    setSlugTouched(false)
  }, [seed, isCreate])

  // Auto-slug from first text field (create only, unless user touched slug)
  const firstTextAlias = React.useMemo(
    () => seed?.branches.find((b) => b.type === "text")?.alias,
    [seed]
  )
  const firstTextValue = firstTextAlias ? formData[firstTextAlias] : undefined
  React.useEffect(() => {
    if (!isCreate || slugTouched || firstTextAlias == null) return
    const raw = firstTextValue
    const text = typeof raw === "string" ? raw : raw != null ? String(raw) : ""
    const next = slugFromText(text)
    setSlug(next)
  }, [isCreate, slugTouched, firstTextAlias, firstTextValue])

  const richtextBranch = React.useMemo(
    () => seed?.branches.find((b) => b.type === "richtext"),
    [seed]
  )
  const hasRichtext = !!richtextBranch
  const seoBranches = React.useMemo(
    () =>
      seed?.branches.filter(
        (b) => b.id !== richtextBranch?.id && isSeoBranch(b)
      ) ?? [],
    [seed, richtextBranch]
  )
  const contentBranches = React.useMemo(
    () =>
      seed?.branches.filter(
        (b) => b.id !== richtextBranch?.id && !isSeoBranch(b)
      ) ?? [],
    [seed, richtextBranch]
  )

  const buildPayload = React.useCallback(() => {
    const processed: Record<string, unknown> = {}
    if (!seed) return processed
    for (const branch of seed.branches) {
      if (branch.type === "json" && formData[branch.alias]) {
        const value = formData[branch.alias]
        if (typeof value === "string") {
          try {
            processed[branch.alias] = JSON.parse(value)
          } catch {
            processed[branch.alias] = value
          }
        } else {
          processed[branch.alias] = value
        }
      } else {
        processed[branch.alias] = formData[branch.alias]
      }
    }
    return {
      slug: slug.trim() || null,
      status: status.trim() || "draft",
      ...processed,
    }
  }, [seed, formData, slug, status])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schemaSlug || !seed) return

    // Validate JSON fields
    for (const branch of seed.branches) {
      if (branch.type === "json" && formData[branch.alias]) {
        const value = formData[branch.alias]
        if (typeof value === "string") {
          try {
            JSON.parse(value)
          } catch {
            toast.error(`Il campo "${branch.label}" deve contenere JSON valido`)
            return
          }
        }
      }
    }

    setIsSaving(true)
    try {
      const payload = buildPayload()
      if (isCreate) {
        await createContent(schemaSlug, payload)
        toast.success("Entry creata")
      } else {
        await updateContent(schemaSlug, entryId!, payload)
        toast.success("Modifiche salvate")
      }
      setIsDirty(false)
      hasJustSavedRef.current = true
      navigate(`/content/${schemaSlug}`)
    } catch (err) {
      const ax = err as AxiosError<{ error?: string }>
      if (ax.response?.status === 409) {
        toast.error("Slug già esistente per questo schema")
        return
      }
      toast.error(
        err instanceof Error ? err.message : "Errore durante il salvataggio"
      )
    } finally {
      setIsSaving(false)
    }
  }

  const goBack = () => navigate(schemaSlug ? `/content/${schemaSlug}` : "/")

  if (!schemaSlug) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <p className="text-destructive">Slug non specificato.</p>
      </div>
    )
  }

  if (!seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                  <p className="text-destructive">
                    Seed &quot;{schemaSlug}&quot; non trovato.
                  </p>
                  <Button variant="outline" className="mt-2" onClick={goBack}>
                    Indietro
                  </Button>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  if (entryId && isLoadingEntry) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <Skeleton className="h-10 w-48" />
                <div className="grid flex-1 gap-4 md:grid-cols-[1fr_320px]">
                  <Skeleton className="min-h-[70vh] rounded-lg" />
                  <Skeleton className="h-64 rounded-lg" />
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  if (entryId && errorEntry) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                  <p className="text-destructive">{errorEntry}</p>
                  <Button variant="outline" className="mt-2" onClick={goBack}>
                    Indietro
                  </Button>
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
              <form
                className="mx-auto w-full max-w-screen-2xl flex flex-1 flex-col"
                onSubmit={handleSubmit}
              >
                {/* Top bar */}
                <div className="mb-4 flex items-center justify-between gap-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={goBack}
                  >
                    <ArrowLeft className="mr-1 size-4" />
                    Indietro
                  </Button>
                  <h1 className="text-xl font-semibold truncate pb-1">
                    {isCreate ? `Nuovo ${seed.label}` : `Modifica ${seed.label}`}
                  </h1>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Salvataggio...
                      </>
                    ) : (
                      "Salva"
                    )}
                  </Button>
                </div>

                {hasRichtext ? (
                  <div className="grid flex-1 gap-6 md:grid-cols-[1fr_320px] md:min-h-0">
                    {/* Main area (70%) - solo richtext, nessun placeholder */}
                    <div className="min-h-[70vh] flex flex-col rounded-lg border-0">
                      <FieldEdit
                        branch={richtextBranch}
                        value={formData[richtextBranch.alias]}
                        onChange={(val) =>
                          handleInputChange(richtextBranch.alias, val)
                        }
                      />
                    </div>

                    {/* Sidebar: Metadati / SEO + Contenuto */}
                    <aside className="flex flex-col gap-4 md:sticky md:top-4 md:self-start">
                      <Card>
                        <CardHeader>
                          <CardTitle>Metadati / SEO</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="entry-status">Stato</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => { setStatus(val); setIsDirty(true) }}
                            >
                              <SelectTrigger id="entry-status" className="w-full">
                                <SelectValue placeholder="Stato" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Bozza</SelectItem>
                                <SelectItem value="published">Pubblicato</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="entry-slug">Slug (URL)</Label>
                            <Input
                              id="entry-slug"
                              value={slug}
                              onChange={(e) => {
                                setSlug(e.target.value)
                                setSlugTouched(true)
                                setIsDirty(true)
                              }}
                              placeholder="es. mio-articolo"
                              className="font-mono text-sm"
                            />
                          </div>
                          {seoBranches.map((branch) => (
                            <div key={branch.id} className="space-y-2">
                              <Label htmlFor={branch.alias}>{branch.label}</Label>
                              <FieldEdit
                                branch={branch}
                                value={formData[branch.alias]}
                                onChange={(val) =>
                                  handleInputChange(branch.alias, val)
                                }
                              />
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Contenuto</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {contentBranches.map((branch) => (
                            <div key={branch.id} className="space-y-2">
                              <Label htmlFor={branch.alias}>{branch.label}</Label>
                              <FieldEdit
                                branch={branch}
                                value={formData[branch.alias]}
                                onChange={(val) =>
                                  handleInputChange(branch.alias, val)
                                }
                              />
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </aside>
                  </div>
                ) : (
                  /* Layout a colonna singola centrata: nessuna area main */
                  <div className="mx-auto w-full max-w-2xl space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Pubblicazione</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="entry-status">Stato</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => { setStatus(val); setIsDirty(true) }}
                            >
                              <SelectTrigger id="entry-status" className="w-full">
                                <SelectValue placeholder="Stato" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Bozza</SelectItem>
                                <SelectItem value="published">Pubblicato</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="entry-slug">Slug (URL)</Label>
                            <Input
                              id="entry-slug"
                              value={slug}
                              onChange={(e) => {
                                setSlug(e.target.value)
                                setSlugTouched(true)
                                setIsDirty(true)
                              }}
                              placeholder="es. mio-articolo"
                              className="font-mono text-sm"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {seoBranches.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Metadati / SEO</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {seoBranches.map((branch) => (
                            <div key={branch.id} className="space-y-2">
                              <Label htmlFor={branch.alias}>{branch.label}</Label>
                              <FieldEdit
                                branch={branch}
                                value={formData[branch.alias]}
                                onChange={(val) =>
                                  handleInputChange(branch.alias, val)
                                }
                              />
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle>Contenuto</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {contentBranches.map((branch) => (
                          <div key={branch.id} className="space-y-2">
                            <Label htmlFor={branch.alias}>{branch.label}</Label>
                            <FieldEdit
                              branch={branch}
                              value={formData[branch.alias]}
                              onChange={(val) =>
                                handleInputChange(branch.alias, val)
                              }
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </form>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      {/* Avviso modifiche non salvate */}
      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Hai delle modifiche non salvate. Se esci ora andranno perse. Vuoi
              continuare?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Rimani
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Esci senza salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
