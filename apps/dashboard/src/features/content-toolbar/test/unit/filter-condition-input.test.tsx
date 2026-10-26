// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

import { FilterConditionInput } from "@/features/content-toolbar/toolbar-components/filter-condition-input"

describe("FilterConditionInput", () => {
  it("gives every date condition input its own DOM id", () => {
    const { container } = render(
      <>
        <FilterConditionInput type="date" value={null} onChange={vi.fn()} />
        <FilterConditionInput type="date" value={null} onChange={vi.fn()} />
      </>
    )

    const ids = Array.from(container.querySelectorAll("input[id]"), (input) => input.id)

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})
