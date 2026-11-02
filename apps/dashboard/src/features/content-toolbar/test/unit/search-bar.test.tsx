// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SearchBar } from "../../toolbar-components/search-bar"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function renderBar(props: { disabled?: boolean }) {
  const handleSearchOpen = vi.fn()
  render(
    <TooltipProvider>
      <SearchBar
        isSearchOpen={false}
        searchValue=""
        searchInputRef={{ current: null }}
        handleSearchSubmit={vi.fn()}
        handleSearchBlur={vi.fn()}
        handleSearchClose={vi.fn()}
        handleSearchOpen={handleSearchOpen}
        {...props}
      />
    </TooltipProvider>,
  )
  return { handleSearchOpen }
}

describe("SearchBar", () => {
  it("keeps the search icon in the toolbar as a disabled button when search is unavailable", () => {
    renderBar({ disabled: true })

    const button = screen.getByRole("button", { name: "toolbar.search.ariaLabel" })

    expect(button).toBeDisabled()
  })

  it("opens the search field from the icon when search is available", () => {
    const { handleSearchOpen } = renderBar({})

    fireEvent.click(screen.getByRole("button", { name: "toolbar.search.ariaLabel" }))

    expect(handleSearchOpen).toHaveBeenCalledTimes(1)
  })
})
