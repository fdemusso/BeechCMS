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
import { useCreateSeed, useUpdateSeed, useSeedHasEntries } from "./use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import { buildMetaBranches, buildMetaLayout } from "../lib/meta-seed-layout"
import { seedToFormData, formDataToSeed } from "../lib/seed-form-mapping"
import { SeedDangerZone } from "../components/SeedDangerZone"

export interface UseSeedEditorDialogProps {
  editRecord: SeedRecordDTO | null
  activeSeedsForRelation: Seed[]
  onClose: () => void
  open: boolean
}

const NOOP = () => {}

// Server branches are the source of truth for existence, alias and type (the
// only things Danger Zone changes); the form keeps its unsaved edits on the rest.
function reconcileBranches(formBranches: Branch[], serverBranches: Branch[]): Branch[] {
  const formById = new Map(formBranches.map((b) => [b.id, b]))
  const kept = serverBranches.map((sb) => {
    const fb = formById.get(sb.id)
    return fb ? { ...fb, alias: sb.alias, type: sb.type } : sb
  })
  const unsavedNew = formBranches.filter((b) => b.id?.startsWith("br_new_"))
  return [...kept, ...unsavedNew]
}

export function useSeedEditorDialog({
  editRecord,
  activeSeedsForRelation,
  onClose,
  open,
}: UseSeedEditorDialogProps): SchemaFormViewModel {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isCreate = !editRecord

  const create = useCreateSeed()
  const update = useUpdateSeed()

  const hasEntries = useSeedHasEntries(editRecord?.slug)
  const tableEmpty = editRecord ? !hasEntries : true

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
    if (editRecord && prevEditRecord?.slug === editRecord.slug) {
      // Same seed, fresher server copy (Danger Zone drop/rename/retype refetch):
      // keep unsaved edits but re-align branches, or Save would resurrect a
      // dropped column or submit a stale alias.
      setFormData((prev) => ({
        ...prev,
        branches: reconcileBranches((prev.branches as Branch[] | undefined) ?? [], editRecord.definition.branches),
      }))
    } else {
      setFormData(seedToFormData(editRecord))
      setIsDirty(false)
    }
  }

  // The create dialog stays permanently mounted (stable hook order — see
  // SeedBuilderPage's SeedFormDialog adapter), so `editRecord` never changes
  // identity across opens: the reset above never fires for it. Closing must
  // reset on its own, keyed off `open`, or a dirty create form stays dirty
  // forever and keeps tripping the navigation blocker after Cancel.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setFormData(seedToFormData(editRecord))
      setIsDirty(false)
    }
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
      tableEmpty,
    }),
    [t, isCreate, branchAliasOptions, activeSeedsForRelation, tableEmpty]
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

  const blocker = useBlocker(() => open && isDirty)

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
    dangerZone: !isCreate,
  }

  // The dangerZoneSlot is built here in the seed-builder slice and passed as
  // a React node to the shell — the shell stays domain-agnostic.
  const dangerZoneSlot = !isCreate && editRecord
    ? React.createElement(SeedDangerZone, { record: editRecord, onClose })
    : undefined

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
    dangerZoneSlot,

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
