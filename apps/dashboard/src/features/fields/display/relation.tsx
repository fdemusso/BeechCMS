// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useSchema } from "@/features/schema"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import { Badge } from "@/components/ui/badge"
import type { FieldDisplayProps } from "../types"

const RELATION_STALE_MS = 5 * 60 * 1000

// ── Single chip resolved from cache or fetch ─────────────────────────────────

interface RelationChipProps {
  readonly targetSlug: string
  readonly targetId: string
  readonly labelAlias: string
}

function RelationChip({ targetSlug, targetId, labelAlias }: RelationChipProps) {
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
    <Badge variant="secondary" asChild className="hover:bg-secondary/80 cursor-pointer">
      <Link to={`/content/${targetSlug}/${targetId}`}>{label}</Link>
    </Badge>
  )
}

// ── Single value component ───────────────────────────────────────────────────

interface SingleRelationProps {
  readonly targetSlug: string
  readonly id: string | null
  readonly labelAlias: string
}

function SingleRelation({ targetSlug, id, labelAlias }: SingleRelationProps) {
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
    <Link
      to={`/content/${targetSlug}/${id}`}
      className="text-primary hover:underline truncate"
    >
      {label}
    </Link>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function RelationDisplay({ branch, value }: FieldDisplayProps) {
  const targetSlug = (branch as { targetSeed?: string; multiple?: boolean }).targetSeed
  const isMultiple = (branch as { multiple?: boolean }).multiple === true

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  // ── Many-to-many: chip row ────────────────────────────────────────────────
  if (isMultiple) {
    const ids = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
    if (ids.length === 0) return <span className="text-muted-foreground">—</span>

    return (
      <div className="flex flex-wrap gap-1">
        {ids.map((id) => (
          <RelationChip
            key={id}
            targetSlug={targetSlug ?? ""}
            targetId={id}
            labelAlias={labelAlias}
          />
        ))}
      </div>
    )
  }

  // ── Single value ──────────────────────────────────────────────────────────
  const id = typeof value === "string" && value.length > 0 ? value : null

  return <SingleRelation targetSlug={targetSlug ?? ""} id={id} labelAlias={labelAlias} />
}
