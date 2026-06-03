// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useBlocker } from "react-router-dom"
import { slugify, generateDefaultLayout, canEditLayout, type FormLayout } from "@beechcms/core"
import { ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { AxiosError } from "axios"

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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useAuth } from "@/lib/auth-context"
import { BuilderPane } from "./builder/builder-pane"
import { ReferencedByPanel } from "@/features/backrefs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LayoutRenderer } from "./renderer/layout-renderer"
import type { RendererBranchMap } from "./renderer/layout-renderer"

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type EditorBranch = {
  alias: string
  label: string
  type: string
  [key: string]: unknown
}

export interface EntryEditorDialogProps {
  schemaSlug: string
  entryId: string | undefined
  isDraftContext: boolean
  open: boolean
  onClose: () => void
}

// ============================================================================
// UTILITY FUNCTIONS & BUSINESS LOGIC (Pure and decoupled)
// ============================================================================

function slugFromText(text: string): string {
  return slugify(text)
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

function deriveAutoSlugText(rawValue: unknown): string {
  if (typeof rawValue === "string") {
    return rawValue
  }
  if (rawValue != null) {
    return String(rawValue)
  }
  return ""
}

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
// MAIN DIALOG COMPONENT
// ============================================================================

export function EntryEditorDialog({
  schemaSlug,
  entryId,
  isDraftContext,
  open,
  onClose,
}: EntryEditorDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
  const [builderMode, setBuilderMode] = React.useState(false)
  const hasJustSavedRef = React.useRef(false)

  const { user } = useAuth()
  const canEditLayoutFlag = canEditLayout(user?.role)

  const blocker = useBlocker(() => isDirty && !hasJustSavedRef.current)

  const branches: EditorBranch[] = React.useMemo(
    () => (seed?.branches as unknown as EditorBranch[]) ?? [],
    [seed]
  )

  // Build branchById map keyed by branch.id (stable id like 'br_01')
  const branchById = React.useMemo<RendererBranchMap>(() => {
    if (!seed) return {}
    return Object.fromEntries(seed.branches.map((b) => [b.id, b]))
  }, [seed])

  // Resolve the layout: use seed.layout if present, otherwise generate default
  const layout = React.useMemo(() => {
    if (!seed) return null
    return (seed.layout as FormLayout | undefined) ?? generateDefaultLayout(seed)
  }, [seed])

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  const goBack = React.useCallback(() => {
    if (effectiveDraftContext) {
      navigate("/drafts")
    } else {
      onClose()
    }
  }, [effectiveDraftContext, navigate, onClose])

  const handlePublishDraft = async () => {
    if (!schemaSlug || !entryId) return
    try {
      await publishDraft({ slug: schemaSlug, id: entryId })
      toast.success(t("content.editor.draftPublishSuccess"))
      hasJustSavedRef.current = true
      if (effectiveDraftContext) {
        navigate("/drafts")
      } else {
        onClose()
      }
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
        onClose()
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

  const handleDelete = async () => {
    if (!schemaSlug || !entryId) return
    try {
      await deleteContent({ slug: schemaSlug, id: entryId })
      toast.success(t("content.editor.deletedSuccess", "Deleted"))
      hasJustSavedRef.current = true
      onClose()
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
      onClose()
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
      if (effectiveDraftContext) {
        navigate("/drafts")
      } else {
        onClose()
      }
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

  const isBusy = isSaving || isSavingDraft || isPublishing
  const hasSaveDropdown = effectiveDraftContext && !isCreate && !!entryId && !!seed?.allowDrafts

  const pageTitle = seed
    ? isCreate
      ? t("content.editor.newEntry", { label: seed.label })
      : t("content.editor.editEntry", { label: seed.label })
    : ""

  // ---- Loading state ----
  if (isSeedLoading || (entryId && isLoadingEntry)) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>
              <Skeleton className="h-6 w-48" />
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="min-h-[30vh] w-full rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ---- Seed not found ----
  if (!seed && !isSeedLoading) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{t("common.error")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-destructive">
                {t("content.editor.seedNotFound", { slug: schemaSlug })}
              </p>
              <Button variant="outline" className="mt-2" onClick={goBack}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ---- Entry load error ----
  if (entryId && errorEntry) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{t("common.error")}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-destructive">{errorEntry}</p>
              <Button variant="outline" className="mt-2" onClick={goBack}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0 sm:max-w-2xl md:max-w-4xl">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{pageTitle}</DialogTitle>
          </DialogHeader>

          {canEditLayoutFlag && seed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setBuilderMode(true)}
                  className="absolute top-4 right-10 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                >
                  <Pencil className="size-4" />
                  <span className="sr-only">{t("layoutBuilder.editLayout")}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("layoutBuilder.editLayout")}
              </TooltipContent>
            </Tooltip>
          )}

          {builderMode && seed ? (
            <BuilderPane
              seed={seed}
              branchById={branchById}
              onClose={() => setBuilderMode(false)}
            />
          ) : null}

          <form
            className={`flex-1 flex flex-col min-h-0 ${builderMode ? 'hidden' : ''}`}
            onSubmit={handleSubmit}
          >
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4 space-y-4">

              {/* Draft context notice */}
              {effectiveDraftContext && (
                <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
                  <span>{t("content.editor.draftModeNotice")}</span>
                </div>
              )}

              {/* Pending draft notice (normal context) */}
              {!effectiveDraftContext && hasPendingDraftNotice && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
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

              {/* TODO: StatusAndSlugFields functionality needs to be replaced by the new Draft system logic. Hidden from user as they cannot edit slug directly anymore. */}
              {/*
              <StatusAndSlugFields
                status={status}
                onStatusChange={handleStatusChange}
                slug={slug}
                onSlugChange={handleSlugChange}
                isGrid
              />
              */}

              {/* Layout renderer */}
              {layout != null && (
                <LayoutRenderer
                  layout={layout}
                  branchById={branchById}
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onChange={handleInputChange}
                />
              )}

              {/* Back-references panel — edit mode only */}
              {!isCreate && schemaSlug && entryId && (
                <ReferencedByPanel
                  targetSlug={schemaSlug}
                  targetId={entryId}
                  onRestrictsChange={setHasRestrictedRefs}
                />
              )}
            </div>

            {/* Fixed footer — always visible at the bottom of the dialog, actions aligned right */}
            <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 pt-4 pb-6">
              {/* Delete button — edit mode, normal context only */}
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

              {/* Split save button */}
              <div className="flex items-center">
                <Button
                  type="submit"
                  size="sm"
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
                        size="sm"
                        disabled={isBusy}
                        className="rounded-l-none px-2 border-l-0"
                      >
                        <ChevronDown className="size-3" />
                        <span className="sr-only">{t("common.openMenu")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
    </>
  )
}
