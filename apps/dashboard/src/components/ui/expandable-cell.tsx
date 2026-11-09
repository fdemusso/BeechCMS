// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"

interface ExpandableCellProps {
  content: string
  maxLength?: number
  className?: string
}

const COLLAPSE_DELAY_MS = 2000
const EXPAND_DELAY_MS = 350
/** The widest an expanded cell gets: past it the column stops growing and the text wraps onto more lines. */
const EXPANDED_MAX_WIDTH = "min(60ch, 50vw)"

/**
 * Componente per celle di tabella con contenuto espandibile.
 * Si espande al passaggio del mouse, e la colonna si allarga per fare spazio al testo fino a EXPANDED_MAX_WIDTH, poi si blocca e il testo va a capo (la riga cresce in altezza); si comprime dopo 2s dal mouse leave (timer si resetta se rientri).
 * Clicca per fissare/sbloccare: sbloccare comprime subito, anche con il mouse ancora sopra; un clic fuori sblocca.
 */
export function ExpandableCell({
  content,
  maxLength = 50,
  className = "",
}: ExpandableCellProps) {
  const [isPinned, setIsPinned] = React.useState(false)
  const [isHovered, setIsHovered] = React.useState(false)
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const isLong = content.length > maxLength

  React.useEffect(() => () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
  }, [])

  // A pinned cell is released by a press anywhere outside it.
  React.useEffect(() => {
    if (!isPinned) return
    const releaseOnOutsidePress = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) setIsPinned(false)
    }
    document.addEventListener("pointerdown", releaseOnOutsidePress)
    return () => document.removeEventListener("pointerdown", releaseOnOutsidePress)
  }, [isPinned])

  if (!isLong) {
    return <div className={className}>{content}</div>
  }

  const isExpanded = isPinned || isHovered

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
    expandTimerRef.current = setTimeout(() => {
      expandTimerRef.current = null
      setIsHovered(true)
    }, EXPAND_DELAY_MS)
  }

  const handleMouseLeave = () => {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current)
      expandTimerRef.current = null
    }
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null
      setIsHovered(false)
    }, COLLAPSE_DELAY_MS)
  }

  // Unpinning while the pointer is still over the cell must collapse it at once: the hover state alone would
  // keep it open and the press would look like it did nothing.
  const handleClick = () => {
    if (isPinned) {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current)
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
      expandTimerRef.current = null
      collapseTimerRef.current = null
      setIsHovered(false)
      setIsPinned(false)
      return
    }
    setIsPinned(true)
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      data-expandable
      className={cn("relative cursor-pointer select-none block text-left", !isExpanded && "max-w-full", className)}
      // Collapsed: a fixed box that cuts the text. Expanded: no width of its own, so the column grows to the text
      // up to EXPANDED_MAX_WIDTH, then holds that width and the text wraps (the row gets taller).
      style={isExpanded ? { maxWidth: EXPANDED_MAX_WIDTH } : { width: `${maxLength}ch` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      title={isPinned ? "Clicca per comprimere" : "Passa il mouse o clicca per espandere"}
    >
      <span className={cn("block", isExpanded ? "break-words whitespace-normal" : "overflow-hidden text-ellipsis whitespace-nowrap")}>
        {content}
      </span>
    </button>
  )
}
