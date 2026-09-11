// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useContentDeleteDialog } from "@/features/content-delete-dialog/use-content-delete-dialog"

describe("useContentDeleteDialog", () => {
  it("initializes state correctly", () => {
    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: ["id-1", "id-2"],
        onConfirm: vi.fn(),
        onOpenChange: vi.fn(),
      })
    )

    expect(result.current.isDeleting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.entryCount).toBe(2)
    expect(result.current.previewIds).toEqual(["id-1", "id-2"])
    expect(result.current.hasMore).toBe(false)
  })

  it("handles null entryIds safely", () => {
    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: null,
        onConfirm: vi.fn(),
        onOpenChange: vi.fn(),
      })
    )

    expect(result.current.entryCount).toBe(0)
    expect(result.current.previewIds).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it("truncates preview to 3 items and sets hasMore = true", () => {
    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: ["id-1", "id-2", "id-3", "id-4", "id-5"],
        onConfirm: vi.fn(),
        onOpenChange: vi.fn(),
      })
    )

    expect(result.current.entryCount).toBe(5)
    expect(result.current.previewIds).toEqual(["id-1", "id-2", "id-3"])
    expect(result.current.hasMore).toBe(true)
  })

  it("calls onConfirm and onOpenChange upon successful deletion", async () => {
    const onConfirmMock = vi.fn().mockResolvedValue(undefined)
    const onOpenChangeMock = vi.fn()

    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: ["id-1"],
        onConfirm: onConfirmMock,
        onOpenChange: onOpenChangeMock,
      })
    )

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(onConfirmMock).toHaveBeenCalled()
    expect(onOpenChangeMock).toHaveBeenCalledWith(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isDeleting).toBe(false) // finally block resets it
  })

  it("captures Error instance messages during failure", async () => {
    const errorMsg = "API failure"
    const onConfirmMock = vi.fn().mockRejectedValue(new Error(errorMsg))
    const onOpenChangeMock = vi.fn()

    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: ["id-1"],
        onConfirm: onConfirmMock,
        onOpenChange: onOpenChangeMock,
      })
    )

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(onConfirmMock).toHaveBeenCalled()
    expect(onOpenChangeMock).not.toHaveBeenCalled()
    expect(result.current.error).toBe(errorMsg)
    expect(result.current.isDeleting).toBe(false)
  })

  it("captures non-Error rejections with generic fallback message", async () => {
    // Throw a string or object instead of an Error
    const onConfirmMock = vi.fn().mockRejectedValue("String error")
    const onOpenChangeMock = vi.fn()

    const { result } = renderHook(() =>
      useContentDeleteDialog({
        entryIds: ["id-1"],
        onConfirm: onConfirmMock,
        onOpenChange: onOpenChangeMock,
      })
    )

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(result.current.error).toBe("Error during deletion")
    expect(result.current.isDeleting).toBe(false)
  })
})
