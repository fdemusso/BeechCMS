// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

const SKELETON_KEYS = [
  "gallery-skeleton-1",
  "gallery-skeleton-2",
  "gallery-skeleton-3",
  "gallery-skeleton-4",
  "gallery-skeleton-5",
  "gallery-skeleton-6",
  "gallery-skeleton-7",
  "gallery-skeleton-8",
]

export function GallerySkeletonGrid() {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 420px))", justifyContent: "center" }}>
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
        >
          {/* Image area */}
          <div className="relative h-44 w-full shrink-0">
            <Skeleton className="h-full w-full rounded-none" />
            <div className="absolute left-3 top-3">
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>

          {/* Content area */}
          <div className="flex flex-1 flex-col gap-2 px-4 py-3">
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-3 w-7/12" />
            <div className="mt-auto flex flex-col gap-2 pt-1">
              <Separator />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
