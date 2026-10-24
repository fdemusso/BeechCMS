// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

vi.mock("@/features/dashboard/hooks/use-dashboard-stats", () => ({
  useSetupChecklist: () => ({
    isLoading: false,
    isError: false,
    data: {
      systemTablesOk: true,
      seedsCount: 1,
      contentTablesOk: true,
      adminExists: true,
      hasContent: false,
      firstSeedSlug: "posts",
    },
  }),
}))

import { SetupChecklistWidget } from "@/features/dashboard/components/widgets/setup-checklist-widget"

describe("SetupChecklistWidget", () => {
  // Same route order as the app router: `create` must win over the `:id` entry editor.
  it("first-content action navigates to the create route, not the entry editor", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<SetupChecklistWidget />} />
          <Route path="/content/:slug/create" element={<div>create-form</div>} />
          <Route path="/content/:slug/:id" element={<div>entry-editor</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole("link", { name: /create first entry/i }))

    expect(screen.getByText("create-form")).toBeTruthy()
    expect(screen.queryByText("entry-editor")).toBeNull()
  })
})
