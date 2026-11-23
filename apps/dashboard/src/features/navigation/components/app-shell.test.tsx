// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

import { AppShell } from "./app-shell"

vi.mock("./app-sidebar", () => ({ AppSidebar: () => <div>APP_SIDEBAR</div> }))

describe("AppShell", () => {
  it("keeps the scroll viewport's content wrapper out of display:table so a wide child cannot stretch the page", () => {
    const { container } = render(
      <AppShell>
        <div>PAGE_CONTENT</div>
      </AppShell>
    )

    const viewport = container.querySelector("[data-radix-scroll-area-viewport]")
    expect(viewport).not.toBeNull()
    expect(viewport?.className).toContain("[&>div]:block!")
  })
})
