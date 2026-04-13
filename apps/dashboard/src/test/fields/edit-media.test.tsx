import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MediaEdit } from "@/components/fields/edit/media"

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}))

const mockBranch = {
  id: "br_01",
  alias: "cover",
  label: "Cover",
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

describe("MediaEdit", () => {
  const onChange = vi.fn()
  const originalImage = globalThis.Image

  class MockImage {
    onload: ((this: HTMLImageElement, ev: Event) => unknown) | null = null
    onerror: ((this: HTMLImageElement, ev: Event | string) => unknown) | null =
      null

    set src(value: string) {
      setTimeout(() => {
        if (value.includes("valid-image")) {
          this.onload?.call(this as unknown as HTMLImageElement, new Event("load"))
          return
        }
        this.onerror?.call(this as unknown as HTMLImageElement, new Event("error"))
      }, 0)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("Image", MockImage)
  })

  afterAll(() => {
    globalThis.Image = originalImage
  })

  it("value vuoto -> mostra pulsante 'Aggiungi immagine'", () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    expect(
      screen.getByRole("button", { name: /Aggiungi immagine/i })
    ).toBeInTheDocument()
  })

  it("value con URL -> mostra anteprima e solo pulsante Sostituisci nell'area principale", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    expect(screen.getByRole("button", { name: /Sostituisci/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Rimuovi$/i })).not.toBeInTheDocument()
  })

  it("Rimozione da modale -> chiama onChange('')", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Sostituisci/i }))
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi immagine/i }))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("Apre la modale con input URL e area drag/drop", () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi immagine/i }))

    expect(screen.getByText(/Inserisci un URL pubblico HTTPS/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Usa link/i })).toBeInTheDocument()
    expect(screen.getByText(/selezionalo/i)).toBeInTheDocument()
  })

  it("URL non HTTPS -> mostra errore e non salva", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi immagine/i }))
    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.jpg"), {
      target: { value: "http://example.com/image.jpg" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Usa link/i }))

    expect(screen.getByText(/deve iniziare con https/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("URL renderizzabile -> chiama onChange con link esterno", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi immagine/i }))
    const validUrl = "https://cdn.example.com/valid-image?id=123"
    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.jpg"), {
      target: { value: validUrl },
    })
    fireEvent.click(screen.getByRole("button", { name: /Usa link/i }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(validUrl)
    })
  })

  it("URL non renderizzabile -> mostra errore e blocca salvataggio", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi immagine/i }))
    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.jpg"), {
      target: { value: "https://example.com/not-image" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Usa link/i }))

    await waitFor(() => {
      expect(screen.getByText(/non renderizzabile come immagine/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("Upload: in stato uploading mostra Loader; su successo chiama onChange con url", async () => {
    const { api } = await import("@/lib/api")
    const postMock = vi.mocked(api.post)
    postMock.mockResolvedValue({
      data: { url: "/api/media/abc123.jpg" },
    } as never)

    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi immagine/i }))

    const input = document.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()

    const file = new File(["x"], "test.png", { type: "image/png" })
    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/Caricamento/i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("/api/media/abc123.jpg")
    })
  })

  it("Asset-list: aggiunge URL senza chiudere la modale", async () => {
    render(
      <MediaEdit
        branch={mockAssetListBranch}
        value={["https://cdn.example.com/a.jpg"]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Gestisci galleria/i }))
    const validUrl = "https://cdn.example.com/valid-image?id=999"
    fireEvent.change(screen.getByPlaceholderText("https://example.com/image.jpg"), {
      target: { value: validUrl },
    })
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi/i }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        "https://cdn.example.com/a.jpg",
        validUrl,
      ])
    })
    expect(screen.getByText(/Link immagine/i)).toBeInTheDocument()
  })

  it("Asset-list: rimuovi tutte svuota il campo con array", () => {
    render(
      <MediaEdit
        branch={mockAssetListBranch}
        value={["https://cdn.example.com/a.jpg"]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Gestisci galleria/i }))
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi tutte/i }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

