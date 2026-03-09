import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { ExpandableCell } from "@/components/ui/expandable-cell"
import type { FieldDisplayProps } from "../types"

const DEFAULT_JSON_MAX_LENGTH = 40

/**
 * Tags collassabili con Badge colorati.
 * Mostra il primo tag + badge "+N" cliccabile per espandere gli altri.
 */
function CollapsibleTags({ entries }: { entries: [string, string][] }) {
  const [isExpanded, setIsExpanded] = React.useState(false)

  if (entries.length === 0) {
    return <div className="text-muted-foreground">-</div>
  }

  if (entries.length === 1) {
    const [tag, color] = entries[0]
    return (
      <Badge
        variant="secondary"
        style={{
          backgroundColor: color,
          color: "#fff",
          borderColor: color,
        }}
      >
        {tag}
      </Badge>
    )
  }

  const [firstTag, firstColor] = entries[0]
  const remainingCount = entries.length - 1

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <Badge
        variant="secondary"
        style={{
          backgroundColor: firstColor,
          color: "#fff",
          borderColor: firstColor,
        }}
      >
        {firstTag}
      </Badge>
      {!isExpanded && (
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded(true)
          }}
        >
          +{remainingCount}
        </Badge>
      )}
      {isExpanded && (
        <>
          {entries.slice(1).map(([tag, color]) => (
            <Badge
              key={tag}
              variant="secondary"
              style={{
                backgroundColor: color,
                color: "#fff",
                borderColor: color,
              }}
            >
              {tag}
            </Badge>
          ))}
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-muted transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(false)
            }}
          >
            −
          </Badge>
        </>
      )}
    </div>
  )
}

export function JsonDisplay({ branch, value, options }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  let parsed: unknown = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return <div className="text-muted-foreground">Invalid JSON</div>
    }
  }

  /** Euristica: alias contenente "tag" → render con Badge colorati collassabili */
  const isTagsField = branch.alias.toLowerCase().includes("tag")

  try {
    if (isTagsField && typeof parsed === "object" && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, string>)
      return <CollapsibleTags entries={entries} />
    }

    if (isTagsField && Array.isArray(parsed)) {
      return (
        <div className="flex flex-wrap gap-1">
          {parsed.map((tag, index) => (
            <Badge key={index} variant="secondary">
              {String(tag)}
            </Badge>
          ))}
        </div>
      )
    }

    const str = JSON.stringify(parsed, null, 2)
    const maxLength = options?.maxLength ?? DEFAULT_JSON_MAX_LENGTH
    return (
      <ExpandableCell
        content={str}
        maxLength={maxLength}
        className="font-mono text-xs text-muted-foreground"
      />
    )
  } catch {
    return <div className="text-muted-foreground">Invalid JSON</div>
  }
}
