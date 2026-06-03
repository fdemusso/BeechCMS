// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useParams, useNavigate, useBlocker, useLocation } from "react-router-dom"
import { slugify } from "@beechcms/core"
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { AxiosError } from "axios"

import { FieldEdit } from "@/features/fields"
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
import { Skeleton } from "@/components/ui/skeleton"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import {
  useContentEntry,
  useSaveContent,
  useDraftEntry,
  useSaveDraft,
  usePublishDraft,
  useDiscardDraft,
  useDeleteContent,
} from "@/features/content-management"
import { useActiveSeed } from "@/features/schema"
import { ReferencedByPanel } from "@/features/backrefs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Trash2 } from "lucide-react"

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type EditorBranch = {
  alias: string
  label: string
  type: string
  [key: string]: unknown
}

// ============================================================================
// UTILITY FUNCTIONS & BUSINESS LOGIC (Pure and decoupled)
// ============================================================================

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

/**
 * Deterministically generates the initial form state for a new entry.
 */
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

/**
 * Linearly extracts the string to convert into a slug from the raw field value.
 */
function deriveAutoSlugText(rawValue: unknown): string {
  if (typeof rawValue === "string") {
    return rawValue
  }
  if (rawValue != null) {
    return String(rawValue)
  }
  return ""
}

/**
 * Prepares the submission payload, normalizing values and parsing JSON fields.
 */
function prepareSubmissionPayload({
  branches,
  formData,
  slug,
  status,
}: {
  branches: EditorBranch[]
  formData: Record<string, unknown>
  slug: string
  status: string
}): Record<string, unknown> {
  const processed: Record<string, unknown> = {}

  for (const branch of branches) {
    const value = formData[branch.alias]
    if (branch.type === "json" && value) {
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
      processed[branch.alias] = value
    }
  }

  return {
    slug: slug.trim() || null,
    status: status.trim() || "draft",
    ...processed,
  }
}

/**
 * Purely validates the syntax correctness of strings intended for JSON fields.
 */
function validateEntryJsonFields(
  branches: EditorBranch[],
  formData: Record<string, unknown>
): { isValid: true } | { isValid: false; errorFieldLabel: string } {
  for (const branch of branches) {
    if (branch.type !== "json") continue
    const value = formData[branch.alias]
    if (!value || typeof value !== "string") continue

    try {
      JSON.parse(value)
    } catch {
      return { isValid: false, errorFieldLabel: branch.label }
    }
  }
  return { isValid: true }
}

// ============================================================================
// UI SUB-COMPONENTS (To eliminate layout and field duplication)
// ============================================================================

/**
 * Wrapper encapsulating the page shell structure (Sidebar, Header, Inset).
 */
function EditorShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4">
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}

type StatusAndSlugFieldsProps = {
  status: string
  onStatusChange: (val: string) => void
  slug: string
  onSlugChange: (val: string) => void
  isGrid?: boolean
}

/**
 * Reusable section containing Status selection and Slug input controls.
 */
