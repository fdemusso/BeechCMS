// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { isDateRange } from "@beechcms/widget-sdk"
import { WidgetDateFilter } from "@/features/dashboard/components/widgets/_parts/widget-date-filter"

describe("WidgetDateFilter", () => {
  // A range ending at "now" excludes today's later entries and stops matching its preset a minute later.
  it.each(["This month", "This year"])("%s preset spans through the end of today", async (name) => {
    const onChange = vi.fn()
    render(<WidgetDateFilter value="all" onChange={onChange} />)

    await userEvent.click(screen.getByRole("button"))
    await userEvent.click(await screen.findByRole("button", { name }))

    const next = onChange.mock.calls[0][0]
    expect(isDateRange(next)).toBe(true)
    const to = new Date(next.to * 1000)
    expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59])
  })
})
