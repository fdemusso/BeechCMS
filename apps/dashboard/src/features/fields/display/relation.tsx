// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useSchema } from "@/features/schema"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
import type { FieldDisplayProps } from "../types"

const RELATION_STALE_MS = 5 * 60 * 1000

export function RelationDisplay({ branch, value }: FieldDisplayProps) {
  const { t } = useTranslation()
  const targetSlug = (branch as { targetSeed?: string }).targetSeed
  const id = typeof value === "string" && value.length > 0 ? value : null

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const { data: entry, isLoading } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug ?? "", id ?? ""),
    queryFn: () => contentApi.fetchById(targetSlug!, id!),
    enabled: Boolean(targetSlug && id),
    staleTime: RELATION_STALE_MS,
  })

  if (!id) return <span className="text-muted-foreground">—</span>
  if (isLoading) return <span className="text-muted-foreground">{t("common.loading")}</span>

  const label = (entry?.data as Record<string, unknown> | undefined)?.[labelAlias] ?? id

  return (
    <Link
      to={`/content/${targetSlug}/${id}`}
      className="text-primary hover:underline truncate"
    >
      {String(label)}
    </Link>
  )
}
