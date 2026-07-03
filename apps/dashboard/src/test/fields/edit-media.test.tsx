// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MediaEdit } from "@/components/fields/edit/media"

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}))

vi.mock("@/lib/upload", () => ({
  uploadFile: vi.fn(),
}))

const mockBranch = {
  id: "br_01",
  alias: "cover",
  label: "Cover",
  type: "file" as const,
  fileOptions: { accept: "image" as const },
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

  it("value vuoto -> mostra input di testo e pulsante di upload", () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("value con URL -> mostra anteprima e textbox con URL", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    expect(screen.getByRole("img")).toBeInTheDocument()
    expect(screen.getByRole("textbox")).toHaveValue("https://example.com/photo.jpg")
  })

  it("Rimozione -> chiama onChange('')", () => {
    render(
      <MediaEdit
        branch={mockBranch}
        value="https://example.com/photo.jpg"
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Remove image/i }))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("Mostra input URL con placeholder", () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    expect(screen.getByPlaceholderText(/Image link/i)).toBeInTheDocument()
  })

  it("URL non HTTPS -> mostra errore e non salva", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, {
      target: { value: "http://example.com/image.jpg" },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText(/must start with https/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("URL renderizzabile -> chiama onChange con link esterno", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    const input = screen.getByRole("textbox")
    const validUrl = "https://cdn.example.com/valid-image?id=123"
    fireEvent.change(input, {
      target: { value: validUrl },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(validUrl)
    })
  })

  it("URL non renderizzabile -> mostra errore e blocca salvataggio", async () => {
    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)
    const input = screen.getByRole("textbox")
    fireEvent.change(input, {
      target: { value: "https://example.com/not-image" },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText(/not renderable as image/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("Upload: disabilita input durante uploading e su successo chiama onChange con url", async () => {
    const { uploadFile } = await import("@/lib/upload")
    vi.mocked(uploadFile).mockResolvedValue("/api/media/abc123.jpg")

    render(<MediaEdit branch={mockBranch} value="" onChange={onChange} />)

    const input = document.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()

    const file = new File(["x"], "test.png", { type: "image/png" })
    fireEvent.change(input!, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeDisabled()
    })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("/api/media/abc123.jpg")
    })
  })

  it("Asset-list: aggiunge URL", async () => {
    render(
      <MediaEdit
        branch={mockAssetListBranch}
        value={["https://cdn.example.com/a.jpg"]}
        onChange={onChange}
      />
    )
    const input = screen.getByRole("textbox")
    const validUrl = "https://cdn.example.com/valid-image?id=999"
    fireEvent.change(input, {
      target: { value: validUrl },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        "https://cdn.example.com/a.jpg",
        validUrl,
      ])
    })
  })
})
