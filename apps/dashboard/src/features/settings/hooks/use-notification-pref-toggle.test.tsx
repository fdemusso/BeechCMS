// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("../api/settings.api", () => ({
  settingsApi: { getNotifications: vi.fn(), updateNotifications: vi.fn() },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from "sonner"
import { settingsApi } from "../api/settings.api"
import type { NotificationPrefs } from "../types/settings.types"
import { useNotificationPrefToggle } from "./use-notification-pref-toggle"

const STORED_PREFS: NotificationPrefs = { contentCreate: true, contentUpdate: true, contentDelete: false, mediaUpload: false }

function renderToggle(options?: { readonly enabled?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useNotificationPrefToggle(options), { wrapper })
}

describe("useNotificationPrefToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNotifications).mockResolvedValue(STORED_PREFS)
    vi.mocked(settingsApi.updateNotifications).mockResolvedValue(undefined)
  })

  it("setPref saves the loaded prefs with only that key changed", async () => {
    const { result } = renderToggle()
    await waitFor(() => expect(result.current.prefs).toEqual(STORED_PREFS))

    await act(() => result.current.setPref("contentDelete", true))

    expect(settingsApi.updateNotifications).toHaveBeenCalledWith({ ...STORED_PREFS, contentDelete: true })
  })

  it("a successful save shows the saved toast", async () => {
    const { result } = renderToggle()
    await waitFor(() => expect(result.current.prefs).toEqual(STORED_PREFS))

    await act(() => result.current.setPref("contentDelete", true))

    expect(toast.success).toHaveBeenCalledWith("Notification preferences saved")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("a failed save shows the error toast and does not throw", async () => {
    vi.mocked(settingsApi.updateNotifications).mockRejectedValue(new Error("network down"))
    const { result } = renderToggle()
    await waitFor(() => expect(result.current.prefs).toEqual(STORED_PREFS))

    await act(() => result.current.setPref("contentDelete", true))

    expect(toast.error).toHaveBeenCalledWith("Error saving")
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("setPref before the prefs load saves nothing", async () => {
    vi.mocked(settingsApi.getNotifications).mockReturnValue(new Promise(() => {}))
    const { result } = renderToggle()

    await act(() => result.current.setPref("contentDelete", true))

    expect(settingsApi.updateNotifications).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("with enabled false never requests the prefs", async () => {
    const { result } = renderToggle({ enabled: false })

    await act(() => result.current.setPref("contentDelete", true))

    expect(settingsApi.getNotifications).not.toHaveBeenCalled()
    expect(result.current.prefs).toBeUndefined()
  })
})
