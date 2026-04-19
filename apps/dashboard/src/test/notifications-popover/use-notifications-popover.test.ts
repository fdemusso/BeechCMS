import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

import { useNotificationsPopover } from "@/components/notifications-popover/use-notifications-popover"

describe("useNotificationsPopover", () => {
  it("filtra nuove notifiche e aggiorna stato seen/unseen/delete", () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    const { result } = renderHook(() => useNotificationsPopover(), { wrapper })

    expect(result.current.notifications.length).toBeGreaterThan(0)
    expect(result.current.hasUnreadNotifications).toBe(true)

    const firstId = result.current.notifications[0].id
    act(() => result.current.handleMarkSeen(firstId))
    expect(result.current.unreadCount).toBeLessThan(5)

    act(() => result.current.setFilter("new"))
    expect(result.current.filter).toBe("new")
    expect(result.current.notifications.every((n) => n.isNew)).toBe(true)

    act(() => result.current.handleMarkUnseen(firstId))
    expect(result.current.hasUnreadNotifications).toBe(true)

    act(() => result.current.handleDelete(firstId))
    expect(result.current.notifications.find((n) => n.id === firstId)).toBeUndefined()
  })
})
