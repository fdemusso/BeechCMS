// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from "sonner"
import i18n from "@/lib/i18n"
import { useDashboardLanguage } from "./use-dashboard-language"

beforeEach(() => vi.clearAllMocks())

// changeLanguage is a spy on the real i18n instance, so it must be restored before the next test.
afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage("en")
})

describe("useDashboardLanguage", () => {
  it("setLanguage switches i18next to the given language and shows the matching toast", () => {
    const changeLanguage = vi.spyOn(i18n, "changeLanguage").mockResolvedValue((() => "") as never)
    const { result } = renderHook(() => useDashboardLanguage())

    act(() => result.current.setLanguage("it"))

    expect(changeLanguage).toHaveBeenCalledWith("it")
    expect(toast.success).toHaveBeenCalledWith("Lingua cambiata in Italiano")
  })

  it("reports the resolved language, not the raw detected one", async () => {
    // A regional tag keeps `language` as typed while `resolvedLanguage` falls back to a supported one.
    await i18n.changeLanguage("it-IT")
    const { result } = renderHook(() => useDashboardLanguage())

    expect(result.current.language).toBe("it")
  })
})
