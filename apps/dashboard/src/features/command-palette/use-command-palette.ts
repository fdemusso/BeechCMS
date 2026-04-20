import { useState, useEffect, useCallback } from "react"
import type { CommandPage } from "./types"

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<CommandPage[]>(["root"])
  const [search, setSearch] = useState("")

  const currentPage = pages[pages.length - 1]

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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K toggle
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }

      if (!open) return

      // Backspace on empty search pops page
      if (e.key === "Backspace" && search === "" && pages.length > 1) {
        e.preventDefault()
        popPage()
      }

      // Escape pops page if pages > 1, else cmdk handles dialog close
      if (e.key === "Escape" && pages.length > 1) {
        e.preventDefault()
        popPage()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, search, pages.length, popPage])

  // Reset search when open changes to false
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
