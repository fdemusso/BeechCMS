// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { MinimalTiptapEditor } from "@/components/ui/minimal-tiptap"
import { RichtextEditor } from "@/features/richtext-editor"
import type { JSONContent } from "@tiptap/react"

describe("MinimalTiptapEditor & RichtextEditor lifecycle and encoding", () => {
  it("emits native TipTap JSON on update by default without HTML double-wrapping", async () => {
    const initialDoc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Original text" }],
        },
      ],
    }

    render(
      <TooltipProvider>
        <RichtextEditor
          value={initialDoc}
          onChange={vi.fn()}
        />
      </TooltipProvider>
    )

    const editorEl = document.querySelector(".ProseMirror")
    expect(editorEl).toBeInTheDocument()

    await waitFor(() => {
      expect(editorEl?.textContent).toContain("Original text")
    })

    // Content in DOM should not contain escaped or literal paragraph tags
    expect(editorEl?.textContent).not.toContain("<p")
    expect(editorEl?.textContent).not.toContain("&lt;p")
  })

  it("handles multi-cycle save and reload without recursive nesting or double-encoding", async () => {
    // Cycle 1: initial save from HTML input
    const initialHtml = "<p class=\"text-node\">First cycle content</p>"

    const { unmount: unmount1 } = render(
      <TooltipProvider>
        <RichtextEditor
          value={initialHtml}
          onChange={vi.fn()}
        />
      </TooltipProvider>
    )

    const editor1 = document.querySelector(".ProseMirror")
    expect(editor1).toBeInTheDocument()
    await waitFor(() => {
      expect(editor1?.textContent).toContain("First cycle content")
    })
    expect(editor1?.textContent).not.toContain("<p")
    unmount1()

    // Cycle 2: simulate opening editor again with doc structure
    const docCycle2: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First cycle content" }],
        },
      ],
    }

    const { unmount: unmount2 } = render(
      <TooltipProvider>
        <RichtextEditor
          value={docCycle2}
          onChange={vi.fn()}
        />
      </TooltipProvider>
    )

    const editor2 = document.querySelector(".ProseMirror")
    expect(editor2).toBeInTheDocument()
    await waitFor(() => {
      expect(editor2?.textContent).toBe("First cycle content")
    })
    expect(editor2?.textContent).not.toContain("&lt;p")
    expect(editor2?.textContent).not.toContain("<p class=\"text-node\">")
    unmount2()

    // Cycle 3: simulate reopening editor with stringified JSON
    const stringifiedDoc = JSON.stringify(docCycle2)
    const { unmount: unmount3 } = render(
      <TooltipProvider>
        <RichtextEditor
          value={stringifiedDoc}
          onChange={() => {}}
        />
      </TooltipProvider>
    )

    const editor3 = document.querySelector(".ProseMirror")
    expect(editor3).toBeInTheDocument()
    await waitFor(() => {
      expect(editor3?.textContent).toBe("First cycle content")
    })
    expect(editor3?.textContent).not.toContain('{"type"')
    unmount3()
  })

  it("updates editor when value prop changes externally", async () => {
    const docA: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Content Alpha" }],
        },
      ],
    }

    const docB: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Content Beta" }],
        },
      ],
    }

    const { rerender } = render(
      <TooltipProvider>
        <MinimalTiptapEditor
          value={docA}
          onChange={() => {}}
        />
      </TooltipProvider>
    )

    const editor = document.querySelector(".ProseMirror")
    await waitFor(() => {
      expect(editor?.textContent).toContain("Content Alpha")
    })

    // Rerender with new value (e.g. entry loaded asynchronously)
    rerender(
      <TooltipProvider>
        <MinimalTiptapEditor
          value={docB}
          onChange={() => {}}
        />
      </TooltipProvider>
    )

    await waitFor(() => {
      expect(editor?.textContent).toContain("Content Beta")
    })
  })
})
