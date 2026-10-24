// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

vi.mock("../hooks/use-settings", () => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useChangePassword: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateAvatar: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

import { useProfile, useUpdateProfile } from "../hooks/use-settings"
import { ProfileTab } from "./profile-tab"

describe("ProfileTab", () => {
  const updateProfile = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateProfile.mockResolvedValue({ success: true })
    vi.mocked(useUpdateProfile).mockReturnValue({ mutateAsync: updateProfile, isPending: false } as unknown as ReturnType<typeof useUpdateProfile>)
    vi.mocked(useProfile).mockReturnValue({
      data: { name: "Ada", surname: "Lovelace", email: "ada@example.com", avatarUrl: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useProfile>)
  })

  it("sends an emptied name and surname as empty strings so the user can clear them", () => {
    render(<ProfileTab />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "" } })

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(updateProfile).toHaveBeenCalledWith({ name: "", surname: "", email: "ada@example.com" })
  })
})
