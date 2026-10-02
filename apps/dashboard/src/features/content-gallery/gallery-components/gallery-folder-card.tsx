// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Folder } from 'reicon-react'

import type { GalleryCategoryGroup } from "../group-by-category"
import { GALLERY_CARD_SURFACE_CLASS } from "./gallery-card-surface"

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
      className={GALLERY_CARD_SURFACE_CLASS}
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
          <h3 className="font-heading truncate text-base font-semibold">{label}</h3>
          <p className="text-sm text-muted-foreground">{formatItemCount(group.models.length)}</p>
        </div>
      </div>
    </button>
  )
}
