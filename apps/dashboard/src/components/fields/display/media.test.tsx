import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MediaDisplay } from "./media"

const mockBranch = {
  id: "br_01",
  alias: "cover",
  label: "Cover",
  type: "file" as const,
}

describe("MediaDisplay", () => {
  it("value null -> renderizza '-' con classe text-muted-foreground", () => {
    render(<MediaDisplay branch={mockBranch} value={null} />)
    const el = screen.getByText("-")
    expect(el).toHaveClass("text-muted-foreground")
  })

  it("value '' -> renderizza '-'", () => {
    render(<MediaDisplay branch={mockBranch} value="" />)
    expect(screen.getByText("-")).toBeInTheDocument()
  })

  it("value URL immagine -> renderizza Avatar con img", () => {
    const url = "https://example.com/photo.jpg"
    const { container } = render(<MediaDisplay branch={mockBranch} value={url} />)
    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeInTheDocument()
  })

  it("value URL non immagine -> renderizza div con FileIcon", () => {
    const url = "https://example.com/document.pdf"
    render(<MediaDisplay branch={mockBranch} value={url} />)
    const container = document.querySelector(
      ".flex.size-10.shrink-0.items-center.justify-center.rounded-md"
    )
    expect(container).toBeInTheDocument()
  })
})
