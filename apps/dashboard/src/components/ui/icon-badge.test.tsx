// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Lock, Shield, Star } from "@/components/icons"
import { TooltipProvider } from "@/components/ui/tooltip"
import { IconBadge, IconBadgeGroup, type IconBadgeItem } from "./icon-badge"

const items: IconBadgeItem[] = [
  { id: "a", icon: Star, label: "Required" },
  { id: "b", icon: Shield, label: "Internal" },
  { id: "c", icon: Lock, label: "Confidential" },
]

const moreLabel = (count: number) => `${count} more`

function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

describe("IconBadge", () => {
  it("names itself through its accessible label", () => {
    renderWithTooltip(<IconBadge icon={Star} label="Required" />)
    expect(screen.getByLabelText("Required")).toBeInTheDocument()
  })
})

describe("IconBadgeGroup", () => {
  it("renders a dash when there is nothing to show", () => {
    renderWithTooltip(<IconBadgeGroup items={[]} moreLabel={moreLabel} />)
    expect(screen.getByText("—")).toBeInTheDocument()
  })

  it("shows every badge while they fit", () => {
    renderWithTooltip(<IconBadgeGroup items={items} moreLabel={moreLabel} />)
    for (const { label } of items) expect(screen.getByLabelText(label)).toBeInTheDocument()
    expect(screen.queryByLabelText(/more/)).toBeNull()
  })

  it("folds the ones that do not fit into a +N badge", () => {
    renderWithTooltip(<IconBadgeGroup items={items} max={2} moreLabel={moreLabel} />)
    expect(screen.getByLabelText("Required")).toBeInTheDocument()
    expect(screen.queryByLabelText("Internal")).toBeNull()
    expect(screen.getByLabelText("2 more")).toHaveTextContent("+2")
  })
})
