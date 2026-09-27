// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { Branch } from "@beechcms/core"
import {
  LocalizedOptionsForm,
  withoutIneligibleLocalized,
} from "@/components/fields/edit/repeater/repeater-branch-options"

describe("LocalizedOptionsForm", () => {
  it("a top-level text branch gets an enabled Localized toggle that sets localized: true", () => {
    const branch: Branch = { id: "br_01", alias: "title", label: "Title", type: "text" }
    const onChange = vi.fn()
    render(<LocalizedOptionsForm branch={branch} onChange={onChange} isExisting={false} />)

    fireEvent.click(screen.getByRole("checkbox", { name: "Localized" }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ localized: true }))
  })

  it("unchecking removes the localized key instead of writing false", () => {
    const branch: Branch = { id: "br_01", alias: "title", label: "Title", type: "text", localized: true }
    const onChange = vi.fn()
    render(<LocalizedOptionsForm branch={branch} onChange={onChange} isExisting={false} />)

    fireEvent.click(screen.getByRole("checkbox", { name: "Localized" }))

    expect(onChange.mock.calls[0][0]).not.toHaveProperty("localized")
  })

  it("the toggle is disabled on a repeater sub-field and on a confidential field", () => {
    const cases: Array<{ branch: Branch; subField?: boolean }> = [
      {
        branch: { id: "br_01", alias: "title", label: "Title", type: "text" },
        subField: true,
      },
      {
        branch: {
          id: "br_02",
          alias: "notes",
          label: "Notes",
          type: "text",
          policies: { classification: "confidential" },
        },
      },
    ]

    for (const { branch, subField } of cases) {
      const { unmount } = render(
        <LocalizedOptionsForm branch={branch} onChange={vi.fn()} subField={subField} isExisting={false} />
      )

      expect(screen.getByRole("checkbox", { name: "Localized" })).toBeDisabled()

      unmount()
    }
  })

  it("a number branch renders no Localized toggle", () => {
    const branch: Branch = { id: "br_01", alias: "count", label: "Count", type: "number" }
    const { container } = render(
      <LocalizedOptionsForm branch={branch} onChange={vi.fn()} isExisting={false} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("unchecking a persisted branch of a table with entries warns that translations stay stored", () => {
    const branch: Branch = { id: "br_01", alias: "title", label: "Title", type: "text", localized: true }
    render(<LocalizedOptionsForm branch={branch} onChange={vi.fn()} isExisting tableEmpty={false} />)

    fireEvent.click(screen.getByRole("checkbox", { name: "Localized" }))

    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

describe("withoutIneligibleLocalized", () => {
  it("drops localized when a type or classification change makes it illegal", () => {
    const cases: Array<{ branch: Branch; subField: boolean }> = [
      { branch: { id: "br_01", alias: "title", label: "Title", type: "number", localized: true }, subField: false },
      {
        branch: {
          id: "br_02",
          alias: "notes",
          label: "Notes",
          type: "text",
          localized: true,
          policies: { classification: "restricted" },
        },
        subField: false,
      },
      { branch: { id: "br_03", alias: "sub", label: "Sub", type: "text", localized: true }, subField: true },
    ]

    for (const { branch, subField } of cases) {
      const result = withoutIneligibleLocalized(branch, subField)

      expect(result).not.toHaveProperty("localized")
    }
  })

  it("returns the same branch when localization stays legal", () => {
    const branch: Branch = { id: "br_01", alias: "title", label: "Title", type: "text", localized: true }

    const result = withoutIneligibleLocalized(branch, false)

    expect(result).toBe(branch)
  })
})
