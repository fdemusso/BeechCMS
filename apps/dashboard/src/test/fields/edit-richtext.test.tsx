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
    expect(screen.getByRole("button", { name: /Annulla/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Ripristina/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Stili testo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Lista/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Citazione/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Blocco codice/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Grassetto/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Corsivo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Barrato/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Sottolineato/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Colore testo/i })).toBeInTheDocument()
  })
})

