import * as React from "react"

interface ExpandableCellProps {
  content: string
  maxLength?: number
  className?: string
}

const COLLAPSE_DELAY_MS = 2000

/**
 * Componente per celle di tabella con contenuto espandibile.
 * Si espande al passaggio del mouse; si comprime dopo 2s dal mouse leave (timer si resetta se rientri).
 * Clicca per fissare/sbloccare.
 */
export function ExpandableCell({
  content,
  maxLength = 50,
  className = "",
}: ExpandableCellProps) {
  const [isPinned, setIsPinned] = React.useState(false)
  const [isHovered, setIsHovered] = React.useState(false)
  const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLong = content.length > maxLength

  React.useEffect(() => () => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
  }, [])

  if (!isLong) {
    return <div className={className}>{content}</div>
  }

  const isExpanded = isPinned || isHovered
  const displayText = isExpanded ? content : content.slice(0, maxLength) + "..."

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
      collapseTimerRef.current = null
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null
      setIsHovered(false)
    }, COLLAPSE_DELAY_MS)
  }

  return (
    <div
      data-expandable
      className={`cursor-pointer select-none transition-colors ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => setIsPinned((prevPinned) => !prevPinned)}
      title={isPinned ? "Clicca per comprimere" : "Passa il mouse o clicca per espandere"}
    >
      {displayText}
    </div>
  )
}
