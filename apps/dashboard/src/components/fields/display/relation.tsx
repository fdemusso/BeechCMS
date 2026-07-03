// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useFieldsConfig } from "../context"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { FieldDisplayProps } from "../types"

/** Cache expiration duration for relation queries (5 minutes). */
const RELATION_STALE_MS = 5 * 60 * 1000

/**
 * Extracts initials from a given string label to be used as an avatar fallback.
 *
 * @param label - The text label to extract initials from.
 * @returns A 1-2 character uppercase string, or "?" if empty.
 */
function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase()
}

// ============================================================================
// Single chip resolved from cache or fetch
// ============================================================================

/** Properties for the {@link RelationChip} component. */
interface RelationChipProps {
  /** The target schema seed slug (e.g. "posts"). */
  readonly targetSlug: string
  /** The specific entry ID to fetch. */
  readonly targetId: string
  /** The field alias key to use as the display label (e.g. "title"). */
  readonly labelAlias: string
  /** Callback triggered when the chip avatar is clicked. */
  readonly onClick: (id: string) => void
}

/**
 * RelationChip component that displays a single related entry as an avatar.
 * It fetches the entry detail from the API/cache using the injected fields context.
 *
 * @param props - Component properties conforming to {@link RelationChipProps}.
 */
function RelationChip({ targetSlug, targetId, labelAlias, onClick }: RelationChipProps) {
  const { fetchById, queryKeys } = useFieldsConfig()
  const { data: entry, isLoading } = useQuery({
    queryKey: queryKeys.detail(targetSlug, targetId),
    queryFn: () => fetchById(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: RELATION_STALE_MS,
  })

  if (isLoading) return <Badge variant="secondary" className="opacity-50">…</Badge>

  const rawLabel = entry?.data?.[labelAlias]

  let label = targetId
  if (typeof rawLabel === "string") {
    label = rawLabel
  } else if (typeof rawLabel === "number") {
    label = rawLabel.toString()
  } else if (rawLabel !== undefined && rawLabel !== null) {
    label = JSON.stringify(rawLabel)
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar
            size="sm"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClick(targetId)
            }}
            className="cursor-pointer"
            aria-label={label}
          >
            <AvatarFallback>{initialsOf(label)}</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ============================================================================
// Single value component
// ============================================================================

/** Properties for the {@link SingleRelation} component. */
interface SingleRelationProps {
  /** The target schema seed slug (e.g. "posts"). */
  readonly targetSlug: string
  /** The entry ID of the relation, or null if unassigned. */
  readonly id: string | null
  /** The field alias key to use as the display label (e.g. "title"). */
  readonly labelAlias: string
  /** Callback triggered when the relation label or avatar is clicked. */
  readonly onClick: (id: string) => void
}

/**
 * SingleRelation component displays a single relationship detail with an avatar and text link.
 *
 * @param props - Component properties conforming to {@link SingleRelationProps}.
 */
function SingleRelation({ targetSlug, id, labelAlias, onClick }: SingleRelationProps) {
  const { t: translate } = useTranslation()
  const { fetchById, queryKeys } = useFieldsConfig()
  const { data: entry, isLoading } = useQuery({
    queryKey: queryKeys.detail(targetSlug, id ?? ""),
    queryFn: () => fetchById(targetSlug, id!),
    enabled: Boolean(targetSlug && id),
    staleTime: RELATION_STALE_MS,
  })

  if (!id) return <span className="text-muted-foreground">—</span>
  if (isLoading) return <span className="text-muted-foreground">{translate("common.loading")}</span>

  const rawLabel = entry?.data?.[labelAlias]
  
  let label = id
  if (typeof rawLabel === "string") {
    label = rawLabel
  } else if (typeof rawLabel === "number") {
    label = rawLabel.toString()
  } else if (rawLabel !== undefined && rawLabel !== null) {
    label = JSON.stringify(rawLabel)
  }

  return (
    <div className="flex items-center gap-1.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar
              size="sm"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onClick(id)
              }}
              className="cursor-pointer"
              aria-label={label}
            >
              <AvatarFallback>{initialsOf(label)}</AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClick(id)
        }}
        className="text-foreground hover:underline truncate cursor-pointer text-left bg-transparent border-0 p-0 text-sm"
      >
        {label}
      </button>
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

/**
 * Field Renderer: Relation Display Component.
 * Renders read-only relations (single ID or multiple IDs) as interactive avatars
 * and triggers detail dialog view on click.
 *
 * @param props - Component properties conforming to {@link FieldDisplayProps}.
 */
export function RelationDisplay({ branch, value, options }: FieldDisplayProps) {
  const { useSchema, components } = useFieldsConfig()
  const targetSlug = (branch as { targetSeed?: string; multiple?: boolean }).targetSeed
  const isMultiple = (branch as { multiple?: boolean }).multiple === true

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((schemaSeed) => schemaSeed.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const [selectedId, setSelectedId] = useState<string | null>(null)

  let content
  if (isMultiple) {
    const entryIds = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
    if (entryIds.length === 0) {
      content = <span className="text-muted-foreground">—</span>
    } else {
      const visible = options?.compact ? entryIds.slice(0, 3) : entryIds
      const overflow = entryIds.length - visible.length
      content = (
        <AvatarGroup>
          {visible.map((id) => (
            <RelationChip
              key={id}
              targetSlug={targetSlug ?? ""}
              targetId={id}
              labelAlias={labelAlias}
              onClick={setSelectedId}
            />
          ))}
          {overflow > 0 && <AvatarGroupCount className="text-xs">+{overflow}</AvatarGroupCount>}
        </AvatarGroup>
      )
    }
  } else {
    const id = typeof value === "string" && value.length > 0 ? value : null
    content = <SingleRelation targetSlug={targetSlug ?? ""} id={id} labelAlias={labelAlias} onClick={setSelectedId} />
  }

  return (
    <>
      {content}
      {selectedId && targetSlug && (
        <components.EntryEditorDialog
          schemaSlug={targetSlug}
          entryId={selectedId}
          isDraftContext={false}
          open={true}
          onClose={() => setSelectedId(null)}
          readonly={true}
        />
      )}
    </>
  )
}
