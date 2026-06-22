// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useSchema } from "@/features/schema"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EntryEditorDialog } from "@/features/entry-editor"
import type { FieldDisplayProps } from "../types"

const RELATION_STALE_MS = 5 * 60 * 1000

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase()
}

// ── Single chip resolved from cache or fetch ─────────────────────────────────

interface RelationChipProps {
  readonly targetSlug: string
  readonly targetId: string
  readonly labelAlias: string
  readonly onClick: (id: string) => void
}

function RelationChip({ targetSlug, targetId, labelAlias, onClick }: RelationChipProps) {
  const { data: entry, isLoading } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug, targetId),
    queryFn: () => contentApi.fetchById(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: RELATION_STALE_MS,
  })

  if (isLoading) return <Badge variant="secondary" className="opacity-50">…</Badge>

  const rawLabel = (entry?.data as Record<string, unknown> | undefined)?.[labelAlias]

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
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(targetId) }}
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

// ── Single value component ───────────────────────────────────────────────────

interface SingleRelationProps {
  readonly targetSlug: string
  readonly id: string | null
  readonly labelAlias: string
  readonly onClick: (id: string) => void
}

function SingleRelation({ targetSlug, id, labelAlias, onClick }: SingleRelationProps) {
  const { t } = useTranslation()
  const { data: entry, isLoading } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug, id ?? ""),
    queryFn: () => contentApi.fetchById(targetSlug, id!),
    enabled: Boolean(targetSlug && id),
    staleTime: RELATION_STALE_MS,
  })

  if (!id) return <span className="text-muted-foreground">—</span>
  if (isLoading) return <span className="text-muted-foreground">{t("common.loading")}</span>

  const rawLabel = (entry?.data as Record<string, unknown> | undefined)?.[labelAlias]
  
  let label = id ?? ""
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
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(id) }}
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
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(id) }}
        className="text-foreground hover:underline truncate cursor-pointer text-left bg-transparent border-0 p-0 text-sm"
      >
        {label}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RelationDisplay({ branch, value }: FieldDisplayProps) {
  const targetSlug = (branch as { targetSeed?: string; multiple?: boolean }).targetSeed
  const isMultiple = (branch as { multiple?: boolean }).multiple === true

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const [selectedId, setSelectedId] = useState<string | null>(null)

  let content
  // ── Many-to-many: chip row ────────────────────────────────────────────────
  if (isMultiple) {
    const ids = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
    if (ids.length === 0) content = <span className="text-muted-foreground">—</span>
    else {
      const visible = ids.slice(0, 3)
      const overflow = ids.length - visible.length
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
    // ── Single value ──────────────────────────────────────────────────────────
    const id = typeof value === "string" && value.length > 0 ? value : null
    content = <SingleRelation targetSlug={targetSlug ?? ""} id={id} labelAlias={labelAlias} onClick={setSelectedId} />
  }

  return (
    <>
      {content}
      {selectedId && targetSlug && (
        <EntryEditorDialog
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
