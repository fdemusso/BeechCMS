// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { MediaGalleryWidget } from "../../components/widgets/media-gallery-widget"

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), delete: vi.fn() },
}))

// Wire format of GET /content/stats/unused-media: tracked upload records, not content entries.
const unusedUpload = {
  key: "1700000000000-orphan photo.jpg",
  filename: "orphan photo.jpg",
  mime_type: "image/jpeg",
  size_bytes: 2048,
  created_at: 1700000000000,
  url: "https://cdn.example.test/api/media/1700000000000-orphan%20photo.jpg",
}

function renderWidget() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MediaGalleryWidget seedSlug="posts" variant="unused" />
    </QueryClientProvider>
  )
}

describe("MediaGalleryWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: { items: [unusedUpload] } })
    vi.mocked(api.delete).mockResolvedValue({ data: undefined })
    vi.stubGlobal("confirm", vi.fn(() => true))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("unused variant", () => {
    it("renders an unreferenced upload record by its filename and url", async () => {
      renderWidget()

      const image = await screen.findByRole("img", { name: unusedUpload.filename })
      expect(image).toHaveAttribute("src", unusedUpload.url)
    })

    it("deletes an unreferenced upload through the upload endpoint by key", async () => {
      const user = userEvent.setup()
      renderWidget()
      await screen.findByRole("img", { name: unusedUpload.filename })

      await user.click(screen.getByRole("button", { name: /Elimina/ }))

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(`/upload/${encodeURIComponent(unusedUpload.key)}`)
      })
    })
  })
})
