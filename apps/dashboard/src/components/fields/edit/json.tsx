// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check, Plus, X } from 'reicon-react'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { FieldEditProps } from "../types"
import { JsonCodeEditor } from "./json-code-editor"

function parseTagsValue(value: unknown): Record<string, string> {
  if (!value) return {}
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, string>
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, string>
    } catch {
      // ignore
    }
  }
  return {}
}

export function JsonEdit({ branch, value, onChange, disabled, readOnly: propReadOnly }: FieldEditProps) {
  const isTagsField = branch.type === "tags" || branch.alias.toLowerCase().includes("tag")
  const hasOptions = isTagsField && (branch.options?.length ?? 0) > 0
  const isReadOnly = Boolean(propReadOnly || disabled || (branch as unknown as { readOnly?: boolean }).readOnly)
  const [isAddOpen, setIsAddOpen] = React.useState(false)

  if (isTagsField && hasOptions) {
    const currentTags = parseTagsValue(value)
    const predefinedOptions = branch.options ?? []

    const DEFAULT_COLORS = [
      "#3b82f6", "#06b6d4", "#8b5cf6", "#10b981",
      "#f59e0b", "#ef4444", "#ec4899", "#64748b",
    ]

    const toggleTag = (tag: string) => {
      if (isReadOnly) return
      const next = { ...currentTags }
      if (!Object.hasOwn(next, tag) || next[tag] === undefined) {
        const idx = Object.keys(next).length % DEFAULT_COLORS.length
        next[tag] = DEFAULT_COLORS[idx]
      } else {
        delete next[tag]
      }
      onChange(next)
    }

    const activeEntries = Object.entries(currentTags).filter(([key]) =>
      Object.hasOwn(currentTags, key)
    )
    const availableOptions = predefinedOptions.filter(
      (opt: string) => !Object.hasOwn(currentTags, opt) || currentTags[opt] === undefined
    )

    return (
      <div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
          {activeEntries.length > 0 ? (
            activeEntries.map(([tag, color]) => (
              <button
                key={tag}
                type="button"
                disabled={isReadOnly}
                onClick={() => toggleTag(tag)}
                className="group relative min-w-0 max-w-full disabled:cursor-not-allowed"
                aria-label={`Remove tag ${tag}`}
                title={tag}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer select-none border-transparent pr-2 transition min-w-0 max-w-full"
                  style={{
                    backgroundColor: color,
                    color: "#fff",
                    borderColor: color,
                  }}
                >
                  <span className="block min-w-0 max-w-[260px] truncate">{tag}</span>
                </Badge>
                {!isReadOnly && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-destructive/90 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <X className="size-3.5" />
                  </span>
                )}
              </button>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No tags selected</span>
          )}

          {!isReadOnly && (
            <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-6 rounded-full"
                  aria-label="Add tag"
                >
                  <Plus className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 max-w-full p-2">
                <div className="mb-2 text-xs text-muted-foreground">
                  Select a tag from the seed
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {predefinedOptions.map((opt: string) => {
                    const isActive = Object.hasOwn(currentTags, opt) && currentTags[opt] !== undefined
                    return (
                      <button
                        key={opt}
                        type="button"
                        title={opt}
                        onClick={() => {
                          toggleTag(opt)
                          if (isActive) return
                          setIsAddOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                          isActive
                            ? "bg-accent/70 text-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <span className="min-w-0 max-w-[200px] truncate">{opt}</span>
                        {isActive ? <Check className="size-4 shrink-0" /> : null}
                      </button>
                    )
                  })}
                  {availableOptions.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      All tags from the seed are already selected.
                    </p>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    )
  }

  return (
    <JsonCodeEditor
      id={branch.alias}
      value={value}
      onChange={(text) => onChange(text)}
      readOnly={isReadOnly}
    />
  )
}
