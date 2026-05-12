import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// Mock dell'api axios
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
  }
}))

import { api } from "@/lib/api"
const mockApi = vi.mocked(api)

import { useNotificationsPopover } from "@/features/notifications/components/notifications-popover/use-notifications-popover"

describe("useNotificationsPopover", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  it("filtra nuove notifiche e aggiorna stato seen/unseen/delete", async () => {
    const mockData = [
      { id: "1", title: "New", message: "Msg 1", type: "info", is_read: 0, created_at: 1700000000 },
      { id: "2", title: "Old", message: "Msg 2", type: "success", is_read: 1, created_at: 1700000000 },
    ]
    ;(mockApi.get as any).mockResolvedValue({ data: mockData })
    ;(mockApi.patch as any).mockResolvedValue({ data: { success: true } })
    ;(mockApi.delete as any).mockResolvedValue({ data: { success: true } })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    
    const { result } = renderHook(() => useNotificationsPopover(), { wrapper })

    // Attendi caricamento dati
    await waitFor(() => expect(result.current.notifications.length).toBeGreaterThan(0))
    
    expect(result.current.notifications).toHaveLength(2)
    expect(result.current.hasUnreadNotifications).toBe(true)
    expect(result.current.unreadCount).toBe(1)

    const firstId = result.current.notifications[0].id
    
    // Test mark seen
    await act(async () => {
      result.current.handleMarkSeen(firstId)
    })
    expect(mockApi.patch).toHaveBeenCalledWith(`/content/notifications/${firstId}/read`)

    // Test filter
    act(() => {
      result.current.setFilter("new")
    })
    expect(result.current.filter).toBe("new")
    expect(result.current.notifications.every((n) => n.isNew)).toBe(true)
    expect(result.current.notifications).toHaveLength(1)

    // Test mark unseen
    await act(async () => {
      result.current.handleMarkUnseen(firstId)
    })
    expect(mockApi.patch).toHaveBeenCalledWith(`/content/notifications/${firstId}/unread`)

    // Test delete
    await act(async () => {
      result.current.handleDelete(firstId)
    })
    expect(mockApi.delete).toHaveBeenCalledWith(`/content/notifications/${firstId}`)
  })
})
