// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const mocked = vi.hoisted(() => ({
  deleteUpload: vi.fn(),
  uploadFile: vi.fn(),
  uploader: undefined as ((file: File) => Promise<string>) | undefined,
}))

// The tiptap editor needs a layout engine; only the `uploader` it receives matters here.
vi.mock("@/components/ui/minimal-tiptap", () => ({
  MinimalTiptapEditor: (props: { uploader: (file: File) => Promise<string> }) => {
    mocked.uploader = props.uploader
    return null
  },
}))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { upload: { ":key": { $delete: mocked.deleteUpload } } } },
}))

vi.mock("@/lib/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload")>()),
  uploadFile: mocked.uploadFile,
}))

import { RichtextEditor } from "../../components/RichtextEditor"

describe("RichtextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.deleteUpload.mockResolvedValue({ json: async () => ({ success: true }) })
  })

  it("deletes an image uploaded in the session when the editor unmounts without it in the content", async () => {
    mocked.uploadFile.mockResolvedValueOnce("https://cdn.example.test/api/media/1700-abc-my%20photo.png")
    const { unmount } = render(<RichtextEditor value="" onChange={() => {}} />)
    await mocked.uploader?.(new File(["a"], "my photo.png", { type: "image/png" }))

    unmount()

    await vi.waitFor(() => {
      expect(mocked.deleteUpload).toHaveBeenCalledWith({ param: { key: "1700-abc-my%20photo.png" } })
    })
  })

  it("keeps an image uploaded in the session that the content still references", async () => {
    const url = "https://cdn.example.test/api/media/1700-abc-kept.png"
    mocked.uploadFile.mockResolvedValueOnce(url)
    const { unmount } = render(<RichtextEditor value={`<img src="${url}">`} onChange={() => {}} />)
    await mocked.uploader?.(new File(["a"], "kept.png", { type: "image/png" }))

    unmount()

    expect(mocked.uploadFile).toHaveBeenCalledTimes(1)
    expect(mocked.deleteUpload).not.toHaveBeenCalled()
  })
})
