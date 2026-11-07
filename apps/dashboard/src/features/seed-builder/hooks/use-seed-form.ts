// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useBlocker } from "react-router-dom"
import { toast } from "sonner"
import { SLUG_RE } from "@beechcms/core"
import type { Branch } from "@beechcms/core"
import { useCreateSeed, useUpdateSeed, useSeedHasEntries } from "./use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import { seedToFormData, formDataToSeed } from "../lib/seed-form-mapping"
import { branchIssue } from "../lib/field-alias"
import { slugifyLabel, uniqueSlug } from "../lib/seed-slug"
import { EMPTY_DANGER_DRAFT, clearDraft, draftKey, readDraft, writeDraft, type DangerDraft, type SeedDraft } from "../lib/seed-draft"

export interface UseSeedFormProps {
  editRecord: SeedRecordDTO | null
  /** Slugs already in use (deleted seeds included: their table still exists until purged). */
  takenSlugs: readonly string[]
  onClose: () => void
  open: boolean
}

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

/**
 * The branch used as the entry name: the stored choice while it still names a branch, otherwise the
 * first text branch (then the first branch). The server requires one (Fatal 9), so the form never asks.
 */
export function resolveDisplayNameAlias(branches: readonly Branch[], chosen: string): string {
  const named = branches.filter((b) => b.alias)
  if (named.some((b) => b.alias === chosen)) return chosen
  return named.find((b) => b.type === "text")?.alias ?? named[0]?.alias ?? ""
}

/** The steps of the dialog, in order. In create mode each one unlocks when the previous ones are complete. */
export const SEED_FORM_STEPS = ["general", "fields", "dashboard"] as const
export type SeedFormStep = (typeof SEED_FORM_STEPS)[number]

function isStep(value: string): value is SeedFormStep | "danger" {
  return value === "danger" || (SEED_FORM_STEPS as readonly string[]).includes(value)
}

/** A field is complete with a valid, unreserved, unique alias (and a target when it is a relation). */
export function areBranchesComplete(branches: readonly Branch[]): boolean {
  return branches.length > 0 && branches.every((b) => branchIssue(b, branches) === null)
}

interface StepCompletionInput {
  label: string
  slug: string
  slugTaken: boolean
  branches: readonly Branch[]
  displayNameAlias: string
}

/** Which steps are filled in well enough to move on (and, on the last one, to save). */
function stepCompletion({ label, slug, slugTaken, branches, displayNameAlias }: StepCompletionInput): Record<SeedFormStep, boolean> {
  return {
    general: label.trim() !== "" && SLUG_RE.test(slug) && !slugTaken,
    fields: areBranchesComplete(branches) && displayNameAlias !== "",
    dashboard: true,
  }
}

interface SeedDraftPersistenceInput {
  open: boolean
  isDirty: boolean
  formData: Record<string, unknown>
  step: SeedFormStep | "danger"
  slugTouched: boolean
  danger: DangerDraft
  scopeKey: string
}

/**
 * Keeps the form while it is open and edited (a short pause after the last keystroke), so a reload restores it, and ends
 * the draft when the dialog closes (saved, cancelled or discarded).
 */
function useSeedDraftPersistence({ open, isDirty, formData, step, slugTouched, danger, scopeKey }: SeedDraftPersistenceInput) {
  // The Danger zone changes the server and not the form, so being on its tab is worth keeping even with nothing edited.
  const onDangerTab = step === "danger"
  React.useEffect(() => {
    if (!open || (!isDirty && !onDangerTab)) return
    const timer = setTimeout(() => writeDraft(scopeKey, { formData, step, slugTouched, dirty: isDirty, danger }), 300)
    return () => clearTimeout(timer)
  }, [open, isDirty, onDangerTab, formData, step, slugTouched, danger, scopeKey])

  const wasOpen = React.useRef(open)
  const lastScopeKey = React.useRef(scopeKey)
  React.useEffect(() => {
    if (wasOpen.current && !open) clearDraft(lastScopeKey.current)
    wasOpen.current = open
    lastScopeKey.current = scopeKey
  }, [open, scopeKey])

  /** Leaving through the router while dirty and confirming "discard": the unmount never sees `open` turn false. */
  const discardDraft = () => clearDraft(scopeKey)
  return { discardDraft }
}

interface FormFieldSettersInput {
  isCreate: boolean
  slugTouched: boolean
  taken: ReadonlySet<string>
  setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
  setIsDirty: (dirty: boolean) => void
  setSlugTouched: (touched: boolean) => void
}

