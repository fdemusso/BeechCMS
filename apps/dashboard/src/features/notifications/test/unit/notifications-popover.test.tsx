// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

const hookState = {
  notifications: [
    {
      id: "1",
      title: "New notification",
      description: "Description",
      icon: (props: any) => <span {...props}>ICON</span>,
      isNew: true,
      createdAt: new Date(),
    },
    {
      id: "2",
      title: "Old notification",
      description: "Already seen",
      icon: (props: any) => <span {...props}>ICON</span>,
      isNew: false,
      createdAt: new Date(),
    },
  ],
  filter: "all" as const,
  setFilter: vi.fn(),
  hasUnreadNotifications: true,
  unreadCount: 1,
  handleMarkSeen: vi.fn(),
  handleMarkUnseen: vi.fn(),
  handleDelete: vi.fn(),
  handleMarkAllRead: vi.fn(),
}

vi.mock("@/features/notifications/components/notifications-popover/use-notifications-popover", () => ({
  useNotificationsPopover: () => hookState,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: any) => <button>{children}</button>,
}))
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  ContextMenuSeparator: () => <div />,
}))
vi.mock("@/components/ui/toggle-group", () => ({
  ToggleGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ToggleGroupItem: ({ children, value }: any) => <button data-value={value}>{children}</button>,
}))
vi.mock("@/components/ui/small-cta", () => ({
  Empty: ({ children }: any) => <div>{children}</div>,
  EmptyHeader: ({ children }: any) => <div>{children}</div>,
  EmptyMedia: ({ children }: any) => <div>{children}</div>,
  EmptyTitle: ({ children }: any) => <div>{children}</div>,
  EmptyDescription: ({ children }: any) => <div>{children}</div>,
}))

import { NotificationsPopover } from "@/features/notifications/components/notifications-popover/notifications-popover"

describe("NotificationsPopover", () => {
  it("renderizza elenco e invoca azioni principali", () => {
    render(<NotificationsPopover />)
    expect(screen.getByText("Notifications")).toBeInTheDocument()
    expect(screen.getByText("New notification")).toBeInTheDocument()

    fireEvent.click(screen.getByText("New notification"))
    expect(hookState.handleMarkSeen).toHaveBeenCalledWith("1")

    fireEvent.click(screen.getByText("Mark as unread"))
    expect(hookState.handleMarkUnseen).toHaveBeenCalledWith("2")

    fireEvent.click(screen.getAllByText("Delete")[0])
    expect(hookState.handleDelete).toHaveBeenCalledWith("1")
  })
})