function StatusAndSlugFields({
  status,
  onStatusChange,
  slug,
  onSlugChange,
  isGrid = false,
}: StatusAndSlugFieldsProps) {
  const { t } = useTranslation()

  const content = (
    <>
      <div className="space-y-2">
        <Label htmlFor="entry-status">{t("content.editor.status")}</Label>
        <Select value={status} onValueChange={onStatusChange}>
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
          onChange={(e) => onSlugChange(e.target.value)}
          maxLength={15}
          placeholder={t("content.editor.slugPlaceholder")}
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

type BranchFieldsGroupProps = {
  branches: EditorBranch[]
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onInputChange: (alias: string, value: unknown) => void
}

/**
 * Maps and renders a centralized list of branches (SEO or Content).
 */
function BranchFieldsGroup({
  branches,
  formData,
  fieldErrors,
  onInputChange,
}: BranchFieldsGroupProps) {
  return (
    <>
      {branches.map((branch) => (
        <div key={branch.alias} className="space-y-2">
          <Label htmlFor={branch.alias}>{branch.label}</Label>
          {/* Use 'as any' for the branch prop to ensure backward compatibility with FieldEdit signature */}
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

type SplitLayoutProps = {
  richtextBranch: EditorBranch
  seoBranches: EditorBranch[]
  contentBranches: EditorBranch[]
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  status: string
  slug: string
  onInputChange: (alias: string, value: unknown) => void
  onStatusChange: (val: string) => void
  onSlugChange: (val: string) => void
}

/**
 * Two-column layout used when a main richtext field is present.
 */
function SplitEditorLayout({
  richtextBranch,
  seoBranches,
  contentBranches,
  formData,
  fieldErrors,
  status,
  slug,
  onInputChange,
  onStatusChange,
  onSlugChange,
}: SplitLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] md:min-h-0">
      {/* Main area (70%) - richtext only */}
      <div className="min-h-[70vh] flex flex-col rounded-lg border-0">
        <FieldEdit
          branch={richtextBranch as any}
          value={formData[richtextBranch.alias]}
          onChange={(val) => onInputChange(richtextBranch.alias, val)}
        />
        {fieldErrors[richtextBranch.alias] && (
          <p className="text-xs text-destructive mt-1">
            {fieldErrors[richtextBranch.alias]}
          </p>
        )}
      </div>

      {/* Sidebar: Metadata / SEO + Content */}
      <aside className="flex flex-col gap-4 md:sticky md:top-[calc(var(--header-height)+1rem)] md:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("content.editor.metadataSeo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusAndSlugFields
              status={status}
              onStatusChange={onStatusChange}
              slug={slug}
              onSlugChange={onSlugChange}
            />
            <BranchFieldsGroup
              branches={seoBranches}
              formData={formData}
              fieldErrors={fieldErrors}
              onInputChange={onInputChange}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("content.editor.content")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BranchFieldsGroup
              branches={contentBranches}
              formData={formData}
              fieldErrors={fieldErrors}
              onInputChange={onInputChange}
            />
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

type SingleColumnLayoutProps = {
  seoBranches: EditorBranch[]
  contentBranches: EditorBranch[]
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  status: string
  slug: string
  onInputChange: (alias: string, value: unknown) => void
  onStatusChange: (val: string) => void
  onSlugChange: (val: string) => void
}

/**
 * Centered single-column layout used for schemas without richtext.
 */
function SingleColumnEditorLayout({
  seoBranches,
  contentBranches,
  formData,
  fieldErrors,
  status,
  slug,
  onInputChange,
  onStatusChange,
  onSlugChange,
}: SingleColumnLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("content.editor.publication")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusAndSlugFields
            status={status}
            onStatusChange={onStatusChange}
            slug={slug}
            onSlugChange={onSlugChange}
            isGrid
          />
        </CardContent>
      </Card>

      {seoBranches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("content.editor.metadataSeo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BranchFieldsGroup
              branches={seoBranches}
              formData={formData}
              fieldErrors={fieldErrors}
              onInputChange={onInputChange}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("content.editor.content")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <BranchFieldsGroup
            branches={contentBranches}
            formData={formData}
            fieldErrors={fieldErrors}
            onInputChange={onInputChange}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function EntryEditorPage() {
  const { t } = useTranslation()
  const { slug: schemaSlug, id: entryId } = useParams<{
    slug: string
    id?: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isDraftContext = !!(location.state as { isDraftContext?: boolean } | null)?.isDraftContext
  const isCreate = !entryId

  const { seed, isLoading: isSeedLoading } = useActiveSeed(schemaSlug)

  const {
    data: entryData,
    isLoading: isLoadingEntry,
    error: errorEntryQuery,
  } = useContentEntry(schemaSlug, entryId)

  const { mutateAsync: saveContent, isPending: isSaving } = useSaveContent()
  const { mutateAsync: deleteContent, isPending: isDeleting } = useDeleteContent()

  const hasPendingDraftNotice = !isCreate && entryData?.has_pending_draft === true

  // isDraftContext: user navigated from the Drafts list (router state carries the flag).
  // effectiveDraftContext: full condition — draft context is only meaningful on edit-mode
  // entries belonging to a draft-enabled seed.
  const effectiveDraftContext = isDraftContext && !isCreate && !!entryId && !!seed?.allowDrafts

  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false)

  const { data: draftData } = useDraftEntry(
    (hasPendingDraftNotice || effectiveDraftContext) ? schemaSlug : undefined,
    (hasPendingDraftNotice || effectiveDraftContext) ? entryId : undefined
  )

  const { mutateAsync: saveDraft, isPending: isSavingDraft } = useSaveDraft()
  const { mutateAsync: publishDraft, isPending: isPublishing } = usePublishDraft()
  const { mutateAsync: discardDraft, isPending: isDiscarding } = useDiscardDraft()

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  const [status, setStatus] = React.useState<string>("draft")
  const [slug, setSlug] = React.useState<string>("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [hasRestrictedRefs, setHasRestrictedRefs] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const hasJustSavedRef = React.useRef(false)

  const blocker = useBlocker(() => isDirty && !hasJustSavedRef.current)

  const branches: EditorBranch[] = React.useMemo(
    () => (seed?.branches as unknown as EditorBranch[]) ?? [],
    [seed]
  )

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  const handleStatusChange = React.useCallback((val: string) => {
    setStatus(val)
    setIsDirty(true)
  }, [])

  const handleSlugChange = React.useCallback((val: string) => {
    setSlug(slugify(val))
    setSlugTouched(true)
    setIsDirty(true)
  }, [])

  const handlePublishDraft = async () => {
    if (!schemaSlug || !entryId) return
    try {
      await publishDraft({ slug: schemaSlug, id: entryId })
      toast.success(t("content.editor.draftPublishSuccess"))
      hasJustSavedRef.current = true
      navigate(effectiveDraftContext ? "/drafts" : `/content/${schemaSlug}`)
    } catch {
      toast.error(t("content.editor.saveError"))
    }
  }

  const handleDiscardDraft = async () => {
    if (!schemaSlug || !entryId) return
    try {
      await discardDraft({ slug: schemaSlug, id: entryId })
      toast.success(t("content.editor.draftDiscardSuccess"))
      if (effectiveDraftContext) {
        hasJustSavedRef.current = true
        navigate("/drafts")
      } else {
        setIsDirty(false)
        if (entryData) {
          setFormData(entryData.data ?? {})
          setStatus(entryData.status ?? "draft")
          setSlug(entryData.slug ?? "")
        }
      }
    } catch {
      toast.error(t("content.editor.saveError"))
    } finally {
      setShowDiscardConfirm(false)
    }
  }

  // Sync live data from query to local state
  React.useEffect(() => {
    if (entryData) {
      setFormData(entryData.data ?? {})
      setStatus(entryData.status ?? "draft")
      setSlug(entryData.slug ?? "")
      setIsDirty(false)
    }
  }, [entryData])

  // When entering from the Drafts list, override form with draft data once loaded.
  // Runs after the live-data effect so draft values win.
  React.useEffect(() => {
    if (effectiveDraftContext && draftData) {
      setFormData(draftData)
      setIsDirty(false)
    }
  }, [effectiveDraftContext, draftData])

  const errorEntry =
    errorEntryQuery instanceof Error ? errorEntryQuery.message : null

  // Initialize form for create mode
  React.useEffect(() => {
    if (!seed || !isCreate) return
    setFormData(createInitialFormData(branches))
    setStatus("draft")
    setSlug("")
    setSlugTouched(false)
  }, [seed, isCreate, branches])

  // Auto-slug from first text field (create only, unless user touched slug)
  const firstTextAlias = React.useMemo(
    () => branches.find((b) => b.type === "text")?.alias,
    [branches]
  )
  const firstTextValue = firstTextAlias ? formData[firstTextAlias] : undefined

  React.useEffect(() => {
    if (!isCreate || slugTouched || firstTextAlias == null) return
    const textText = deriveAutoSlugText(firstTextValue)
    setSlug(slugFromText(textText))
  }, [isCreate, slugTouched, firstTextAlias, firstTextValue])

  const richtextBranch = React.useMemo(
    () => branches.find((b) => b.type === "richtext"),
    [branches]
  )
  const hasRichtext = !!richtextBranch
  const seoBranches = React.useMemo(
    () =>
      branches.filter(
        (b) => b.alias !== richtextBranch?.alias && isSeoBranch(b)
      ),
    [branches, richtextBranch]
  )
  const contentBranches = React.useMemo(
    () =>
      branches.filter(
        (b) => b.alias !== richtextBranch?.alias && !isSeoBranch(b)
      ),
    [branches, richtextBranch]
  )

  const handleDelete = async () => {
    if (!schemaSlug || !entryId) return
    try {
      await deleteContent({ slug: schemaSlug, id: entryId })
      toast.success(t("content.editor.deletedSuccess", "Deleted"))
      hasJustSavedRef.current = true
      navigate(`/content/${schemaSlug}`)
    } catch {
      toast.error(t("content.editor.deleteError", "Could not delete entry"))
    } finally {
      setShowDeleteConfirm(false)
    }
  }

  const handleSaveLive = async () => {
    if (!schemaSlug || !seed) return
    if (!isCreate && !entryId) return

    const jsonValidation = validateEntryJsonFields(branches, formData)
    if (!jsonValidation.isValid) {
      toast.error(t("content.editor.jsonError", { field: jsonValidation.errorFieldLabel }))
      return
    }

    setFieldErrors({})
    try {
      const payload = prepareSubmissionPayload({ branches, formData, slug, status })
      const entryIdForUpdate = isCreate ? null : entryId!
      await saveContent({ slug: schemaSlug, id: entryIdForUpdate ?? undefined, data: payload })
      toast.success(isCreate ? t("content.editor.createdSuccess") : t("content.editor.savedSuccess"))
      setIsDirty(false)
      hasJustSavedRef.current = true
      navigate(`/content/${schemaSlug}`)
    } catch (err) {
      type ApiValidationError = { field: string; message: string }
      type ApiErrorBody = { error?: string; status?: number; errors?: ApiValidationError[] }
      const ax = err as AxiosError<ApiErrorBody>
      if (ax.response?.status === 409) {
        toast.error(t("content.editor.slugDuplicate"))
        return
      }
      if (ax.response?.status === 400) {
        const errors = ax.response.data?.errors
        if (errors && errors.length > 0) {
          const mapped: Record<string, string> = {}
          errors.forEach((errItem) => { mapped[errItem.field] = errItem.message })
          setFieldErrors(mapped)
          toast.error(t("content.editor.validationError", { count: errors.length }))
          return
        }
      }
      toast.error(err instanceof Error ? err.message : t("content.editor.saveError"))
    }
  }

  const handleSaveDraftOnly = async () => {
    if (!schemaSlug || !entryId || !seed) return

    const jsonValidation = validateEntryJsonFields(branches, formData)
    if (!jsonValidation.isValid) {
      toast.error(t("content.editor.jsonError", { field: jsonValidation.errorFieldLabel }))
      return
    }

    setFieldErrors({})
    try {
      const fullPayload = prepareSubmissionPayload({ branches, formData, slug, status })
      const { slug: _s, status: _st, ...draftPayload } = fullPayload
      await saveDraft({ slug: schemaSlug, id: entryId, data: draftPayload })
      toast.success(t("content.editor.draftSaveSuccess"))
      setIsDirty(false)
      hasJustSavedRef.current = true
      navigate(effectiveDraftContext ? "/drafts" : `/content/${schemaSlug}`)
    } catch {
      toast.error(t("content.editor.saveError"))
    }
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (effectiveDraftContext) {
      await handleSaveDraftOnly()
    } else {
      await handleSaveLive()
    }
  }

  const goBack = () => navigate(effectiveDraftContext ? "/drafts" : (schemaSlug ? `/content/${schemaSlug}` : "/"))

  if (!schemaSlug) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <p className="text-destructive">{t("content.editor.slugMissing")}</p>
      </div>
    )
  }

  if (!seed && !isSeedLoading) {
    return (
      <EditorShellLayout>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">
            {t("content.editor.seedNotFound", { slug: schemaSlug })}
          </p>
          <Button variant="outline" className="mt-2" onClick={goBack}>
            {t("content.editor.back")}
          </Button>
        </div>
      </EditorShellLayout>
    )
  }

  if (isSeedLoading || !seed || (entryId && isLoadingEntry)) {
    return (
      <EditorShellLayout>
        <Skeleton className="h-10 w-48" />
        <div className="grid flex-1 gap-4 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
          <Skeleton className="min-h-[70vh] rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </EditorShellLayout>
    )
  }

  if (entryId && errorEntry) {
    return (
      <EditorShellLayout>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{errorEntry}</p>
          <Button variant="outline" className="mt-2" onClick={goBack}>
            Back
          </Button>
        </div>
      </EditorShellLayout>
    )
  }

  const pageTitle = isCreate
    ? t("content.editor.newEntry", { label: seed.label })
    : t("content.editor.editEntry", { label: seed.label })

  const isBusy = isSaving || isSavingDraft || isPublishing
  // Show dropdown when allowDrafts is active and we have an existing entry to draft.
  const hasSaveDropdown = !isCreate && !!entryId && !!seed?.allowDrafts

  return (
    <EditorShellLayout>
      <form
        className="content-area-inner flex flex-1 flex-col"
        onSubmit={handleSubmit}
      >
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-4">
          <Button type="button" variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="mr-1 size-4" />
            {t("content.editor.back")}
          </Button>
          <h1 className="text-xl font-semibold truncate pb-1">{pageTitle}</h1>
        </div>

        {/* Draft context: simple "you're editing a draft" notice — actions are in the save button dropdown */}
        {effectiveDraftContext && (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
            <span>{t("content.editor.draftModeNotice")}</span>
          </div>
        )}

        {/* Normal context: pending draft exists — offer to open it or discard it */}
        {!effectiveDraftContext && hasPendingDraftNotice && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="flex-1">{t("content.editor.pendingDraftNotice")}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                onClick={() => navigate(`/content/${schemaSlug}/${entryId}`, { state: { isDraftContext: true }, replace: true })}
              >
                {t("content.editor.editDraft")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                onClick={() => setShowDiscardConfirm(true)}
                disabled={isDiscarding}
              >
                {t("content.editor.discardDraft")}
              </Button>
            </div>
          </div>
        )}

        {hasRichtext ? (
          <SplitEditorLayout
            richtextBranch={richtextBranch}
            seoBranches={seoBranches}
            contentBranches={contentBranches}
            formData={formData}
            fieldErrors={fieldErrors}
            status={status}
            slug={slug}
            onInputChange={handleInputChange}
            onStatusChange={handleStatusChange}
            onSlugChange={handleSlugChange}
          />
        ) : (
          <SingleColumnEditorLayout
            seoBranches={seoBranches}
            contentBranches={contentBranches}
            formData={formData}
            fieldErrors={fieldErrors}
            status={status}
            slug={slug}
            onInputChange={handleInputChange}
            onStatusChange={handleStatusChange}
            onSlugChange={handleSlugChange}
          />
        )}

        {/* Back-references panel — edit mode only */}
        {!isCreate && schemaSlug && entryId && (
          <div className="mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl mt-2">
            <ReferencedByPanel
              targetSlug={schemaSlug}
              targetId={entryId}
              onRestrictsChange={setHasRestrictedRefs}
            />
          </div>
        )}

        {/* Sticky footer — Delete (edit only) + Save/Create, aligned bottom-right */}
        <div className="sticky bottom-0 z-10 mt-4 flex items-center justify-end gap-2 border-t bg-background/95 backdrop-blur py-3 px-1">
          {!isCreate && !effectiveDraftContext && (
            hasRestrictedRefs ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button type="button" variant="destructive" size="sm" disabled>
                      <Trash2 className="mr-1 size-4" />
                      {t("common.delete", "Delete")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t("backrefs.deleteBlocked", { count: "?" })}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-1 size-4" />
                {t("common.delete", "Delete")}
              </Button>
            )
          )}

          {/* Split save button: main action + dropdown for secondary save action */}
          <div className="flex items-center">
            <Button
              type="submit"
              disabled={isBusy}
              className={hasSaveDropdown ? "rounded-r-none border-r border-r-primary-foreground/20 pr-3" : ""}
            >
              {isBusy ? (
                <><Loader2 className="mr-2 size-4 animate-spin" />{t("content.editor.saving")}</>
              ) : effectiveDraftContext ? (
                t("content.editor.saveDraft")
              ) : isCreate ? (
                t("common.create")
              ) : (
                t("content.editor.save")
              )}
            </Button>
            {hasSaveDropdown && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    disabled={isBusy}
                    className="rounded-l-none px-2 border-l-0"
                  >
                    <ChevronDown className="size-3" />
                    <span className="sr-only">{t("common.openMenu")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {effectiveDraftContext ? (
                    <>
                      <DropdownMenuItem onClick={handlePublishDraft} disabled={isPublishing}>
                        {isPublishing && <Loader2 className="mr-2 size-3 animate-spin" />}
                        {t("content.editor.publishDraft")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setShowDiscardConfirm(true)}
                      >
                        {t("content.editor.discardDraft")}
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={handleSaveDraftOnly}>
                      {t("content.editor.saveAsDraft")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </form>

      {/* Unsaved changes warning alert */}
      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("content.editor.unsavedTitle")}
            </AlertDialogTitle>
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

      {/* Discard draft confirmation */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("content.editor.discardDraftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("content.editor.discardDraftDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>
              {t("content.editor.stay")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscardDraft} disabled={isDiscarding}>
              {isDiscarding ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {t("content.editor.discardDraft")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete entry confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("content.editor.deleteTitle", "Delete entry?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("content.editor.deleteDesc", "This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>
              {t("content.editor.stay")}
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorShellLayout>
  )
}
