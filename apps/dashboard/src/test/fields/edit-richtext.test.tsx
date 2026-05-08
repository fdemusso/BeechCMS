import { describe, it, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { RichtextEdit } from "@/components/fields/edit/richtext"
import { TooltipProvider } from "@/components/ui/tooltip"

const mockBranch = {
  id: "br_01",
  alias: "body",
  label: "Corpo",
  type: "richtext" as const,
}

describe("RichtextEdit", () => {
  it("render con value iniziale -> editor visibile, contenuto corrispondente", async () => {
    render(
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
    )
    const editor = document.querySelector(".ProseMirror")
    expect(editor).toBeInTheDocument()
    await waitFor(() => {
      expect(editor?.textContent).toContain("Hello world")
    })
  })

  it("toolbar premium presente -> controlli principali visibili", () => {
    render(
      <TooltipProvider>
        <RichtextEdit
          branch={mockBranch}
          value={{ type: "doc", content: [{ type: "paragraph" }] }}
          onChange={() => {}}
        />
      </TooltipProvider>
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

