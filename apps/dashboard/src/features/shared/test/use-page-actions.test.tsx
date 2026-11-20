// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { Check } from "@/components/icons"
import {
  getPageActionDeclarations,
  useDeclarePageActions,
  usePageActionDeclarations,
  type PageActionDeclaration,
} from "../hooks/use-page-actions"

const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440000"

function declaration(title: string): PageActionDeclaration {
  return {
    hostId: "entry-editor",
    targetId: ENTRY_ID,
    title,
    actions: [{ id: "save", label: "Save", icon: Check, perform: { kind: "run", run: () => {} } }],
  }
}

function titles(): string[] {
  return getPageActionDeclarations().map((published) => published.title)
}

describe("useDeclarePageActions", () => {
  it("a mounted caller's declaration is returned by getPageActionDeclarations and usePageActionDeclarations", () => {
    const published = declaration("Edit Post")

    const { result } = renderHook(() => {
      useDeclarePageActions(published)
      return usePageActionDeclarations()
    })

    expect(getPageActionDeclarations()).toEqual([published])
    expect(result.current).toEqual([published])
  })

  it("unmounting the caller withdraws its declaration", () => {
    const { unmount } = renderHook(() => useDeclarePageActions(declaration("Edit Post")))

    unmount()

    expect(getPageActionDeclarations()).toEqual([])
  })

  it("rerendering with null withdraws the declaration while the caller stays mounted", () => {
    const published = declaration("Edit Post")
    const { rerender } = renderHook(
      ({ current }: { current: PageActionDeclaration | null }) => useDeclarePageActions(current),
      { initialProps: { current: published as PageActionDeclaration | null } },
    )

    rerender({ current: null })

    expect(getPageActionDeclarations()).toEqual([])
  })

  it("a new declaration from the same caller replaces the old one and keeps its position", () => {
    const first = renderHook(({ current }) => useDeclarePageActions(current), {
      initialProps: { current: declaration("Edit Post") },
    })
    renderHook(() => useDeclarePageActions(declaration("Edit Page")))

    first.rerender({ current: declaration("Edit Post, renamed") })

    expect(titles()).toEqual(["Edit Page", "Edit Post, renamed"])
  })

  it("two callers are listed most recently published first", () => {
    renderHook(() => useDeclarePageActions(declaration("Edit Post")))
    renderHook(() => useDeclarePageActions(declaration("Edit Page")))

    const snapshot = getPageActionDeclarations()

    expect(snapshot.map((published) => published.title)).toEqual(["Edit Page", "Edit Post"])
  })

  it("rerendering with the same declaration object keeps the same snapshot reference", () => {
    // Regression guard: a fresh array per read makes useSyncExternalStore re-render forever.
    const published = declaration("Edit Post")
    const { rerender } = renderHook(() => {
      useDeclarePageActions(published)
      return usePageActionDeclarations()
    })
    const before = getPageActionDeclarations()

    rerender()

    expect(getPageActionDeclarations()).toBe(before)
  })
})
