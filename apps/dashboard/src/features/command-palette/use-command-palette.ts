// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState, useEffect, useCallback } from "react"
import type { CommandPage, CommandPaletteState, ResolvedPaletteItem } from "./types"

/**
 * `onOpenChange` is called from the same handlers that change `open`, so a host can mirror the state without an
 * effect that pushes data to it.
 */
export function useCommandPalette(onOpenChange?: (open: boolean) => void): CommandPaletteState {
  const [open, setOpenState] = useState(false)
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )
  const [pages, setPages] = useState<CommandPage[]>(["root"])
  const [search, setSearch] = useState("")
  const [actionsTarget, setActionsTarget] = useState<ResolvedPaletteItem | null>(null)
  const [queryToRestore, setQueryToRestore] = useState("")

  // safe: pages is always initialised with ["root"], at(-1) can never be undefined
  const currentPage: CommandPage = pages.at(-1) ?? "root"

  const pushPage = useCallback((page: CommandPage) => {
    setPages((prev) => [...prev, page])
    setSearch("")
  }, [])

  const openActions = useCallback((target: ResolvedPaletteItem) => {
    setActionsTarget(target)
    setQueryToRestore(search)
    setPages((prev) => [...prev, "actions"])
    setSearch("")
  }, [search])

  const popPage = useCallback(() => {
    setPages((prev) => {
      if (prev.length <= 1) return prev
      return prev.slice(0, -1)
    })
    if (currentPage === "actions") {
      setSearch(queryToRestore)
      setActionsTarget(null)
    } else {
      setSearch("")
    }
  }, [currentPage, queryToRestore])

  // Global keyboard listener: Cmd/Ctrl+K, Alt+N, Backspace-on-empty (Cmd/Ctrl+Shift+L is in the engine, it needs the theme)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Toggle palette
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
        return
      }

      // Alt+N → apre palette sulla pagina "create"
      // e.code: su macOS Option+N produce e.key "˜", non "n"
      // Alt+Shift+N is the host's "new content type" shortcut: leave it alone.
      if (e.code === "KeyN" && e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(true)
        setPages(["root", "create"])
        setSearch("")
        setActionsTarget(null)
        setQueryToRestore("")
        return
      }

      if (!open) return

      // Backspace on empty search → pop page
      if (e.key === "Backspace" && search === "" && pages.length > 1) {
        e.preventDefault()
        popPage()
        return
      }

      // Escape on a sub-page is handled by the dialog's onEscapeKeyDown
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, search, pages.length, popPage, setOpen])

  // Reset state when palette closes
  useEffect(() => {
    if (!open) {
      setSearch("")
      setPages(["root"])
      setActionsTarget(null)
      setQueryToRestore("")
    }
  }, [open])

  return {
    open,
    setOpen,
    pages,
    currentPage,
    pushPage,
    popPage,
    search,
    setSearch,
    actionsTarget,
    openActions,
  }
}