/** The setters of the form fields; the name and the slug are linked, every edit marks the form dirty. */
function useFormFieldSetters({ isCreate, slugTouched, taken, setFormData, setIsDirty, setSlugTouched }: FormFieldSettersInput) {
  const setField = React.useCallback((alias: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [alias]: value }))
    setIsDirty(true)
  }, [setFormData, setIsDirty])

  const setLabel = React.useCallback((label: string) => {
    setFormData((prev) => ({
      ...prev,
      label,
      ...(isCreate && !slugTouched ? { slug: uniqueSlug(slugifyLabel(label), taken) } : {}),
    }))
    setIsDirty(true)
  }, [isCreate, slugTouched, taken, setFormData, setIsDirty])

  const setSlug = React.useCallback((slug: string) => {
    const clean = slug.toLowerCase().replace(/[^a-z0-9_]/g, "")
    // Emptying the slug hands it back to the label.
    setSlugTouched(clean !== "")
    setFormData((prev) => ({
      ...prev,
      slug: clean === "" ? uniqueSlug(slugifyLabel(String(prev.label ?? "")), taken) : clean,
    }))
    setIsDirty(true)
  }, [taken, setFormData, setIsDirty, setSlugTouched])

  return { setField, setLabel, setSlug }
}

interface SeedSubmitInput {
  editRecord: SeedRecordDTO | null
  isCreate: boolean
  isLastStep: boolean
  canSubmit: boolean
  goNext: () => void
  formData: Record<string, unknown>
  displayNameAlias: string
  setIsDirty: (dirty: boolean) => void
  onClose: () => void
  create: ReturnType<typeof useCreateSeed>
  update: ReturnType<typeof useUpdateSeed>
}

/** Submitting: while creating it moves through the wizard first, and on the last step it saves. */
function useSeedSubmit({ editRecord, isCreate, isLastStep, canSubmit, goNext, formData, displayNameAlias, setIsDirty, onClose, create, update }: SeedSubmitInput) {
  const { t } = useTranslation()

  return async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    // While creating, the form is a wizard: submitting before the last step moves on instead of saving.
    if (isCreate && !isLastStep) {
      goNext()
      return
    }
    if (!canSubmit) return
    const seed = formDataToSeed({ ...formData, display_name_alias: displayNameAlias }, editRecord?.definition)
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
}

interface SeedFormStateInput {
  editRecord: SeedRecordDTO | null
  open: boolean
  scopeKey: string
}

/**
 * The form's own state and its lifecycle: restored from a draft after a reload, re-aligned when the stored record
 * is refreshed under it, and reset when the record changes or the dialog closes.
 */
function useSeedFormState({ editRecord, open, scopeKey }: SeedFormStateInput) {
  // A dialog that was open when the page reloaded comes back as it was left. The edit dialog has no record yet at
  // mount (the list is still loading), so it restores later, when its record arrives.
  const [initialDraft] = React.useState<SeedDraft | null>(() => (open && !editRecord ? readDraft(scopeKey) : null))

  const [formData, setFormData] = React.useState<Record<string, unknown>>(
    () => initialDraft?.formData ?? seedToFormData(editRecord)
  )
  const [isDirty, setIsDirty] = React.useState(initialDraft !== null && initialDraft.dirty !== false)
  const [danger, setDanger] = React.useState<DangerDraft>(initialDraft?.danger ?? EMPTY_DANGER_DRAFT)
  // Once the slug is typed by hand, editing the label no longer rewrites it.
  const [slugTouched, setSlugTouched] = React.useState(initialDraft?.slugTouched ?? false)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false)
  const [step, setStep] = React.useState<SeedFormStep | "danger">(
    initialDraft && isStep(initialDraft.step) ? initialDraft.step : "general"
  )

  const resetForm = (record: SeedRecordDTO | null, restore = false) => {
    const draft = restore && record ? readDraft(draftKey(record.slug)) : null
    setFormData(
      draft && record
        ? {
            ...draft.formData,
            branches: reconcileBranches(
              (draft.formData.branches as Branch[] | undefined) ?? [],
              record.definition.branches
            ),
          }
        : seedToFormData(record)
    )
    setIsDirty(draft !== null && draft.dirty !== false)
    setDanger(draft?.danger ?? EMPTY_DANGER_DRAFT)
    setSlugTouched(draft?.slugTouched ?? false)
    setConfirmDiscardOpen(false)
    setStep(draft && isStep(draft.step) ? draft.step : "general")
  }

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
      resetForm(editRecord, true)
    }
  }

  // The create dialog stays permanently mounted, so `editRecord` never changes identity across opens:
  // the reset above never fires for it. Closing must reset on its own, keyed off `open`, or a dirty
  // create form stays dirty forever and keeps tripping the navigation blocker after Cancel.
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) resetForm(editRecord)
  }

  return {
    formData,
    setFormData,
    isDirty,
    setIsDirty,
    slugTouched,
    setSlugTouched,
    confirmDiscardOpen,
    setConfirmDiscardOpen,
    step,
    setStep,
    danger,
    setDanger,
  }
}

