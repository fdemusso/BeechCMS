import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MediaDisplay } from "@/features/fields/display/media"

const mockBranch = {
  id: "br_01",
  alias: "cover",
  label: "Cover",
  type: "file" as const,
  fileOptions: { accept: "image" as const },
}

const mockBranchNoOptions = {
  id: "br_03",
  alias: "attachment",
  label: "Attachment",
  type: "file" as const,
}

const mockAssetListBranch = {
  id: "br_02",
  alias: "images",
  label: "Images",
  type: "file" as const,
  multiple: true,
  format: "asset-list" as const,
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

  it("accept:'image' + URL immagine -> renderizza Avatar con img", () => {
    const url = "https://example.com/photo.png"
    const { container } = render(<MediaDisplay branch={mockBranch} value={url} />)
    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeInTheDocument()
  })

  it("accept:'image' + URL senza estensione -> mantiene rendering con Avatar", () => {
    const url = "https://cdn.example.com/resource?id=12345"
    const { container } = render(<MediaDisplay branch={mockBranch} value={url} />)
    const avatar = container.querySelector('[data-slot="avatar"]')
    expect(avatar).toBeInTheDocument()
  })

  it("senza fileOptions + URL .pdf -> no <img>, presente FileIcon", () => {
    const url = "https://example.com/report.pdf"
    const { container } = render(<MediaDisplay branch={mockBranchNoOptions} value={url} />)
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(container.querySelector('[data-slot="avatar"]')).not.toBeInTheDocument()
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("senza fileOptions + URL qualsiasi -> icona generica, nessuna richiesta HTTP", () => {
    const url = "https://example.com/archive.zip"
    const { container } = render(<MediaDisplay branch={mockBranchNoOptions} value={url} />)
    expect(container.querySelector('[data-slot="avatar"]')).not.toBeInTheDocument()
    expect(container.querySelector("svg")).toBeInTheDocument()
  })

  it("asset-list senza fileOptions (accept:'any') -> icone generiche, nessun <img>", () => {
    const values = [
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
      "https://cdn.example.com/3.jpg",
      "https://cdn.example.com/4.jpg",
    ]
    const { container } = render(
      <MediaDisplay branch={mockAssetListBranch} value={values} />
    )
    expect(container.querySelectorAll('[data-slot="avatar"]').length).toBe(0)
    expect(container.querySelectorAll("svg").length).toBe(3)
    expect(screen.getByText("+1")).toBeInTheDocument()
  })
})
