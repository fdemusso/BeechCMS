// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import { useFieldsConfig } from "../context"
import { useRelationLabel } from "../relation-label"

/** Cache expiration duration for relation queries (5 minutes). */
const RELATION_STALE_MS = 5 * 60 * 1000

export interface RelationIdentity {
  /** Display name of the related entry; the id when the entry has none. */
  readonly label: string
  /** Avatar text when there is no image: initials of the display name, else the last two characters of the id. */
  readonly initials: string
  /** Avatar image URL, or null when the relation has no avatar source or the entry has no image. */
  readonly imageUrl: string | null
  readonly isLoading: boolean
}

/** 1-2 uppercase characters: the first letters of the first and last word. */
export function initialsOf(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase()
}

/**
 * Resolves how a related entry presents itself. The fallback chain is image → initials of the display
 * name → last two characters of the id, so an avatar is never blank.
 *
 * @param id The related entry id.
 * @param rawLabel The entry's display-name value as stored (any type).
 * @param avatarValue The entry's avatar-source value, when the relation configures one.
 */
export function toRelationIdentity(id: string, rawLabel: unknown, avatarValue?: unknown): Omit<RelationIdentity, "isLoading"> {
  let text = ""
  if (typeof rawLabel === "string") text = rawLabel
  else if (typeof rawLabel === "number") text = rawLabel.toString()
  else if (rawLabel !== undefined && rawLabel !== null) text = JSON.stringify(rawLabel)

  const imageUrl = typeof avatarValue === "string" && avatarValue.trim() !== "" ? avatarValue.trim() : null
  return {
    label: text === "" ? id : text,
    initials: initialsOf(text) || id.slice(-2).toUpperCase(),
    imageUrl,
  }
}

/**
 * The identity of one related entry, read from the TanStack Query detail cache. A list response primes
 * that cache (label and avatar URL) so rows resolve without a request; an entry the list did not cover
 * is fetched once and shared by every chip pointing at it.
 */
export function useRelationIdentity(
  targetSlug: string,
  id: string | null,
  labelAlias: string,
  avatarAlias?: string,
): RelationIdentity {
  const { fetchById, queryKeys } = useFieldsConfig()
  const labelOf = useRelationLabel(targetSlug)
  const { data: entry, isLoading } = useQuery({
    queryKey: queryKeys.detail(targetSlug, id ?? ""),
    queryFn: () => fetchById(targetSlug, id!),
    enabled: Boolean(targetSlug && id),
    staleTime: RELATION_STALE_MS,
  })

  const identity = toRelationIdentity(
    id ?? "",
    labelOf(entry?.data, labelAlias),
    avatarAlias ? entry?.data?.[avatarAlias] : undefined,
  )
  return { ...identity, isLoading }
}
