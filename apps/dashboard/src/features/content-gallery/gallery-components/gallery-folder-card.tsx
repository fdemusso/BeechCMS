// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Folder } from 'reicon-react'

import { cn } from "@/lib/utils"

import type { GalleryCategoryGroup } from "../group-by-category"

const MAX_PREVIEWS = 3

export const UNCATEGORIZED_LABEL = "Altre foto"

export function formatItemCount(count: number): string {
  return count === 1 ? "1 foto" : `${count} foto`
}

interface GalleryFolderCardProps {
  readonly group: GalleryCategoryGroup
  readonly onOpen: (key: string | null) => void
}

export function GalleryFolderCard({ group, onOpen }: GalleryFolderCardProps) {
  const label = group.label ?? UNCATEGORIZED_LABEL
  const previews = group.models
    .map((model) => model.imageUrl)
    .filter((url): url is string => !!url)
    .slice(0, MAX_PREVIEWS)

  return (
    <button
      type="button"
      onClick={() => onOpen(group.key)}
      aria-label={`Apri cartella ${label}, ${formatItemCount(group.models.length)}`}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-2xl text-left",
        "bg-card border border-border",
        "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.10),0_2px_6px_-1px_rgb(0,0,0,0.06)]",
        "dark:hover:shadow-[0_8px_24px_0_rgb(0,0,0,0.3)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-muted/40 to-muted/80">
        {previews.length > 0 ? (
          <div className="flex -space-x-4">
            {previews.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt=""
                loading="lazy"
                onError={(event) => { event.currentTarget.style.display = "none" }}
                className="size-20 rounded-lg border-2 border-card object-cover shadow-md transition-transform duration-200 group-hover:-translate-y-1"
              />
            ))}
          </div>
        ) : (
          <Folder className="size-12 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex items-center gap-3 p-4">
        <Folder className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">{formatItemCount(group.models.length)}</p>
        </div>
      </div>
    </button>
  )
}
