// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CANONICAL_USERS } from "@beechcms/testing"
import { PALETTE_PINS_MAX } from "@beechcms/core"

const { getMock, putMock, toastMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("sonner", () => ({ toast: toastMock }))
vi.mock("@/lib/rpc", () => ({ rpc: { api: { settings: { "ui-preferences": { $get: getMock, $put: putMock } } } } }))

import { usePalettePins } from "../../use-palette-pins"

const USER_ID = CANONICAL_USERS.editor.id
const NEXT_USER_ID = CANONICAL_USERS.admin.id

function jsonResponse(body: { palettePins: string[] }) {
  return { json: async () => body }
}

function renderPins(initialUserId: string | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(({ userId }) => usePalettePins(userId), { wrapper, initialProps: { userId: initialUserId } })
}

async function renderLoadedPins(stored: string[]) {
  getMock.mockResolvedValue(jsonResponse({ palettePins: stored }))
  const hook = renderPins(USER_ID)
  await waitFor(() => expect(hook.result.current.state.status).toBe("ready"))
  return hook
}

describe("usePalettePins", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockReset()
    putMock.mockReset()
    putMock.mockImplementation(async ({ json }: { json: { palettePins: string[] } }) => jsonResponse(json))
  })

  it("without a user id the state is unavailable and no request is made", () => {
    const { result } = renderPins(undefined)

    expect(result.current.state).toEqual({ status: "unavailable" })
    expect(getMock).not.toHaveBeenCalled()
  })

  it.each([
    ["while the GET is pending", () => getMock.mockReturnValue(new Promise(() => {}))],
    ["after the GET fails", () => getMock.mockRejectedValue(new Error("network"))],
  ])("the state is unavailable %s", async (_name, arrange) => {
    arrange()

    const { result } = renderPins(USER_ID)

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1))
    expect(result.current.state).toEqual({ status: "unavailable" })
  })

  it("once loaded the state is ready with the stored ids in order", async () => {
    getMock.mockResolvedValue(jsonResponse({ palettePins: ["nav:/users", "tools:theme"] }))

    const { result } = renderPins(USER_ID)

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/users", "tools:theme"], saving: false }),
    )
  })

  it("pin PUTs the whole container with the id appended, and the state then lists it", async () => {
    const { result } = await renderLoadedPins(["nav:/users"])

    act(() => result.current.pin("tools:theme", "Theme"))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/users", "tools:theme"], saving: false }),
    )
    expect(putMock).toHaveBeenCalledTimes(1)
    expect(putMock).toHaveBeenCalledWith({ json: { palettePins: ["nav:/users", "tools:theme"] } })
  })

  it("pin toasts success with the label only after the server answered", async () => {
    const { result } = await renderLoadedPins([])
    let answer: (value: ReturnType<typeof jsonResponse>) => void = () => {}
    putMock.mockReturnValue(new Promise((resolve) => (answer = resolve)))

    act(() => result.current.pin("nav:/users", "Users"))

    expect(toastMock.success).not.toHaveBeenCalled()
    await act(async () => answer(jsonResponse({ palettePins: ["nav:/users"] })))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Pinned: Users"))
  })

  it("a rejected PUT toasts the error and leaves the ids exactly as loaded", async () => {
    // Regression guard: a list shown as saved after a failed write would vanish on the next device.
    const { result } = await renderLoadedPins(["nav:/users"])
    putMock.mockRejectedValue(new Error("network"))

    act(() => result.current.pin("tools:theme", "Theme"))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Pins not saved: try again. Your list is unchanged"))
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/users"], saving: false })
  })

  it("pin at PALETTE_PINS_MAX toasts the cap and makes no request", async () => {
    const full = Array.from({ length: PALETTE_PINS_MAX }, (_, index) => `nav:/page-${index}`)
    const { result } = await renderLoadedPins(full)

    act(() => result.current.pin("tools:theme", "Theme"))

    expect(toastMock.error).toHaveBeenCalledWith(`${PALETTE_PINS_MAX} items pinned: unpin one to pin another`)
    expect(putMock).not.toHaveBeenCalled()
  })

  it("pin of an id already pinned makes no request", async () => {
    const { result } = await renderLoadedPins(["nav:/users"])

    act(() => result.current.pin("nav:/users", "Users"))

    expect(putMock).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: "ready", ids: ["nav:/users"], saving: false })
  })

  it("unpin PUTs the list without the id, and the state no longer lists it", async () => {
    const { result } = await renderLoadedPins(["nav:/users", "tools:theme"])

    act(() => result.current.unpin("nav:/users", "Users"))

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["tools:theme"], saving: false }),
    )
    expect(putMock).toHaveBeenCalledWith({ json: { palettePins: ["tools:theme"] } })
    expect(toastMock.success).toHaveBeenCalledWith("Unpinned: Users")
  })

  it("while a write is in flight the state reports saving and a second pin makes no request", async () => {
    const { result } = await renderLoadedPins([])
    putMock.mockReturnValue(new Promise(() => {}))

    act(() => result.current.pin("nav:/users", "Users"))
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", ids: [], saving: true }))
    act(() => result.current.pin("tools:theme", "Theme"))

    expect(putMock).toHaveBeenCalledTimes(1)
  })

  it("the cached pins of one user are never exposed after the user id changes", async () => {
    getMock.mockResolvedValueOnce(jsonResponse({ palettePins: ["nav:/previous-user"] }))
    const hook = renderPins(USER_ID)
    await waitFor(() => expect(hook.result.current.state.status).toBe("ready"))
    getMock.mockReturnValue(new Promise(() => {}))

    hook.rerender({ userId: NEXT_USER_ID })

    expect(hook.result.current.state).toEqual({ status: "unavailable" })
  })
})
