// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PermissionBadge, PermissionBadgeGroup, ScopeBadge } from "./permission-badge"

vi.mock("@/features/shared", () => ({
  useSchema: () => ({
    data: [
      { slug: "posts", label: "Posts", labelPlural: "Articles", dashboard: { icon: "Document" } },
    ],
  }),
}))

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe("PermissionBadge", () => {
  it("renders permission badge with icon for recognized permission", () => {
    renderWithTooltip(<PermissionBadge permission="content:read" />)
    const badge = screen.getByLabelText("Read content")
    expect(badge).toBeInTheDocument()
  })

  it("renders permission badge with label when showLabel is true", () => {
    renderWithTooltip(<PermissionBadge permission="content:create" showLabel />)
    expect(screen.getByText("Create content")).toBeInTheDocument()
  })

  it("renders fallback label for unknown permission", () => {
    renderWithTooltip(<PermissionBadge permission="custom:unknown" showLabel />)
    expect(screen.getByText("custom:unknown")).toBeInTheDocument()
  })
})

describe("PermissionBadgeGroup", () => {
  it("renders empty dash when permissions list is empty", () => {
    renderWithTooltip(<PermissionBadgeGroup permissions={[]} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("renders badges directly when count is within max", () => {
    renderWithTooltip(<PermissionBadgeGroup permissions={["content:read", "content:create"]} max={3} />)
    expect(screen.getByLabelText("Read content")).toBeInTheDocument()
    expect(screen.getByLabelText("Create content")).toBeInTheDocument()
  })

  it("truncates with overflow counter button when exceeding max", () => {
    renderWithTooltip(
      <PermissionBadgeGroup
        permissions={["content:read", "content:create", "content:update", "content:delete"]}
        max={3}
      />
    )
    expect(screen.getByLabelText("Read content")).toBeInTheDocument()
    expect(screen.getByLabelText("Create content")).toBeInTheDocument()
    expect(screen.getByText("+2")).toBeInTheDocument()
  })
})

describe("ScopeBadge", () => {
  it("renders global scope badge", () => {
    renderWithTooltip(<ScopeBadge scope="*" />)
    expect(screen.getByLabelText("All seeds (global)")).toBeInTheDocument()
  })

  it("renders specific seed scope badge", () => {
    renderWithTooltip(<ScopeBadge scope="posts" />)
    expect(screen.getByLabelText("Articles")).toBeInTheDocument()
  })
})
