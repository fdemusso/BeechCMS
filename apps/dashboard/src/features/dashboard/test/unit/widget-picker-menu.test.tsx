// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@/features/dashboard/registry/builtin-widgets"
import { WidgetPickerMenu } from "@/features/dashboard/builder/widget-picker-menu"
import { hydrateEffectivePermissions } from "@/features/shared/hooks/use-permissions"
import { FULL_AUTHORITY } from "@/test/me-payload"

afterEach(cleanup)

async function openMenu(permissions: ReturnType<typeof hydrateEffectivePermissions>) {
  const onSelect = vi.fn()
  render(
    <WidgetPickerMenu permissions={permissions} onSelect={onSelect}>
      <button type="button">Add widget</button>
    </WidgetPickerMenu>,
  )
  await userEvent.click(screen.getByRole("button", { name: "Add widget" }))
  return { onSelect }
}

describe("WidgetPickerMenu", () => {
  it("offers the whole catalogue to a full authority and reports the picked type", async () => {
    const { onSelect } = await openMenu(hydrateEffectivePermissions(FULL_AUTHORITY as Parameters<typeof hydrateEffectivePermissions>[0]))

    expect(screen.getByRole("option", { name: "Setup Checklist" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Text" }))

    expect(onSelect).toHaveBeenCalledWith("core/text")
  })

  it("does not offer Setup Checklist or Media Gallery to a caller holding only content:read on posts", async () => {
    await openMenu(hydrateEffectivePermissions({ global: [], byScope: { posts: ["content:read"] } }))

    expect(screen.queryByRole("option", { name: "Setup Checklist" })).not.toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Media Gallery" })).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Text" })).toBeInTheDocument()
  })

  it("drops the Stats heading for a caller with no authority and still offers Text", async () => {
    await openMenu(hydrateEffectivePermissions(undefined))

    expect(screen.queryByText("Stats")).not.toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Text" })).toBeInTheDocument()
  })
})
