// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { resolveRelationAvatar } from "@beechcms/core"
import { useFieldsConfig } from "../context"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { FieldDisplayProps } from "../types"
import { RelationAvatarGroup } from "./relation-avatar-group"
import { useRelationIdentity } from "./relation-identity"

// ============================================================================
// Multiple relation without an avatar: display names as badges
// ============================================================================

/** Properties for the {@link RelationNameBadge} component. */
interface RelationNameBadgeProps {
  /** The target schema seed slug (e.g. "posts"). */
  readonly targetSlug: string
  /** The specific entry ID to resolve. */
  readonly targetId: string
  /** The field alias key to use as the display label (e.g. "title"). */
  readonly labelAlias: string
  /** Callback triggered when the badge is clicked. */
  readonly onClick: (id: string) => void
}

/** One related entry as a name badge, for relations that configure no avatar. */
function RelationNameBadge({ targetSlug, targetId, labelAlias, onClick }: RelationNameBadgeProps) {
  const { label, isLoading } = useRelationIdentity(targetSlug, targetId, labelAlias)

  if (isLoading) return <Badge variant="secondary" className="opacity-50">…</Badge>

  return (
    <Badge
      variant="secondary"
      className="max-w-40 cursor-pointer truncate"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick(targetId)
      }}
    >
      {label}
    </Badge>
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
  /** Target branch supplying the avatar image; absent = the relation shows no avatar. */
  readonly avatarAlias: string | undefined
  /** Callback triggered when the relation label or avatar is clicked. */
  readonly onClick: (id: string) => void
}

/**
 * SingleRelation shows the related entry's display name as a link, preceded by its avatar when the
 * relation configures one.
 *
 * @param props - Component properties conforming to {@link SingleRelationProps}.
 */
function SingleRelation({ targetSlug, id, labelAlias, avatarAlias, onClick }: SingleRelationProps) {
  const { t: translate } = useTranslation()
  const { label, initials, imageUrl, isLoading } = useRelationIdentity(targetSlug, id, labelAlias, avatarAlias)

  if (!id) return <span className="text-muted-foreground">—</span>
  if (isLoading) return <span className="text-muted-foreground">{translate("common.loading")}</span>

  const open = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
    onClick(id)
  }

  return (
    <div className="flex items-center gap-1.5">
      {avatarAlias ? (
        <Avatar size="sm" onClick={open} className="cursor-pointer" aria-label={label}>
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      ) : null}
      <button
        type="button"
        onClick={open}
        className="text-foreground hover:opacity-80 transition-opacity truncate cursor-pointer text-left bg-transparent border-0 p-0 text-sm"
      >
        {label}
      </button>
    </div>
  )
}

// ============================================================================
// Multiple value component
// ============================================================================

/** Properties for the {@link MultipleRelation} component. */
interface MultipleRelationProps {
  /** The target schema seed slug (e.g. "posts"). */
  readonly targetSlug: string
  /** The raw field value; expected to be an array of entry IDs. */
  readonly value: unknown
  /** The field alias key to use as the display label (e.g. "title"). */
  readonly labelAlias: string
  /** Target branch supplying the avatar image; absent = name badges are shown instead. */
  readonly avatarAlias: string | undefined
  /** Whether to truncate the list to three entries. */
  readonly compact: boolean
  /** Callback triggered when an entry is clicked. */
  readonly onSelect: (id: string) => void
}

/**
 * MultipleRelation shows several related entries: overlapping avatars when the relation configures one,
 * name badges otherwise.
 *
 * @param props - Component properties conforming to {@link MultipleRelationProps}.
 */
function MultipleRelation({ targetSlug, value, labelAlias, avatarAlias, compact, onSelect }: MultipleRelationProps) {
  const entryIds = Array.isArray(value) ? (value as string[]).filter(Boolean) : []
  if (entryIds.length === 0) return <span className="text-muted-foreground">—</span>

  if (avatarAlias) {
    return (
      <RelationAvatarGroup
        targetSlug={targetSlug}
        ids={entryIds}
        labelAlias={labelAlias}
        avatarAlias={avatarAlias}
        onSelect={onSelect}
        max={compact ? 3 : Math.max(3, entryIds.length)}
      />
    )
  }

  const visible = compact ? entryIds.slice(0, 3) : entryIds
  const overflow = entryIds.length - visible.length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((id) => (
        <RelationNameBadge key={id} targetSlug={targetSlug} targetId={id} labelAlias={labelAlias} onClick={onSelect} />
      ))}
      {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow}</span>}
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

/**
 * Field Renderer: Relation Display Component.
 * Renders read-only relations and opens the detail dialog on click. The avatar is opt-in per relation
 * (`avatarSource` on the branch):
 * - single, with avatar: avatar + display name; without: display name only.
 * - multiple, with avatar: overlapping avatars (display name in the tooltip); without: name badges.
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
  const avatarAlias = resolveRelationAvatar(branch, (slug) => seeds?.find((schemaSeed) => schemaSeed.slug === slug))?.alias

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const id = typeof value === "string" && value.length > 0 ? value : null
  const content = isMultiple ? (
    <MultipleRelation
      targetSlug={targetSlug ?? ""}
      value={value}
      labelAlias={labelAlias}
      avatarAlias={avatarAlias}
      compact={options?.compact === true}
      onSelect={setSelectedId}
    />
  ) : (
    <SingleRelation targetSlug={targetSlug ?? ""} id={id} labelAlias={labelAlias} avatarAlias={avatarAlias} onClick={setSelectedId} />
  )

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
