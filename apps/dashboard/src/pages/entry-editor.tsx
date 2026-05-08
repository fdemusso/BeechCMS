import * as React from "react"
import { useTranslation } from "react-i18next"
import { useParams, useNavigate, useBlocker } from "react-router-dom"
import { slugify } from "@beechcms/core"
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
  useContentEntry,
  useSaveContent,
} from "@/features/content-management"
import { useActiveSeed } from "@/features/schema/hooks/use-schema"

/** 
 * Allowed slugs: a-z, 0-9, hyphen only. No accents, spaces, or underscores.
 * TODO: Align the regex with slug-utils.ts (API) and move logic to @beechcms/core 
 * to ensure absolute consistency between dashboard and public APIs.
 */
function slugFromText(text: string): string {
  return slugify(text)
}

/** Aliases considered SEO fields (meta title, meta description, etc.). */
function isSeoBranch(branch: { alias: string }): boolean {
  return branch.alias.startsWith("meta")
}

function createEmptyRichtextDoc(): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  }
}

export function EntryEditorPage() {
  const { t } = useTranslation()
  const { slug: schemaSlug, id: entryId } = useParams<{
    slug: string
    id?: string
  }>()
  const navigate = useNavigate()
  const isCreate = !entryId

  const { seed, isLoading: isSeedLoading } = useActiveSeed(schemaSlug)
  
  const { 
    data: entryData, 
    isLoading: isLoadingEntry, 
    error: errorEntryQuery 
  } = useContentEntry(schemaSlug, entryId)

  const { mutateAsync: saveContent, isPending: isSaving } = useSaveContent()

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  const [status, setStatus] = React.useState<string>("draft")
  const [slug, setSlug] = React.useState<string>("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  const hasJustSavedRef = React.useRef(false)

  const blocker = useBlocker(() => isDirty && !hasJustSavedRef.current)

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  // Sync data from query to local state
  React.useEffect(() => {
    if (entryData) {
      setFormData(entryData.data ?? {})
      setStatus(entryData.status ?? "draft")
      setSlug(entryData.slug ?? "")
      setIsDirty(false)
    }
  }, [entryData])

  const errorEntry = errorEntryQuery instanceof Error ? errorEntryQuery.message : null

  // Initialize form for create mode
  React.useEffect(() => {
    if (!seed || !isCreate) return
    const initial: Record<string, unknown> = {}
    seed.branches.forEach((branch) => {
      if (branch.type === "boolean") {
        initial[branch.alias] = false
      } else if (branch.type === "richtext") {
        initial[branch.alias] = createEmptyRichtextDoc()
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
    let text = ""
    if (typeof raw === "string") {
      text = raw
    } else if (raw != null) {
      text = String(raw)
    }
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
        (b) => b.alias !== richtextBranch?.alias && isSeoBranch(b)
      ) ?? [],
    [seed, richtextBranch]
  )
  const contentBranches = React.useMemo(
    () =>
      seed?.branches.filter(
        (b) => b.alias !== richtextBranch?.alias && !isSeoBranch(b)
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

  const validateJsonFields = () => {
    if (!seed) return true

    for (const branch of seed.branches) {
      if (branch.type !== "json") continue
      if (!formData[branch.alias]) continue

      const value = formData[branch.alias]
      if (typeof value !== "string") continue

      try {
        JSON.parse(value)
      } catch {
        toast.error(t("content.editor.jsonError", { field: branch.label }))
        return false
      }
    }

    return true
  }

  const persistEntry = async (
    schemaSlug: string,
    payload: ReturnType<typeof buildPayload>,
    entryIdForUpdate: string | null
  ) => {
    await saveContent({ 
      slug: schemaSlug, 
      id: entryIdForUpdate ?? undefined, 
      data: payload 
    })
    
    if (entryIdForUpdate) {
      toast.success(t("content.editor.savedSuccess"))
    } else {
      toast.success(t("content.editor.createdSuccess"))
    }
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!schemaSlug || !seed) return
    if (!isCreate && !entryId) return
    if (!validateJsonFields()) return

    try {
      const payload = buildPayload()
      const entryIdForUpdate = isCreate ? null : entryId
      await persistEntry(schemaSlug, payload, entryIdForUpdate)
      setIsDirty(false)
      hasJustSavedRef.current = true
      navigate(`/content/${schemaSlug}`)
    } catch (err) {
      const ax = err as AxiosError<{ error?: string }>
      if (ax.response?.status === 409) {
        toast.error(t("content.editor.slugDuplicate"))
        return
      }
      toast.error(
        err instanceof Error ? err.message : t("content.editor.saveError")
      )
    }
  }

  const goBack = () => navigate(schemaSlug ? `/content/${schemaSlug}` : "/")

  if (!schemaSlug) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <p className="text-destructive">{t("content.editor.slugMissing")}</p>
      </div>
    )
  }

  if (!seed && !isSeedLoading) {
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
                    {t("content.editor.seedNotFound", { slug: schemaSlug })}
                  </p>
                  <Button variant="outline" className="mt-2" onClick={goBack}>
                    {t("content.editor.back")}
                  </Button>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  if (isSeedLoading || !seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <Skeleton className="h-10 w-48" />
                <div className="grid flex-1 gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
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
                <div className="grid flex-1 gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
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
                    Back
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
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4">
              <form
                className="content-area-inner flex flex-1 flex-col"
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
                    {t("content.editor.back")}
                  </Button>
                  <h1 className="text-xl font-semibold truncate pb-1">
                    {isCreate ? t("content.editor.newEntry", { label: seed.label }) : t("content.editor.editEntry", { label: seed.label })}
                  </h1>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        {t("content.editor.saving")}
                      </>
                    ) : (
                      t("content.editor.save")
                    )}
                  </Button>
                </div>

                {hasRichtext ? (
                  <div className="grid flex-1 gap-6 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] md:min-h-0">
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
                    <aside className="flex flex-col gap-4 md:sticky md:top-[calc(var(--header-height)+1rem)] md:self-start">
                      <Card>
                        <CardHeader>
                          <CardTitle>{t("content.editor.metadataSeo")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="entry-status">{t("content.editor.status")}</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => { setStatus(val); setIsDirty(true) }}
                            >
                              <SelectTrigger id="entry-status" className="w-full">
                                <SelectValue placeholder={t("content.editor.status")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">{t("content.editor.draft")}</SelectItem>
                                <SelectItem value="published">{t("content.editor.published")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="entry-slug">{t("content.editor.slug")}</Label>
                              <Input
                                id="entry-slug"
                                value={slug}
                                onChange={(e) => {
                                  setSlug(slugify(e.target.value))
                                  setSlugTouched(true)
                                  setIsDirty(true)
                                }}
                                maxLength={15}
                                placeholder={t("content.editor.slugPlaceholder")}
                                className="font-mono text-sm"
                              />
                          </div>
                          {seoBranches.map((branch) => (
                            <div key={branch.alias} className="space-y-2">
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
                          <CardTitle>{t("content.editor.content")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {contentBranches.map((branch) => (
                            <div key={branch.alias} className="space-y-2">
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
                  /* Layout a colonna singola centrata: nessuna area main.
                     max-w cresce progressivamente con la viewport per sfruttare
                     lo spazio su 16:9 e 21:9 senza creare linee troppo lunghe. */
                  <div className="mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("content.editor.publication")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="entry-status">{t("content.editor.status")}</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => { setStatus(val); setIsDirty(true) }}
                            >
                              <SelectTrigger id="entry-status" className="w-full">
                                <SelectValue placeholder={t("content.editor.status")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">{t("content.editor.draft")}</SelectItem>
                                <SelectItem value="published">{t("content.editor.published")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="entry-slug">{t("content.editor.slug")}</Label>
                            <Input
                              id="entry-slug"
                              value={slug}
                              onChange={(e) => {
                                setSlug(slugify(e.target.value))
                                setSlugTouched(true)
                                setIsDirty(true)
                              }}
                              maxLength={15}
                              placeholder={t("content.editor.slugPlaceholder")}
                              className="font-mono text-sm"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {seoBranches.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>{t("content.editor.metadataSeo")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {seoBranches.map((branch) => (
                            <div key={branch.alias} className="space-y-2">
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
                        <CardTitle>{t("content.editor.content")}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {contentBranches.map((branch) => (
                          <div key={branch.alias} className="space-y-2">
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
            <AlertDialogTitle>{t("content.editor.unsavedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("content.editor.unsavedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("content.editor.stay")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              {t("content.editor.exitWithout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
