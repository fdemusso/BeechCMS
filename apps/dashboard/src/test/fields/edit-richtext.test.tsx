import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RichtextEdit } from "@/components/fields/edit/richtext"

const mockBranch = {
  id: "br_01",
  alias: "body",
  label: "Corpo",
  type: "richtext" as const,
}

describe("RichtextEdit", () => {
  it("render con value iniziale -> editor visibile, contenuto corrispondente", () => {
    render(
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
    )
    const editor = document.querySelector(".ProseMirror")
    expect(editor).toBeInTheDocument()
    expect(editor?.textContent).toContain("Hello world")
  })

  it("toolbar premium presente -> controlli principali visibili", () => {
    render(
      <RichtextEdit
        branch={mockBranch}
        value={{ type: "doc", content: [{ type: "paragraph" }] }}
        onChange={() => {}}
      />
    )
    expect(screen.getByRole("button", { name: /Indietro/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Avanti/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Heading menu/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^List$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Blockquote/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Block code/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Grassetto/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Corsivo/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Barrato/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Equazione inline/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Sottolineato/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Highlight/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Inserisci link/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Superscript/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Subscript/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Allinea a sinistra/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Giustifica/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Aggiungi immagine/i })).toBeInTheDocument()
  })
})

