// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const sessions = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, created_at: 1_700_000_000, expires_at: 1_800_000_000 }))
const activity = Array.from({ length: 8 }, (_, i) => ({
  id: `a${i}`, action: "update", entity_type: "article", entity_slug: `post-${i}`, details: "{}", created_at: 1_700_000_000,
}))

vi.mock("../hooks/use-settings", () => ({
  useSessions: () => ({ data: sessions, isLoading: false }),
  useRevokeSession: () => ({ mutateAsync: vi.fn() }),
  useSettingsActivity: () => ({ data: activity, isLoading: false }),
}))

import { ActivitySection, SessionsSection } from "./security-tab"

describe("SessionsSection", () => {
  it("shows three sessions before scrolling", () => {
    const { container } = render(<SessionsSection />)
    const area = container.querySelector<HTMLElement>('[data-slot="scroll-area"]')
    expect(area?.style.maxHeight).toBe("13.5rem") // 3 rows × 4.5rem
  })

  it("keeps the revoke button out of sight until the row is hovered or focused", () => {
    render(<SessionsSection />)
    const revoke = screen.getAllByRole("button", { name: "Revoke session?" })
    expect(revoke).toHaveLength(5)
    for (const button of revoke) {
      expect(button).toHaveClass("opacity-0", "group-hover/row:opacity-100", "focus-visible:opacity-100")
    }
  })
})

describe("ActivitySection", () => {
  it("shows five entries before scrolling", () => {
    const { container } = render(<ActivitySection />)
    const area = container.querySelector<HTMLElement>('[data-slot="scroll-area"]')
    expect(area?.style.maxHeight).toBe("22.5rem") // 5 rows × 4.5rem
  })
})
