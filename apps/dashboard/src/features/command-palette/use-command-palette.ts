// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState, useEffect, useCallback } from "react"
import type { CommandPage, CommandPaletteState } from "./types"

export function useCommandPalette(): CommandPaletteState {
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<CommandPage[]>(["root"])
  const [search, setSearch] = useState("")

  // safe: pages is always initialised with ["root"], at(-1) can never be undefined
  const currentPage: CommandPage = pages.at(-1) ?? "root"

  const pushPage = useCallback((page: CommandPage) => {
    setPages((prev) => [...prev, page])
    setSearch("")
  }, [])

  const popPage = useCallback(() => {
    setPages((prev) => {
      if (prev.length <= 1) return prev
      return prev.slice(0, -1)
    })
    setSearch("")
  }, [])

  // Global keyboard listener: Cmd/Ctrl+K, Alt+N, Backspace-on-empty, Escape
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Toggle palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }

      // Alt+N → apre palette sulla pagina "create"
      if (e.key === "n" && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(true)
        setPages(["root", "create"])
        setSearch("")
        return
      }

      if (!open) return

      // Backspace on empty search → pop page
      if (e.key === "Backspace" && search === "" && pages.length > 1) {
        e.preventDefault()
        popPage()
        return
      }

      // Escape: pop sub-page or close
      if (e.key === "Escape" && pages.length > 1) {
        e.preventDefault()
        popPage()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, search, pages.length, popPage])

  // Reset state when palette closes
  useEffect(() => {
    if (!open) {
      setSearch("")
      setPages(["root"])
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
  }
}
