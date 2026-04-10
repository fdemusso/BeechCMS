import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MediaDisplay } from "@/components/fields/display/media"

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

  it("value URL senza estensione -> mantiene rendering con Avatar", () => {
    const url = "https://cdn.example.com/resource?id=12345"
    const { container } = render(<MediaDisplay branch={mockBranch} value={url} />)
    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeInTheDocument()
  })
})

