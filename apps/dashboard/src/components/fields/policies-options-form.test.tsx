// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PoliciesOptionsForm } from "@/components/fields/edit/repeater/repeater-branch-options"
import type { Branch } from "@beechcms/core"

describe("PoliciesOptionsForm", () => {
  it("renders nothing when subField is true", () => {
    const branch: Branch = { id: "br_01", alias: "name", label: "Name", type: "text" }
    const { container } = render(
      <PoliciesOptionsForm branch={branch} onChange={vi.fn()} subField />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("defaults to public classification with all checkboxes enabled and checked for unconfigured branch", () => {
    const branch: Branch = { id: "br_01", alias: "title", label: "Title", type: "text" }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} />)

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    const filterCheckbox = screen.getByLabelText(/Filterable/i)
    const sortCheckbox = screen.getByLabelText(/Sortable/i)
    const publicCheckbox = screen.getByLabelText(/Exposed in public API/i)

    expect(searchCheckbox).toBeChecked()
    expect(searchCheckbox).toBeEnabled()

    expect(filterCheckbox).toBeChecked()
    expect(filterCheckbox).toBeEnabled()

    expect(sortCheckbox).toBeChecked()
    expect(sortCheckbox).toBeEnabled()

    expect(publicCheckbox).toBeChecked()
    expect(publicCheckbox).toBeEnabled()

    // No visibility combobox in the DOM
    expect(screen.getAllByRole("combobox")).toHaveLength(1)
  })

  it("handles restricted classification correctly: all flags disabled and unchecked", () => {
    const branch: Branch = {
      id: "br_pwd",
      alias: "password",
      label: "Password",
      type: "text",
      policies: { classification: "restricted" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} />)

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    const filterCheckbox = screen.getByLabelText(/Filterable/i)
    const sortCheckbox = screen.getByLabelText(/Sortable/i)
    const publicCheckbox = screen.getByLabelText(/Exposed in public API/i)

    expect(searchCheckbox).not.toBeChecked()
    expect(searchCheckbox).toBeDisabled()

    expect(filterCheckbox).not.toBeChecked()
    expect(filterCheckbox).toBeDisabled()

    expect(sortCheckbox).not.toBeChecked()
    expect(sortCheckbox).toBeDisabled()

    expect(publicCheckbox).not.toBeChecked()
    expect(publicCheckbox).toBeDisabled()

    // Only 1 combobox (Classification) exists — visibility is removed
    expect(screen.getAllByRole("combobox")).toHaveLength(1)
  })

  it("handles confidential classification correctly: encrypted badge displayed, search/sort/public disabled, filter enabled", () => {
    const branch: Branch = {
      id: "br_ssn",
      alias: "ssn",
      label: "SSN",
      type: "text",
      policies: { classification: "confidential" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} />)

    expect(screen.getByText("Encrypted at rest")).toBeInTheDocument()

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    const filterCheckbox = screen.getByLabelText(/Filterable/i)
    const sortCheckbox = screen.getByLabelText(/Sortable/i)
    const publicCheckbox = screen.getByLabelText(/Exposed in public API/i)

    expect(searchCheckbox).not.toBeChecked()
    expect(searchCheckbox).toBeDisabled()

    expect(filterCheckbox).toBeChecked()
    expect(filterCheckbox).toBeEnabled()

    expect(sortCheckbox).not.toBeChecked()
    expect(sortCheckbox).toBeDisabled()

    expect(publicCheckbox).not.toBeChecked()
    expect(publicCheckbox).toBeDisabled()
  })

  it("handles internal classification correctly: public disabled and unchecked, search/filter/sort enabled and checked", () => {
    const branch: Branch = {
      id: "br_email",
      alias: "internal_notes",
      label: "Internal Notes",
      type: "text",
      policies: { classification: "internal" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} />)

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    const filterCheckbox = screen.getByLabelText(/Filterable/i)
    const sortCheckbox = screen.getByLabelText(/Sortable/i)
    const publicCheckbox = screen.getByLabelText(/Exposed in public API/i)

    expect(searchCheckbox).toBeChecked()
    expect(searchCheckbox).toBeEnabled()

    expect(filterCheckbox).toBeChecked()
    expect(filterCheckbox).toBeEnabled()

    expect(sortCheckbox).toBeChecked()
    expect(sortCheckbox).toBeEnabled()

    expect(publicCheckbox).not.toBeChecked()
    expect(publicCheckbox).toBeDisabled()
  })

  it("toggling a checkbox preserves the resolved classification in branch.policies", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      id: "br_notes",
      alias: "notes",
      label: "Notes",
      type: "text",
      policies: { classification: "internal" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={onChange} />)

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    fireEvent.click(searchCheckbox)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0] as Branch
    expect(updated.policies?.classification).toBe("internal")
    expect(updated.policies?.search).toBe(false)
  })

  it("handles repeater top-level branch: search, filter, and sort are disabled", () => {
    const branch: Branch = {
      id: "br_items",
      alias: "items",
      label: "Items",
      type: "repeater",
      policies: { classification: "public" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} />)

    const searchCheckbox = screen.getByLabelText(/Full-text search/i)
    const filterCheckbox = screen.getByLabelText(/Filterable/i)
    const sortCheckbox = screen.getByLabelText(/Sortable/i)
    const publicCheckbox = screen.getByLabelText(/Exposed in public API/i)

    expect(searchCheckbox).toBeDisabled()
    expect(searchCheckbox).not.toBeChecked()

    expect(filterCheckbox).toBeDisabled()
    expect(filterCheckbox).not.toBeChecked()

    expect(sortCheckbox).toBeDisabled()
    expect(sortCheckbox).not.toBeChecked()

    expect(publicCheckbox).toBeEnabled()
    expect(publicCheckbox).toBeChecked()
  })

  it("changing classification to restricted cleans up incompatible policy overrides", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      id: "br_01",
      alias: "pwd",
      label: "Password",
      type: "text",
      policies: { classification: "public", search: true, filter: true, sort: true, public: true },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={onChange} tableEmpty={true} />)

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    const restrictedOption = screen.getByRole("option", { name: "Restricted" })
    fireEvent.click(restrictedOption)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0] as Branch
    expect(updated.policies).toEqual({ classification: "restricted" })
  })

  it("changing classification to confidential cleans up search, sort, and public", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      id: "br_01",
      alias: "ssn",
      label: "SSN",
      type: "text",
      policies: { classification: "public", search: true, sort: true, public: true, filter: true },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={onChange} tableEmpty={true} />)

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    const confidentialOption = screen.getByRole("option", { name: "Confidential" })
    fireEvent.click(confidentialOption)

    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0] as Branch
    expect(updated.policies).toEqual({ classification: "confidential", filter: true })
  })

  it("when table has entries (tableEmpty=false), confidential and restricted are disabled for plain fields", () => {
    const branch: Branch = {
      id: "br_01",
      alias: "bio",
      label: "Bio",
      type: "text",
      policies: { classification: "public" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} tableEmpty={false} />)

    expect(
      screen.getByText("Confidential and Restricted are only available when the table has no entries.")
    ).toBeInTheDocument()

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    const publicOption = screen.getByRole("option", { name: "Public" })
    const internalOption = screen.getByRole("option", { name: "Internal" })
    const confidentialOption = screen.getByRole("option", { name: "Confidential" })
    const restrictedOption = screen.getByRole("option", { name: "Restricted" })

    // Plain options allowed
    expect(publicOption).not.toHaveAttribute("data-disabled")
    expect(internalOption).not.toHaveAttribute("data-disabled")

    // Storage-changing options disabled
    expect(confidentialOption).toHaveAttribute("data-disabled")
    expect(restrictedOption).toHaveAttribute("data-disabled")
  })

  it("when table is empty (tableEmpty=true), switching from restricted to public is allowed", () => {
    const onChange = vi.fn()
    const branch: Branch = {
      id: "br_pwd",
      alias: "password",
      label: "Password",
      type: "text",
      policies: { classification: "restricted" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={onChange} tableEmpty={true} />)

    // No locked warning shown when table is empty
    expect(
      screen.queryByText("Hashed columns cannot be decrypted or converted when the table contains entries.")
    ).not.toBeInTheDocument()

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    const publicOption = screen.getByRole("option", { name: "Public" })
    expect(publicOption).not.toHaveAttribute("data-disabled")

    fireEvent.click(publicOption)
    expect(onChange).toHaveBeenCalledTimes(1)
    const updated = onChange.mock.calls[0][0] as Branch
    expect(updated.policies?.classification).toBe("public")
  })

  it("when table has entries (tableEmpty=false), confidential field cannot be decrypted or converted", () => {
    const branch: Branch = {
      id: "br_secret",
      alias: "secret",
      label: "Secret",
      type: "text",
      policies: { classification: "confidential" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} tableEmpty={false} />)

    expect(
      screen.getByText("Encrypted columns cannot be decrypted or converted when the table contains entries.")
    ).toBeInTheDocument()

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    expect(screen.getByRole("option", { name: "Public" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Internal" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Confidential" })).not.toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Restricted" })).toHaveAttribute("data-disabled")
  })

  it("when table has entries (tableEmpty=false), restricted field cannot be decrypted or converted", () => {
    const branch: Branch = {
      id: "br_pwd",
      alias: "pwd",
      label: "Password",
      type: "text",
      policies: { classification: "restricted" },
    }
    render(<PoliciesOptionsForm branch={branch} onChange={vi.fn()} tableEmpty={false} />)

    expect(
      screen.getByText("Hashed columns cannot be decrypted or converted when the table contains entries.")
    ).toBeInTheDocument()

    const classificationTrigger = screen.getByRole("combobox")
    fireEvent.click(classificationTrigger)

    expect(screen.getByRole("option", { name: "Public" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Internal" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Confidential" })).toHaveAttribute("data-disabled")
    expect(screen.getByRole("option", { name: "Restricted" })).not.toHaveAttribute("data-disabled")
  })
})

