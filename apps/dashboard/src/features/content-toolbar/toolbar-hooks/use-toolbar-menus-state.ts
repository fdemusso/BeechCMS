import { useState } from "react"

export function useToolbarMenusState() {
  const [sortColumnSearchTerm, setSortColumnSearchTerm] = useState("")
  const [filterColumnSearchTerm, setFilterColumnSearchTerm] = useState("")
  const [columnSearchTerm, setColumnSearchTerm] = useState("")
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [openPillId, setOpenPillId] = useState<string | null>(null)
  const [isSettingsMenuOpenState, setIsSettingsMenuOpenState] = useState(false)

  return {
    sortColumnSearchTerm,
    setSortColumnSearchTerm,
    filterColumnSearchTerm,
    setFilterColumnSearchTerm,
    columnSearchTerm,
    setColumnSearchTerm,
    filterMenuOpen,
    setFilterMenuOpen,
    openPillId,
    setOpenPillId,
    isSettingsMenuOpenState,
    setIsSettingsMenuOpenState,
  }
}
