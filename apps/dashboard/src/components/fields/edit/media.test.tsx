import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MediaEdit } from "./media"

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

describe("MediaEdit", () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("value vuoto -> mostra dropzone con testo 'Trascina un'immagine o clicca per selezionare'", () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    expect(
      screen.getByText(/Trascina un'immagine o clicca per selezionare/i)
    ).toBeInTheDocument()
  })

  it("value con URL -> mostra anteprima, pulsanti Sostituisci e Rimuovi", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    expect(screen.getByRole("button", { name: /Sostituisci/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Rimuovi/i })).toBeInTheDocument()
  })

  it("Click Rimuovi -> chiama onChange('')", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Rimuovi/i }))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("Upload: in stato uploading mostra Loader; su successo chiama onChange con url", async () => {
    const { api } = await import("@/lib/api")
    const postMock = vi.mocked(api.post)
    postMock.mockResolvedValue({
      data: { url: "/api/media/abc123.jpg" },
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as any,
    })

    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
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
})
