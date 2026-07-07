// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RichtextEdit } from "@/components/fields/edit/richtext"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FieldsProvider, type FieldsContextType } from "@/components/fields/context"
import { RichtextEditor } from "@/features/richtext-editor"

const mockBranch = {
  id: "br_01",
  alias: "body",
  label: "Corpo",
  type: "richtext" as const,
}

const mockFieldsConfig: FieldsContextType = {
  useSchema: () => ({ data: [] }) as any,
  fetchById: async () => ({ id: "" }) as any,
  searchRelations: async () => [],
  queryKeys: { detail: () => [], lists: () => [] },
  components: { EntryEditorDialog: () => null, RichtextEditor },
}

describe("RichtextEdit", () => {
  it("render con value iniziale -> editor visibile, contenuto corrispondente", async () => {
    render(
      <FieldsProvider value={mockFieldsConfig}>
        <TooltipProvider>
          <RichtextEdit
            branch={mockBranch}
            value={{
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Hello world" }],
                },
              ],
            }}
            onChange={() => {}}
          />
        </TooltipProvider>
      </FieldsProvider>
    )
    const editor = document.querySelector(".ProseMirror")
    expect(editor).toBeInTheDocument()
    await waitFor(() => {
      expect(editor?.textContent).toContain("Hello world")
    })
  })

  it("toolbar premium presente -> controlli principali visibili", () => {
    render(
      <FieldsProvider value={mockFieldsConfig}>
        <TooltipProvider>
          <RichtextEdit
            branch={mockBranch}
            value={{ type: "doc", content: [{ type: "paragraph" }] }}
            onChange={() => {}}
          />
        </TooltipProvider>
      </FieldsProvider>
    )
    expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Redo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Text styles/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /List/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Blockquote/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Block code/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Bold/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Italic/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Strikethrough/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Underline/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Text color/i })).toBeInTheDocument()
  })
})

