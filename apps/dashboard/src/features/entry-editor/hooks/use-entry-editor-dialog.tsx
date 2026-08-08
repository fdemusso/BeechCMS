// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/* eslint-disable react-hooks/set-state-in-effect */

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useBlocker } from "react-router-dom"
import { toast } from "sonner"
import type { AxiosError } from "axios"
import {
  slugify,
  generateDefaultLayout,
  canEditLayout,
  type FormLayout
} from "@beechcms/core"
import {
  useContentEntry,
  useSaveContent,
  useDraftEntry,
  useSaveDraft,
  usePublishDraft,
  useDiscardDraft,
  useDeleteContent,
} from "@/features/content-management"
import { useActiveSeed } from "@/features/shared"
import { useAuth } from "@/lib/auth-context"
import { Loader as Loader2 } from 'reicon-react'
import type { RendererBranchMap } from "../renderer/layout-renderer"
import type { SchemaFormCapabilities, SchemaFormViewModel } from "../renderer/schema-form-view-model"

export interface UseEntryEditorDialogProps {
  schemaSlug: string
  entryId: string | undefined
  isDraftContext: boolean
  onClose: () => void
  readonly?: boolean
  onSaved?: (info: { entryId?: string; data: Record<string, unknown>; isCreate: boolean }) => void
  /** Pre-seed values for CREATE mode (e.g. kanban column axis value). Ignored in edit mode. */
  defaultValues?: Record<string, unknown>
}

export interface EditorBranch {
  alias: string
  label: string
  type: string
  [key: string]: unknown
}

export function slugFromText(text: string): string {
  return slugify(text)
}

export function createEmptyRichtextDoc(): Record<string, unknown> {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  }
}

export function createInitialFormData(branches: EditorBranch[]): Record<string, unknown> {
  const initial: Record<string, unknown> = {}
  for (const branch of branches) {
    if (branch.type === "boolean") {
      initial[branch.alias] = false
    } else if (branch.type === "richtext") {
      initial[branch.alias] = createEmptyRichtextDoc()
    } else if (branch.type === "relation") {
      initial[branch.alias] = branch.multiple ? [] : null
    } else {
      initial[branch.alias] = ""
    }
  }
  return initial
}

export function deriveAutoSlugText(rawValue: unknown): string {
  if (typeof rawValue === "string") {
    return rawValue
  }
  if (typeof rawValue === "number" || typeof rawValue === "boolean") {
    return String(rawValue)
  }
  return ""
}

