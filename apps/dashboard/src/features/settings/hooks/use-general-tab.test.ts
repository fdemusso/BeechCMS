// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import { MAX_RETENTION_DAYS } from "@beechcms/core"

const mocked = vi.hoisted(() => ({ getSettings: vi.fn(), putSettings: vi.fn() }))

vi.mock("@/lib/rpc", () => ({
  rpc: { api: { settings: { $get: mocked.getSettings, $put: mocked.putSettings } } },
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from "sonner"
import type { GeneralSettings } from "../types/settings.types"
import { useGeneralTabLogic } from "./use-general-tab"

const GENERAL_SETTINGS: GeneralSettings = {
  siteTitle: "Acme",
  siteLogo: "/beechLogoDark.svg",
  defaultLanguage: "en",
  locales: ["en"],
  defaultLocale: "en",
  timezone: "Europe/Rome",
  currency: "EUR",
  company: { name: "Acme", website: null, abbreviation: null },
  dateFormat: "dd/MM/yyyy",
  trashRetentionDays: 21,
  features: { drafts: true, media: true, search: true, activityLog: true, email: false },
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

describe("useGeneralTabLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getSettings.mockResolvedValue({ json: async () => GENERAL_SETTINGS })
    mocked.putSettings.mockResolvedValue({ json: async () => ({ success: true }) })
  })

  async function renderLoadedHook() {
    const rendered = renderHook(() => useGeneralTabLogic(), { wrapper: wrapper() })
    await waitFor(() => expect(rendered.result.current.state.trashRetentionDays).toBe("21"))
    return rendered
  }

  async function saveRetention(
    result: { current: ReturnType<typeof useGeneralTabLogic> },
    typed: string,
  ) {
    act(() => result.current.actions.setTrashRetentionDays(typed))
    await act(async () => {
      await result.current.actions.handleSave({ preventDefault: vi.fn() } as unknown as React.FormEvent)
    })
  }

  it('loads trashRetentionDays from settings into state as "21"', async () => {
    const { result } = await renderLoadedHook()

    expect(result.current.state.trashRetentionDays).toBe("21")
  })

  it("saves a valid retention as a number in the PUT payload", async () => {
    const { result } = await renderLoadedHook()

    await saveRetention(result, "30")

    expect(mocked.putSettings).toHaveBeenCalledWith({ json: expect.objectContaining({ trashRetentionDays: 30 }) })
  })

  it("saves 0 (never purge)", async () => {
    const { result } = await renderLoadedHook()

    await saveRetention(result, "0")

    expect(mocked.putSettings).toHaveBeenCalledWith({ json: expect.objectContaining({ trashRetentionDays: 0 }) })
  })

  it("refuses an invalid retention with trashRetentionInvalid and sends nothing", async () => {
    const { result } = await renderLoadedHook()
    const invalidInputs = ["", "-1", "1.5", "abc", "36501"]

    for (const typed of invalidInputs) {
      vi.mocked(toast.error).mockClear()

      await saveRetention(result, typed)

      expect(toast.error).toHaveBeenCalledWith(
        `Retention must be a whole number between 0 and ${MAX_RETENTION_DAYS}.`,
      )
    }
    expect(mocked.putSettings).not.toHaveBeenCalled()
  })
})
