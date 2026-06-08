// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useBlocker } from "react-router-dom"
import { toast } from "sonner"
import type { Branch, Seed } from "@beechcms/core"
import { ICON_NAMES } from "@/lib/icon-registry"
import type { SchemaFormCapabilities, SchemaFormViewModel, RendererBranchMap } from "@/features/entry-editor"
import { useCreateSeed, useUpdateSeed } from "./use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import { buildMetaBranches, buildMetaLayout } from "../lib/meta-seed-layout"
import { seedToFormData, formDataToSeed } from "../lib/seed-form-mapping"

export interface UseSeedEditorDialogProps {
  editRecord: SeedRecordDTO | null
  activeSeedsForRelation: Seed[]
  onClose: () => void
}

const NOOP = () => {}

export function useSeedEditorDialog({
  editRecord,
  activeSeedsForRelation,
  onClose,
}: UseSeedEditorDialogProps): SchemaFormViewModel {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isCreate = !editRecord

  const create = useCreateSeed()
  const update = useUpdateSeed()

  const [formData, setFormData] = React.useState<Record<string, unknown>>(() => seedToFormData(editRecord))
  const [fieldErrors] = React.useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = React.useState(false)

  // Reset whenever the record identity changes — covers both "open the dialog
  // for a different seed" and "switch between create and edit". Adjusting state
  // during render (React's recommended pattern) instead of in an effect avoids
  // an extra cascading render.
  const [prevEditRecord, setPrevEditRecord] = React.useState(editRecord)
  if (editRecord !== prevEditRecord) {
    setPrevEditRecord(editRecord)
    setFormData(seedToFormData(editRecord))
    setIsDirty(false)
  }

  const branchAliasOptions = React.useMemo(
    () => ((formData.branches as Branch[] | undefined) ?? []).filter((b) => b.alias).map((b) => b.alias),
    [formData.branches]
  )

  const branches = React.useMemo(
    () => buildMetaBranches(t, {
      isEdit: !isCreate,
      branchAliasOptions,
      activeSeedsForRelation,
      iconNames: ICON_NAMES,
    }),
    [t, isCreate, branchAliasOptions, activeSeedsForRelation]
  )

  const branchById = React.useMemo<RendererBranchMap>(
    () => Object.fromEntries(branches.map((b) => [b.id, b])),
    [branches]
  )

  const layout = React.useMemo(() => buildMetaLayout(t), [t])

  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [])

  const blocker = useBlocker(() => isDirty)

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const seed = formDataToSeed(formData)
    try {
      if (editRecord) {
        await update.mutateAsync({ slug: editRecord.slug, seed })
      } else {
        await create.mutateAsync(seed)
      }
      toast.success(editRecord
        ? t("seedBuilder.editor.updateSuccess", { label: seed.label })
        : t("seedBuilder.editor.createSuccess", { label: seed.label }))
      setIsDirty(false)
      onClose()
    } catch {
      // useCreateSeed/useUpdateSeed already surface an RFC 7807 toast (extractDetail
      // reads `detail`/`title`) — the seeds API has no field-level error array to map.
    }
  }

  const capabilities: SchemaFormCapabilities = {
    drafts: false,
    backrefs: false,
    delete: false,
    layoutBuilder: false,
  }

  return {
    t,
    title: editRecord
      ? t("seedBuilder.editor.editTitle", { label: editRecord.definition.label })
      : t("seedBuilder.editor.createTitle"),
    isCreate,
    seed: { label: t("seedBuilder.page.navTitle"), slug: "_seed" },
    layout,
    branchById,
    formData,
    fieldErrors,

    isSeedLoading: false,
    isLoadingEntry: false,
    errorEntry: null,
    notFoundLabel: "",

    handleInputChange,
    handleSubmit,
    isBusy: create.isPending || update.isPending,
    saveLabel: isCreate ? t("common.create") : t("common.save"),

    goBack: onClose,
    blocker,

    capabilities,

    // Inert defaults for capability-gated fields — the shell never reads these
    // while the matching `capabilities.*` flag is false (sprint 07 contract).
    effectiveDraftContext: false,
    hasPendingDraftNotice: false,
    hasSaveDropdown: false,
    isPublishing: false,
    isDiscarding: false,
    showDiscardConfirm: false,
    setShowDiscardConfirm: NOOP,
    handlePublishDraft: NOOP,
    handleDiscardDraft: NOOP,
    navigate,
    schemaSlug: "_seed",
    entryId: editRecord?.slug,

    isDeleting: false,
    showDeleteConfirm: false,
    setShowDeleteConfirm: NOOP,
    handleDelete: NOOP,
    hasRestrictedRefs: false,
    setHasRestrictedRefs: NOOP,

    canEditLayoutFlag: false,
    builderMode: false,
    setBuilderMode: NOOP,
  }
}