/** State, derived values and submit handling of the seed create/edit dialog. */
export function useSeedForm({ editRecord, takenSlugs, onClose, open }: UseSeedFormProps) {
  const isCreate = !editRecord

  const create = useCreateSeed()
  const update = useUpdateSeed()

  const hasEntries = useSeedHasEntries(editRecord?.slug)
  const tableEmpty = editRecord ? !hasEntries : true

  const scopeKey = draftKey(editRecord?.slug ?? null)
  const {
    formData,
    setFormData,
    isDirty,
    setIsDirty,
    slugTouched,
    setSlugTouched,
    confirmDiscardOpen,
    setConfirmDiscardOpen,
    step,
    setStep,
    danger,
    setDanger,
  } = useSeedFormState({ editRecord, open, scopeKey })

  const taken = React.useMemo(() => new Set(takenSlugs.map((s) => s.toLowerCase())), [takenSlugs])
  const { setField, setLabel, setSlug } = useFormFieldSetters({ isCreate, slugTouched, taken, setFormData, setIsDirty, setSlugTouched })

  const branches = React.useMemo(() => (formData.branches as Branch[] | undefined) ?? [], [formData.branches])
  const displayNameAlias = resolveDisplayNameAlias(branches, String(formData.display_name_alias ?? ""))

  const slug = String(formData.slug ?? "")
  const isBusy = create.isPending || update.isPending

  const slugTaken = isCreate && taken.has(slug)
  const stepComplete = stepCompletion({ label: String(formData.label ?? ""), slug, slugTaken, branches, displayNameAlias })
  const stepIndex = (SEED_FORM_STEPS as readonly string[]).indexOf(step)
  const isLastStep = stepIndex === SEED_FORM_STEPS.length - 1
  // Create is a guided process: a step opens only when every step before it is complete. A stored seed is
  // already valid, so editing is free to jump between steps.
  const isStepReachable = (target: SeedFormStep) =>
    !isCreate || SEED_FORM_STEPS.slice(0, SEED_FORM_STEPS.indexOf(target)).every((s) => stepComplete[s])
  const allComplete = SEED_FORM_STEPS.every((s) => stepComplete[s])
  const canAdvance = step !== "danger" && stepComplete[step] && !isBusy
  const canSubmit = allComplete && !isBusy

  const blocker = useBlocker(() => open && isDirty)

  const { discardDraft } = useSeedDraftPersistence({ open, isDirty, formData, step, slugTouched, danger, scopeKey })

  const requestClose = () => {
    if (isDirty) setConfirmDiscardOpen(true)
    else onClose()
  }

  const goBack = () => setStep(SEED_FORM_STEPS[Math.max(stepIndex - 1, 0)])
  const goNext = () => {
    if (canAdvance && !isLastStep) setStep(SEED_FORM_STEPS[stepIndex + 1])
  }

  const handleSubmit = useSeedSubmit({
    editRecord,
    isCreate,
    isLastStep,
    canSubmit,
    goNext,
    formData,
    displayNameAlias,
    setIsDirty,
    onClose,
    create,
    update,
  })

  return {
    isCreate,
    formData,
    branches,
    displayNameAlias,
    slugTaken,
    tableEmpty,
    isDirty,
    isBusy,
    canSubmit,
    step,
    setStep,
    danger,
    setDanger,
    stepComplete,
    isStepReachable,
    isLastStep,
    canAdvance,
    goBack,
    goNext,
    setField,
    setLabel,
    setSlug,
    handleSubmit,
    blocker,
    requestClose,
    discardDraft,
    confirmDiscardOpen,
    setConfirmDiscardOpen,
  }
}

/** What `useSeedForm` returns: the form the dialog and its steps share. */
export type SeedFormState = ReturnType<typeof useSeedForm>
