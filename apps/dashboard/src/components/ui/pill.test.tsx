// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Pill } from "@/components/ui/pill"

describe("Pill", () => {
  const onClick = vi.fn()
  const onAction = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it("pressing the pill fires the primary action once", () => {
    render(<Pill label="Status" onClick={onClick} />)

    fireEvent.click(screen.getByRole("button", { name: "Status" }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onAction).not.toHaveBeenCalled()
  })

  it("pressing the action icon fires only the secondary action", () => {
    render(
      <Pill
        label="Status"
        onClick={onClick}
        action={{ icon: <span>x</span>, label: "Remove", onClick: onAction }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("renders no action button when the action is not configured", () => {
    render(<Pill label="Status" onClick={onClick} />)

    expect(screen.getAllByRole("button")).toHaveLength(1)
  })

  it("renders a non-interactive pill when no primary action is configured", () => {
    render(<Pill label="Status" />)

    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("reveals the action with the hover animation by default", () => {
    render(<Pill label="Status" action={{ icon: <span>x</span>, label: "Remove", onClick: onAction }} />)

    const action = screen.getByRole("button", { name: "Remove" })

    expect(action).toHaveClass("opacity-0", "group-hover:opacity-100")
  })

  it("keeps the action always visible when the animation is disabled", () => {
    render(
      <Pill
        animated={false}
        label="Status"
        action={{ icon: <span>x</span>, label: "Remove", onClick: onAction }}
      />
    )

    const action = screen.getByRole("button", { name: "Remove" })

    expect(action).not.toHaveClass("opacity-0")
    expect(action).not.toHaveClass("absolute")
  })

  it("a disabled pill blocks both actions", () => {
    render(
      <Pill
        disabled
        label="Status"
        onClick={onClick}
        action={{ icon: <span>x</span>, label: "Remove", onClick: onAction }}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Status" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    expect(onClick).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
  })
})
