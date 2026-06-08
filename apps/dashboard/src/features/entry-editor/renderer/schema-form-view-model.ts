// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import type { FormLayout } from "@beechcms/core"
import type { Blocker, NavigateFunction } from "react-router-dom"
import type { RendererBranchMap } from "./layout-renderer"

/**
 * Capability flags gate the *entry-specific* chrome of the shell.
 * The content hook (useEntryEditorDialog) sets every flag true.
 * The Seed hook (sprint 09) sets drafts/backrefs/delete/layoutBuilder false.
 *
 * SPRINT 10 NOTE: capabilities is intentionally an open object so future
 * consumers (e.g. a repeater sub-form) can add flags without touching the shell.
 */
export interface SchemaFormCapabilities {
  readonly drafts: boolean        // draft notices + save-draft dropdown
  readonly backrefs: boolean      // ReferencedByPanel in edit mode
  readonly delete: boolean        // destructive delete button + confirm
  readonly layoutBuilder: boolean // the "edit layout" pencil + BuilderPane
}

/**
 * The complete shape SchemaFormShell consumes. Any hook that implements this
 * interface can drive the shell. `useEntryEditorDialog` is the first implementer;
 * `useSeedEditorDialog` (sprint 09) is the second.
 */
export interface SchemaFormViewModel {
  t: TFunction
  title: string                   // precomputed by the hook (was inlined as pageTitle)
  isCreate: boolean

  // schema + form state
  seed: { label: string; slug: string } | null
  layout: FormLayout | null
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>

  // loading / error
  isSeedLoading: boolean
  isLoadingEntry: boolean
  errorEntry: string | null
  notFoundLabel: string           // what to show when seed is null (slug, etc.)

  // submit
  handleInputChange: (alias: string, value: unknown) => void
  handleSubmit: (e: React.SyntheticEvent<HTMLFormElement>) => void | Promise<void>
  isBusy: boolean
  saveLabel: React.ReactNode      // hook decides "Create" / "Save" / "Save draft"

  // navigation / dirty guard
  goBack: () => void
  blocker: Blocker

  // capabilities + their handlers (only read when the matching flag is true)
  capabilities: SchemaFormCapabilities

  // drafts (read only when capabilities.drafts)
  effectiveDraftContext: boolean
  hasPendingDraftNotice: boolean
  hasSaveDropdown: boolean
  isPublishing: boolean
  isDiscarding: boolean
  showDiscardConfirm: boolean
  setShowDiscardConfirm: (v: boolean) => void
  handlePublishDraft: () => void
  handleDiscardDraft: () => void
  navigate: NavigateFunction
  schemaSlug: string
  entryId: string | undefined

  // delete (read only when capabilities.delete)
  isDeleting: boolean
  showDeleteConfirm: boolean
  setShowDeleteConfirm: (v: boolean) => void
  handleDelete: () => void
  hasRestrictedRefs: boolean
  setHasRestrictedRefs: (v: boolean) => void

  // layout builder (read only when capabilities.layoutBuilder)
  canEditLayoutFlag: boolean
  builderMode: boolean
  setBuilderMode: (v: boolean) => void
}
