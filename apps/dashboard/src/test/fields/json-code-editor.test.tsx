// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { JsonCodeEditor } from "@/components/fields/edit/json-code-editor"

describe("JsonCodeEditor", () => {
  it("monta gli elementi CodeMirror nel DOM", () => {
    const onChange = vi.fn()
    const { container } = render(
      <JsonCodeEditor
        id="test-editor"
        value='{"key": "value"}'
        onChange={onChange}
      />
    )

    const wrapper = screen.getByTestId("json-code-editor")
    expect(wrapper).toBeInTheDocument()
    expect(wrapper).toHaveAttribute("id", "test-editor")

    const cmEditor = container.querySelector(".cm-editor")
    expect(cmEditor).toBeInTheDocument()

    const cmScroller = container.querySelector(".cm-scroller")
    expect(cmScroller).toBeInTheDocument()

    const cmContent = container.querySelector(".cm-content")
    expect(cmContent).toBeInTheDocument()

    const cmGutters = container.querySelector(".cm-gutters")
    expect(cmGutters).toBeInTheDocument()
  })

  it("formatta e indenta automaticamente a 2 spazi gli oggetti JSON", () => {
    const onChange = vi.fn()
    const rawObject = { hello: "world", count: 42 }
    const { container } = render(
      <JsonCodeEditor
        value={rawObject}
        onChange={onChange}
      />
    )

    const cmContent = container.querySelector(".cm-content")
    expect(cmContent).toBeInTheDocument()
    expect(cmContent?.textContent).toContain('"hello": "world"')
    expect(cmContent?.textContent).toContain('"count": 42')
  })

  it("applica le classi di readOnly quando readOnly è true", () => {
    const onChange = vi.fn()
    render(
      <JsonCodeEditor
        value='{"read": true}'
        onChange={onChange}
        readOnly={true}
      />
    )

    const wrapper = screen.getByTestId("json-code-editor")
    expect(wrapper).toHaveClass("cursor-not-allowed")
    expect(wrapper).toHaveClass("opacity-75")

    const contentEditable = wrapper.querySelector('[contenteditable="false"]')
    expect(contentEditable).toBeInTheDocument()
  })

  it("gestisce stringhe vuote e valori nulli", () => {
    const onChange = vi.fn()
    const { container } = render(
      <JsonCodeEditor
        value={null}
        onChange={onChange}
      />
    )

    const cmContent = container.querySelector(".cm-content")
    expect(cmContent?.textContent).toBe("")
  })
})
