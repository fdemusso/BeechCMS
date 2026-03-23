import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

const hookState = {
  notifications: [
    {
      id: "1",
      title: "Nuova notifica",
      description: "Descrizione",
      icon: () => <span>ICON</span>,
      isNew: true,
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
}

vi.mock("@/components/notifications-popover/use-notifications-popover", () => ({
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
vi.mock("@/components/ui/empty", () => ({
  Empty: ({ children }: any) => <div>{children}</div>,
  EmptyHeader: ({ children }: any) => <div>{children}</div>,
  EmptyMedia: ({ children }: any) => <div>{children}</div>,
  EmptyTitle: ({ children }: any) => <div>{children}</div>,
  EmptyDescription: ({ children }: any) => <div>{children}</div>,
}))

import { NotificationsPopover } from "@/components/notifications-popover/notifications-popover"

describe("NotificationsPopover", () => {
  it("renderizza elenco e invoca azioni principali", () => {
    render(<NotificationsPopover />)
    expect(screen.getByText("Notifiche")).toBeInTheDocument()
    expect(screen.getByText("Nuova notifica")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Nuova notifica"))
    expect(hookState.handleMarkSeen).toHaveBeenCalledWith("1")

    fireEvent.click(screen.getByText("Segna come non vista"))
    expect(hookState.handleMarkUnseen).toHaveBeenCalledWith("1")

    fireEvent.click(screen.getByText("Elimina"))
    expect(hookState.handleDelete).toHaveBeenCalledWith("1")
  })
})
