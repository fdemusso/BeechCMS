// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

// Mock del client rpc: stessa forma annidata di `rpc.api.content.notifications`
const mocked = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
  remove: vi.fn(),
  markAllRead: vi.fn(),
}))

vi.mock("@/lib/rpc", () => ({
  rpc: {
    api: {
      content: {
        notifications: {
          $get: mocked.list,
          "mark-all-read": { $post: mocked.markAllRead },
          ":id": {
            read: { $patch: mocked.markRead },
            unread: { $patch: mocked.markUnread },
            $delete: mocked.remove,
          },
        },
      },
    },
  },
}))

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
      { id: "1", title: "New", message: "Msg 1", type: "info", isRead: false, createdAt: 1700000000 },
      { id: "2", title: "Old", message: "Msg 2", type: "success", isRead: true, createdAt: 1700000000 },
    ]
    mocked.list.mockResolvedValue({ json: async () => mockData })
    mocked.markRead.mockResolvedValue({ json: async () => ({ success: true }) })
    mocked.markUnread.mockResolvedValue({ json: async () => ({ success: true }) })
    mocked.remove.mockResolvedValue({ json: async () => ({ success: true }) })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    
    const { result } = renderHook(() => useNotificationsPopover(), { wrapper })

    // Attendi caricamento dati
    await waitFor(() => expect(result.current.notifications.length).toBeGreaterThan(0))
    
    expect(result.current.notifications).toHaveLength(2)
    expect(result.current.hasUnreadNotifications).toBe(true)
    expect(result.current.unreadCount).toBe(1)
    // The API sends the creation time in epoch seconds; an unmapped field would surface as Invalid Date.
    expect(result.current.notifications[0].createdAt).toEqual(new Date(1700000000 * 1000))

    const firstId = result.current.notifications[0].id
    
    // Test mark seen
    await act(async () => {
      result.current.handleMarkSeen(firstId)
    })
    expect(mocked.markRead).toHaveBeenCalledWith({ param: { id: firstId } })

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
    expect(mocked.markUnread).toHaveBeenCalledWith({ param: { id: firstId } })

    // Test delete
    await act(async () => {
      result.current.handleDelete(firstId)
    })
    expect(mocked.remove).toHaveBeenCalledWith({ param: { id: firstId } })
  })

  it("segna tutto come letto e rilegge l'elenco", async () => {
    mocked.list.mockResolvedValue({
      json: async () => [{ id: "1", title: "New", message: "Msg 1", type: "info", isRead: false, createdAt: 1700000000 }],
    })
    mocked.markAllRead.mockResolvedValue({ json: async () => ({ success: true }) })
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    const { result } = renderHook(() => useNotificationsPopover(), { wrapper })
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    mocked.list.mockResolvedValue({
      json: async () => [{ id: "1", title: "New", message: "Msg 1", type: "info", isRead: true, createdAt: 1700000000 }],
    })

    await act(async () => {
      result.current.handleMarkAllRead()
    })

    expect(mocked.markAllRead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
  })
})