export function prepareSubmissionPayload({
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
    if (branch.type === "relation" && value === "") {
      processed[branch.alias] = branch.multiple ? [] : null
    } else if (branch.type === "json" && value) {
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
    status: status.trim() || "published",
    ...processed,
  }
}

export function validateEntryJsonFields(
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

export function useEntryEditorDialog({
  schemaSlug,
  entryId,
  isDraftContext,
  onClose,
  readonly,
  onSaved,
  defaultValues,
}: UseEntryEditorDialogProps): SchemaFormViewModel {
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
  const [status, setStatus] = React.useState<string>("published")
  const [slug, setSlug] = React.useState<string>("")
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})
  const [hasRestrictedRefs, setHasRestrictedRefs] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [builderMode, setBuilderMode] = React.useState(false)
  const [isReadOnly, setIsReadOnly] = React.useState(readonly ?? false)
  const hasJustSavedRef = React.useRef(false)

  React.useEffect(() => {
    setIsReadOnly(readonly ?? false)
  }, [readonly])

  const { user } = useAuth()
  const canEditLayoutFlag = canEditLayout(user?.role)

  const blocker = useBlocker(() => isDirty && !hasJustSavedRef.current)

  const branches: EditorBranch[] = React.useMemo(
    () => (seed?.branches as unknown as EditorBranch[]) ?? [],
    [seed]
  )

  // Build branchById map keyed by branch.id
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

  // Sync live data and draft data from queries to local state
  const [prevEntryData, setPrevEntryData] = React.useState<unknown>(undefined)
  const [prevDraftData, setPrevDraftData] = React.useState<unknown>(undefined)
  const [prevEffectiveDraftContext, setPrevEffectiveDraftContext] = React.useState<boolean | undefined>(undefined)

  const hasNewEntryData = entryData !== prevEntryData
  const hasNewDraftData = draftData !== prevDraftData
  const hasNewContext = effectiveDraftContext !== prevEffectiveDraftContext

  if (hasNewEntryData || hasNewDraftData || hasNewContext) {
    if (hasNewEntryData) setPrevEntryData(entryData)
    if (hasNewDraftData) setPrevDraftData(draftData)
    if (hasNewContext) setPrevEffectiveDraftContext(effectiveDraftContext)

    if (entryData) {
      const liveData = entryData.data ?? {}
      if (effectiveDraftContext) {
        const activeDraft = (draftData as Record<string, unknown> | undefined) || {}
        setFormData({
          ...liveData,
          ...activeDraft,
        })
      } else {
        setFormData(liveData)
      }
      setStatus(entryData.status ?? "draft")
      setSlug(entryData.slug ?? "")
      setIsDirty(false)
    }
  }

  const errorEntry =
    errorEntryQuery instanceof Error ? errorEntryQuery.message : null

  // Initialize form for create mode
  const [prevSeed, setPrevSeed] = React.useState<unknown>(undefined)
  const [prevIsCreate, setPrevIsCreate] = React.useState<boolean | undefined>(undefined)
  const [prevBranches, setPrevBranches] = React.useState<EditorBranch[] | undefined>(undefined)
  if (seed !== prevSeed || isCreate !== prevIsCreate || branches !== prevBranches) {
    setPrevSeed(seed)
    setPrevIsCreate(isCreate)
    setPrevBranches(branches)
    if (seed && isCreate) {
      setFormData({ ...createInitialFormData(branches), ...(defaultValues ?? {}) })
      setStatus("published")
      setSlug("")
      setSlugTouched(false)
    }
  }

  // Auto-slug from first text field
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
      const result = await saveContent({ slug: schemaSlug, id: isCreate ? undefined : entryId, data: payload })
      toast.success(isCreate ? t("content.editor.createdSuccess") : t("content.editor.savedSuccess"))
      setIsDirty(false)
      hasJustSavedRef.current = true
      onSaved?.({
        entryId: isCreate ? (result as { id?: string } | undefined)?.id : entryId,
        data: payload,
        isCreate,
      })
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
      const draftPayload = { ...fullPayload }
      delete draftPayload.slug
      delete draftPayload.status
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

  const title = seed
    ? (isCreate
      ? t("content.editor.newEntry", { label: seed.label })
      : t("content.editor.editEntry", { label: seed.label }))
    : ""

  const notFoundLabel = t("content.editor.seedNotFound", { slug: schemaSlug })

  let saveLabel: React.ReactNode
  if (isBusy) {
    saveLabel = (
      <>
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t("content.editor.saving")}
      </>
    )
  } else if (effectiveDraftContext) {
    saveLabel = t("content.editor.saveDraft")
  } else if (isCreate) {
    saveLabel = t("common.create")
  } else {
    saveLabel = t("content.editor.save")
  }

  const capabilities: SchemaFormCapabilities = {
    drafts: true,
    backrefs: true,
    delete: true,
    layoutBuilder: true,
    dangerZone: false,
  }

  return {
    t,
    title,
    isCreate,
    seed,
    isSeedLoading,
    isLoadingEntry,
    errorEntry,
    notFoundLabel,
    showDiscardConfirm,
    setShowDiscardConfirm,
    effectiveDraftContext,
    hasPendingDraftNotice,
    isDiscarding,
    isDeleting,
    isPublishing,
    formData,
    fieldErrors,
    hasRestrictedRefs,
    setHasRestrictedRefs,
    showDeleteConfirm,
    setShowDeleteConfirm,
    builderMode,
    setBuilderMode,
    canEditLayoutFlag,
    blocker,
    branchById,
    layout,
    handleInputChange,
    goBack,
    navigate,
    handlePublishDraft,
    handleDiscardDraft,
    handleDelete,
    handleSubmit,
    isBusy,
    saveLabel,
    hasSaveDropdown,
    capabilities,
    schemaSlug,
    entryId,
    isReadOnly,
    setIsReadOnly,
  }
}
