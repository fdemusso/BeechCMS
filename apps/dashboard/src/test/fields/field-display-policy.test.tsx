// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { FieldDisplay } from "@/features/fields/FieldDisplay"
import type { Branch } from "@beechcms/core"

const baseBranch: Branch = {
  alias: "title",
  label: "Title",
  type: "text",
}

describe("FieldDisplay — visibility policy", () => {
  it("renders null when visibility is 'hidden'", () => {
    const branch: Branch = { ...baseBranch, policies: { visibility: "hidden" } }
    const { container } = render(<FieldDisplay branch={branch} value="secret" />)
    expect(container.firstChild).toBeNull()
  })

  it("renders '••••••••' when visibility is 'masked' and value is non-empty", () => {
    const branch: Branch = { ...baseBranch, policies: { visibility: "masked" } }
    render(<FieldDisplay branch={branch} value="sensitive data" />)
    expect(screen.getByText("••••••••")).toBeInTheDocument()
  })

  it("renders the raw value when visibility is 'full' (default)", () => {
    render(<FieldDisplay branch={baseBranch} value="hello world" />)
    expect(screen.getByText("hello world")).toBeInTheDocument()
  })

  it("renders normally when policies is undefined (default full visibility)", () => {
    render(<FieldDisplay branch={baseBranch} value="visible text" />)
    expect(screen.getByText("visible text")).toBeInTheDocument()
  })

  it("renders '••••••••' even when value is empty string (masking is unconditional in the UI)", () => {
    const branch: Branch = { ...baseBranch, policies: { visibility: "masked" } }
    render(<FieldDisplay branch={branch} value="" />)
    // FieldDisplay always passes "••••••••" to the renderer; null-check is server-side only
    expect(screen.getByText("••••••••")).toBeInTheDocument()
  })

  it("renders '••••••••' even when value is null (masking is unconditional in the UI)", () => {
    const branch: Branch = { ...baseBranch, policies: { visibility: "masked" } }
    render(<FieldDisplay branch={branch} value={null} />)
    expect(screen.getByText("••••••••")).toBeInTheDocument()
  })
})
