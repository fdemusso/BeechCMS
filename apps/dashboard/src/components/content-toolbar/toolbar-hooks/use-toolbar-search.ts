import { useState, useRef, useEffect, type SyntheticEvent } from "react"

interface UseToolbarSearchProps {
  searchValue: string
  onSearchChange?: (value: string) => void
  onSubmitSearch?: (value: string) => void
}

export function useToolbarSearch({
  searchValue,
  onSearchChange,
  onSubmitSearch,
}: UseToolbarSearchProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus il campo di ricerca dopo che il render lo ha reso visibile nel DOM.
  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  const handleSearchOpen = () => setIsSearchOpen(true)

  const handleSearchClose = () => {
    setIsSearchOpen(false)
    onSearchChange?.("")
  }

  const handleSearchSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = searchInputRef.current?.value ?? searchValue
    onSubmitSearch?.(value)
  }

  // Chiude il campo di ricerca solo se non contiene testo, evitando di
  // perdere una query attiva quando l'utente clicca altrove.
  const handleSearchBlur = () => {
    if (!searchValue && !searchInputRef.current?.value) {
      handleSearchClose()
    }
  }

  return {
    isSearchOpen,
    searchInputRef,
    handleSearchOpen,
    handleSearchClose,
    handleSearchSubmit,
    handleSearchBlur,
  }
}
