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
  useRemoveAvatar: vi.fn(),
}))

import { useProfile, useUpdateProfile, useRemoveAvatar } from "../hooks/use-settings"
import { ProfileTab } from "./profile-tab"

describe("ProfileTab", () => {
  const updateProfile = vi.fn()
  const removeAvatar = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    updateProfile.mockResolvedValue({ success: true })
    removeAvatar.mockResolvedValue(undefined)
    vi.mocked(useRemoveAvatar).mockReturnValue({ mutateAsync: removeAvatar, isPending: false } as unknown as ReturnType<typeof useRemoveAvatar>)
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

  function withAvatar(hasCustomAvatar: boolean) {
    vi.mocked(useProfile).mockReturnValue({
      data: { name: "Ada", surname: "Lovelace", email: "ada@example.com", avatarUrl: "https://cdn.example.com/ada.png", hasCustomAvatar },
      isLoading: false,
    } as unknown as ReturnType<typeof useProfile>)
  }

  it("offers to remove the photo only when it is the user's own", () => {
    withAvatar(false)
    const { unmount } = render(<ProfileTab />)
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument()
    unmount()

    withAvatar(true)
    render(<ProfileTab />)
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument()
  })

  it("removing the photo clears it on the server", () => {
    withAvatar(true)
    render(<ProfileTab />)

    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }))

    expect(removeAvatar).toHaveBeenCalled()
  })

  it("the photo circle itself is the change-photo button", () => {
    withAvatar(false)
    render(<ProfileTab />)
    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument()
  })

  it("every password field has an eye, and the new password shows its strength once typed", () => {
    render(<ProfileTab />)
    expect(screen.getAllByRole("button", { name: "Show password" })).toHaveLength(3)
    expect(screen.queryByTestId("password-strength-indicator")).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "Tr0ub4dor&3-horse" } })

    expect(screen.getByTestId("password-strength-indicator")).toBeInTheDocument()
  })
})
