// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ApiError } from "@/lib/http/api-error"

const getAgentIntentMock = vi.fn()
const approveAgentIntentMock = vi.fn()
const rejectAgentIntentMock = vi.fn()
const listAgentIntentsMock = vi.fn()
vi.mock("../api/oauth.api", () => ({
  oauthApi: {
    getAgentIntent: (...args: unknown[]) => getAgentIntentMock(...args),
    approveAgentIntent: (...args: unknown[]) => approveAgentIntentMock(...args),
    rejectAgentIntent: (...args: unknown[]) => rejectAgentIntentMock(...args),
    listAgentIntents: (...args: unknown[]) => listAgentIntentsMock(...args),
  },
}))
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

import { AgentIntentReviewDialog } from "./agent-intent-review-dialog"
import { usePendingAgentIntents } from "../hooks/use-oauth-consent"
import type { AgentIntentApproval, AgentIntentDetail } from "../types/oauth.types"

const DESTRUCTIVE: AgentIntentDetail = {
  id: "intent-1", operationId: "seeds.delete", method: "DELETE", path: "/api/seeds/posts", risk: "destructive",
  summary: "Delete the posts content type", status: "pending", clientId: "beech-mcp-cli",
  createdAt: 1_700_000_000, expiresAt: 1_700_000_600, decidedAt: null, result: null, body: { slug: "posts" },
}
const PUBLISH: AgentIntentDetail = { ...DESTRUCTIVE, risk: "publish", summary: "Change site settings", body: null }

const approval = (status: number): AgentIntentApproval => ({
  intent: { ...DESTRUCTIVE, status: "approved" },
  result: { status, body: null },
})
const problem = (type: string) => new ApiError(409, { type })

/** Mounts the list hook beside the dialog so a refetch of the pending list is observable. */
function ListObserver() {
  usePendingAgentIntents()
  return null
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ListObserver />
      <AgentIntentReviewDialog intentId="intent-1" appName="Beech MCP CLI" onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  return onOpenChange
}

describe("AgentIntentReviewDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listAgentIntentsMock.mockResolvedValue([])
    getAgentIntentMock.mockResolvedValue(DESTRUCTIVE)
  })

  it("shows the request line and the stored body as indented JSON", async () => {
    renderDialog()

    expect(await screen.findByText("DELETE /api/seeds/posts")).toBeInTheDocument()
    expect(screen.getByText(/"slug": "posts"/).tagName).toBe("PRE")
    expect(screen.getByText(/"slug": "posts"/).textContent).toBe(JSON.stringify({ slug: "posts" }, null, 2))
  })

  it("says there is no request body when the body is null", async () => {
    getAgentIntentMock.mockResolvedValue(PUBLISH)

    renderDialog()

    expect(await screen.findByText("No request body")).toBeInTheDocument()
  })

  it("approving a destructive intent uses the destructive variant", async () => {
    renderDialog()
    const destructiveApprove = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(destructiveApprove).toBeEnabled())
    expect(destructiveApprove).toHaveAttribute("data-variant", "destructive")
  })

  it("approving a publish intent uses the default variant", async () => {
    getAgentIntentMock.mockResolvedValue(PUBLISH)

    renderDialog()

    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toHaveAttribute("data-variant", "default"))
  })

  it("approving an intent that ran shows the success toast, closes, and refetches the list", async () => {
    approveAgentIntentMock.mockResolvedValue(approval(200))
    const onOpenChange = renderDialog()
    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toBeEnabled())
    listAgentIntentsMock.mockClear()

    fireEvent.click(approve)

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Action approved and run"))
    expect(approveAgentIntentMock).toHaveBeenCalledWith("intent-1")
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(listAgentIntentsMock).toHaveBeenCalled())
  })

  it("approving an intent whose replay failed shows the failure toast with the HTTP status", async () => {
    approveAgentIntentMock.mockResolvedValue(approval(500))
    renderDialog()
    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toBeEnabled())

    fireEvent.click(approve)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("The action ran but failed (HTTP 500)"))
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it("rejecting calls rejectAgentIntent and shows the rejected toast", async () => {
    rejectAgentIntentMock.mockResolvedValue({ ...DESTRUCTIVE, status: "rejected" })
    const onOpenChange = renderDialog()
    const reject = await screen.findByRole("button", { name: "Reject" })
    await waitFor(() => expect(reject).toBeEnabled())

    fireEvent.click(reject)

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Action rejected"))
    expect(rejectAgentIntentMock).toHaveBeenCalledWith("intent-1")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("an expired intent shows the expired toast and refetches the list", async () => {
    approveAgentIntentMock.mockRejectedValue(problem("https://beechcms.dev/problems/intent_expired"))
    const onOpenChange = renderDialog()
    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toBeEnabled())
    listAgentIntentsMock.mockClear()

    fireEvent.click(approve)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("This request has expired. Ask the agent to try again."))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => expect(listAgentIntentsMock).toHaveBeenCalled())
  })

  it("an intent already decided shows the already-decided toast", async () => {
    approveAgentIntentMock.mockRejectedValue(problem("https://beechcms.dev/problems/intent_not_pending"))
    const onOpenChange = renderDialog()
    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toBeEnabled())

    fireEvent.click(approve)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("This request was already approved or rejected."))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("a network error keeps the dialog open with the generic error toast", async () => {
    approveAgentIntentMock.mockRejectedValue(new Error("offline"))
    const onOpenChange = renderDialog()
    const approve = await screen.findByRole("button", { name: "Approve and run" })
    await waitFor(() => expect(approve).toBeEnabled())

    fireEvent.click(approve)

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not complete the action"))
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("buttons are disabled while the detail is loading", () => {
    getAgentIntentMock.mockReturnValue(new Promise(() => {}))

    renderDialog()

    expect(screen.getByRole("button", { name: "Approve and run" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled()
  })
})
