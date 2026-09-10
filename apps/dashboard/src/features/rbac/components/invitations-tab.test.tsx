// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { InvitationsTab } from "./invitations-tab"

const mockInvitations = vi.fn()
vi.mock("../hooks/use-rbac", () => ({
  useInvitations: () => mockInvitations(),
  useRegenerateInvitation: () => ({ mutateAsync: vi.fn() }),
  useRevokeInvitation: () => ({ mutate: vi.fn() }),
}))
vi.mock("./invite-dialog", () => ({ InviteDialog: () => null }))

describe("InvitationsTab", () => {
  it("an accepted invitation exposes no Regenerate action", () => {
    mockInvitations.mockReturnValue({
      data: [
        { id: "i1", email: "pending@beech.local", roleId: "r1", roleName: "Editor", scope: "articles", invitedBy: "u1", expiresAt: Math.floor(Date.now() / 1000) + 86400, createdAt: 0, status: "pending" },
        { id: "i2", email: "accepted@beech.local", roleId: "r1", roleName: "Editor", scope: "articles", invitedBy: "u1", expiresAt: Math.floor(Date.now() / 1000) + 86400, createdAt: 0, status: "accepted" },
      ],
      isLoading: false,
    })
    render(<InvitationsTab />)

    expect(screen.getByText("pending@beech.local")).toBeInTheDocument()
    expect(screen.getByText("accepted@beech.local")).toBeInTheDocument()
    // Two rows, but only the pending one gets a regenerate button (2 buttons: regenerate+revoke vs just revoke).
    const allButtons = screen.getAllByRole("button")
    // header Invite button + revoke per row (2) + regenerate for pending row only (1) = 4
    expect(allButtons.length).toBe(4)
  })
})
