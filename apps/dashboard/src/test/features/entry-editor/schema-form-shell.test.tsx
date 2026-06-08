// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactNode, MouseEventHandler } from "react"
import type { Branch } from "@beechcms/core"
import type { Blocker } from "react-router-dom"
import type { SchemaFormViewModel, SchemaFormCapabilities } from "@/features/entry-editor"

interface PassthroughProps {
  children?: ReactNode
}

interface ButtonLikeProps extends PassthroughProps {
  onClick?: MouseEventHandler
}

interface AlertDialogProps extends PassthroughProps {
  open?: boolean
}

const { Passthrough, ClickableChild } = vi.hoisted(() => ({
  Passthrough: ({ children }: PassthroughProps) => <div>{children}</div>,
  ClickableChild: ({ children, onClick }: ButtonLikeProps) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: Passthrough,
  TooltipTrigger: Passthrough,
  TooltipContent: Passthrough,
}))

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: AlertDialogProps) => (open ? <div role="alertdialog">{children}</div> : null),
  AlertDialogContent: Passthrough,
  AlertDialogHeader: Passthrough,
  AlertDialogTitle: Passthrough,
  AlertDialogDescription: Passthrough,
  AlertDialogFooter: Passthrough,
  AlertDialogCancel: ClickableChild,
  AlertDialogAction: ClickableChild,
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: Passthrough,
  DropdownMenuTrigger: Passthrough,
  DropdownMenuContent: Passthrough,
  DropdownMenuItem: ClickableChild,
}))

vi.mock("@/features/backrefs", () => ({
  ReferencedByPanel: () => <div data-testid="referenced-by-panel" />,
}))

vi.mock("@/features/entry-editor/builder/builder-pane", () => ({
  BuilderPane: () => <div data-testid="builder-pane" />,
}))

vi.mock("@/features/fields", () => ({
  FieldEdit: ({ branch }: { branch: { alias: string } }) => <input aria-label={`field-${branch.alias}`} />,
}))

import { SchemaFormShell } from "@/features/entry-editor"

const branchTitle: Branch = { id: "br_title", alias: "title", label: "Title", type: "text" }

const layout = {
  version: 1 as const,
  tabs: [
    {
      id: "tab-1",
      label: "Tab",
      sections: [
        {
          id: "sec-1",
          label: "Section",
          columns: [
            { id: "col-1", fields: [{ branchId: "br_title" }] },
          ],
        },
      ],
    },
  ],
}

const allCapabilitiesTrue: SchemaFormCapabilities = {
  drafts: true,
  backrefs: true,
  delete: true,
  layoutBuilder: true,
}

function buildViewModel(overrides: Partial<SchemaFormViewModel> = {}): SchemaFormViewModel {
  return {
    t: ((key: string) => key) as SchemaFormViewModel["t"],
    title: "Edit entry",
    isCreate: false,
    seed: { label: "Post", slug: "posts" },
    layout,
    branchById: { br_title: branchTitle },
    formData: {},
    fieldErrors: {},
    isSeedLoading: false,
    isLoadingEntry: false,
    errorEntry: null,
    notFoundLabel: "Seed not found",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isBusy: false,
    saveLabel: "Save",
    goBack: vi.fn(),
    blocker: { state: "unblocked", reset: vi.fn(), proceed: vi.fn() } as unknown as Blocker,
    capabilities: allCapabilitiesTrue,
    effectiveDraftContext: false,
    hasPendingDraftNotice: false,
    hasSaveDropdown: false,
    isPublishing: false,
    isDiscarding: false,
    showDiscardConfirm: false,
    setShowDiscardConfirm: vi.fn(),
    handlePublishDraft: vi.fn(),
    handleDiscardDraft: vi.fn(),
    navigate: vi.fn(),
    schemaSlug: "posts",
    entryId: "e1",
    isDeleting: false,
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    handleDelete: vi.fn(),
    hasRestrictedRefs: false,
    setHasRestrictedRefs: vi.fn(),
    canEditLayoutFlag: true,
    builderMode: false,
    setBuilderMode: vi.fn(),
    ...overrides,
  }
}

describe("SchemaFormShell", () => {
  it("renders fields via LayoutRenderer when all capabilities are enabled", () => {
    render(<SchemaFormShell vm={buildViewModel()} open />)

    expect(screen.getByLabelText("field-title")).toBeInTheDocument()
  })

  it("hides the delete button and never mounts the delete confirm when capabilities.delete is false", () => {
    const vm = buildViewModel({
      capabilities: { ...allCapabilitiesTrue, delete: false },
      showDeleteConfirm: true,
    })
    render(<SchemaFormShell vm={vm} open />)

    expect(screen.queryByText("common.delete")).not.toBeInTheDocument()
    expect(screen.queryByText("content.editor.deleteTitle")).not.toBeInTheDocument()
  })

  it("hides draft notices and the save-draft dropdown when capabilities.drafts is false", () => {
    const vm = buildViewModel({
      capabilities: { ...allCapabilitiesTrue, drafts: false },
      effectiveDraftContext: true,
      hasPendingDraftNotice: true,
      hasSaveDropdown: true,
      showDiscardConfirm: true,
    })
    render(<SchemaFormShell vm={vm} open />)

    expect(screen.queryByText("content.editor.draftModeNotice")).not.toBeInTheDocument()
    expect(screen.queryByText("content.editor.pendingDraftNotice")).not.toBeInTheDocument()
    expect(screen.queryByText("content.editor.discardDraftTitle")).not.toBeInTheDocument()
    expect(screen.queryByText("common.openMenu")).not.toBeInTheDocument()
  })

  it("hides the ReferencedByPanel when capabilities.backrefs is false", () => {
    const vm = buildViewModel({ capabilities: { ...allCapabilitiesTrue, backrefs: false } })
    render(<SchemaFormShell vm={vm} open />)

    expect(screen.queryByTestId("referenced-by-panel")).not.toBeInTheDocument()
  })

  it("hides the layout-builder pencil and pane when capabilities.layoutBuilder is false", () => {
    const vm = buildViewModel({
      capabilities: { ...allCapabilitiesTrue, layoutBuilder: false },
      builderMode: true,
    })
    render(<SchemaFormShell vm={vm} open />)

    expect(screen.queryByText("layoutBuilder.editLayout")).not.toBeInTheDocument()
    expect(screen.queryByTestId("builder-pane")).not.toBeInTheDocument()
  })
})
