// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { JsonEdit } from "@/components/fields/edit/json"
import type { Branch } from "@beechcms/core"

describe("JsonEdit", () => {
  const jsonBranch = {
    id: "br_json",
    alias: "metadata",
    label: "Metadata JSON",
    type: "json",
    policies: [],
  } as unknown as Branch

  const tagsWithoutOptionsBranch = {
    id: "br_tags_raw",
    alias: "open_tags",
    label: "Open Tags",
    type: "tags",
    policies: [],
  } as unknown as Branch

  it("renderizza JsonCodeEditor per branch con type json", async () => {
    const onChange = vi.fn()
    render(
      <JsonEdit
        branch={jsonBranch}
        value={{ key: "value" }}
        onChange={onChange}
      />
    )

    const editor = await screen.findByTestId("json-code-editor")
    expect(editor).toBeInTheDocument()
  })

  it("renderizza JsonCodeEditor per branch tags senza opzioni predefinite", async () => {
    const onChange = vi.fn()
    render(
      <JsonEdit
        branch={tagsWithoutOptionsBranch}
        value='{"tag1": "#ff0000"}'
        onChange={onChange}
      />
    )

    const editor = await screen.findByTestId("json-code-editor")
    expect(editor).toBeInTheDocument()
  })

  it("propaga readOnly e disabled a JsonCodeEditor", async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <JsonEdit
        branch={jsonBranch}
        value={{ test: 123 }}
        onChange={onChange}
        readOnly={true}
      />
    )

    let editor = await screen.findByTestId("json-code-editor")
    expect(editor).toHaveClass("cursor-not-allowed")

    rerender(
      <JsonEdit
        branch={jsonBranch}
        value={{ test: 123 }}
        onChange={onChange}
        disabled={true}
      />
    )

    editor = await screen.findByTestId("json-code-editor")
    expect(editor).toHaveClass("cursor-not-allowed")
  })
})
