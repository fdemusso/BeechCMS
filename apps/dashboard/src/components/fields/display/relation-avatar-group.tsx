// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useHoverPopover } from "@/hooks/use-hover-popover"
import { cn } from "@/lib/utils"
import { useRelationIdentity } from "./relation-identity"

interface RelationAvatarProps {
  readonly targetSlug: string
  readonly targetId: string
  readonly labelAlias: string
  readonly avatarAlias: string
  readonly onSelect: (id: string) => void
}

/** One related entry as an avatar; its display name is the tooltip. */
const RelationAvatar = memo(function RelationAvatar({ targetSlug, targetId, labelAlias, avatarAlias, onSelect }: RelationAvatarProps) {
  const { label, initials, imageUrl, isLoading } = useRelationIdentity(targetSlug, targetId, labelAlias, avatarAlias)

  if (isLoading) return <Avatar size="sm" className="animate-pulse" aria-hidden />

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar
          size="sm"
          className="cursor-pointer"
          aria-label={label}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelect(targetId)
          }}
        >
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
})

export interface RelationAvatarGroupProps {
  readonly targetSlug: string
  readonly ids: readonly string[]
  readonly labelAlias: string
  readonly avatarAlias: string
  readonly onSelect: (id: string) => void
  /** Maximum visible slots, the "+N" slot included. Defaults to 3, like the permission badges in Roles. */
  readonly max?: number
  readonly className?: string
}

/**
 * Overlapping avatars for a multiple relation, mirroring `PermissionBadgeGroup`: one avatar per entry,
 * its display name in a tooltip, and a "+N" slot that opens the remaining avatars on hover.
 *
 * Cost: one tooltip provider for the whole group, and the overflow avatars (hence their entry lookups)
 * are only mounted while the popover is open.
 */
export function RelationAvatarGroup({ targetSlug, ids, labelAlias, avatarAlias, onSelect, max = 3, className }: RelationAvatarGroupProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, triggerProps } = useHoverPopover()

  const shouldTruncate = ids.length > max
  const visible = shouldTruncate ? ids.slice(0, max - 1) : ids
  const remaining = shouldTruncate ? ids.slice(max - 1) : []

  const avatar = (id: string) => (
    <RelationAvatar
      key={id}
      targetSlug={targetSlug}
      targetId={id}
      labelAlias={labelAlias}
      avatarAlias={avatarAlias}
      onSelect={onSelect}
    />
  )

  return (
    <TooltipProvider>
      <div className={cn("flex items-center -space-x-2", className)}>
        {visible.map((id) => (
          <div key={id} className="relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:scale-105">
            {avatar(id)}
          </div>
        ))}

        {shouldTruncate && (
          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                {...triggerProps}
                onClick={(event) => event.stopPropagation()}
                className="relative z-0 flex size-6 cursor-pointer select-none items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-background transition-transform hover:z-10 hover:scale-105 focus-visible:outline-none focus-visible:ring-ring"
                aria-label={t("fields.relation.moreItems", { count: remaining.length })}
              >
                +{remaining.length}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" {...triggerProps} className="w-auto p-2 shadow-lg">
              <div className="flex items-center gap-1.5">{remaining.map(avatar)}</div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  )
}
