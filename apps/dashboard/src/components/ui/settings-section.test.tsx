// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SettingsRow, SettingsSection } from "./settings-section"
import { sectionDomId } from "./settings-section-ids"

describe("SettingsSection", () => {
  it("is a titled landmark a sidebar bookmark can scroll to", () => {
    render(
      <SettingsSection id="password" title="Change password" description="Pick a strong one.">
        <SettingsRow label="Current password" htmlFor="pw"><input id="pw" /></SettingsRow>
      </SettingsSection>,
    )

    const region = screen.getByRole("region", { name: "Change password" })
    expect(region.id).toBe(sectionDomId("password"))
    expect(screen.getByText("Pick a strong one.")).toBeInTheDocument()
  })

  it("a row with htmlFor labels its control", () => {
    render(<SettingsRow label="Name" htmlFor="name"><input id="name" /></SettingsRow>)
    expect(screen.getByLabelText("Name")).toBeInTheDocument()
  })

  it("a row without htmlFor shows the label as plain text", () => {
    render(<SettingsRow label="Photo"><button type="button">Change</button></SettingsRow>)
    expect(screen.getByText("Photo")).toBeInTheDocument()
  })
})
