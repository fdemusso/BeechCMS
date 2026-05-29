// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Images, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface MediaGalleryWidgetProps {
  seedSlug?: string
  variant?: "grid" | "unused"
  onOpen?: (key: string) => void
}

interface MediaObject {
  key: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: number
  url: string
}

interface UnusedEntry {
  id: string
  data: Record<string, unknown>
}

function getEntryFileUrl(entry: UnusedEntry): string | null {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && (val.startsWith("http") || val.startsWith("/"))) return val
  }
  return null
}

function entryLabel(entry: UnusedEntry): string {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && val.trim() && !val.startsWith("http") && !val.startsWith("/")) return val
  }
  return entry.id
}

export function MediaGalleryWidget({ seedSlug = "", variant: initialVariant = "grid", onOpen }: MediaGalleryWidgetProps) {
  const [variant, setVariant] = useState(initialVariant)
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const mediaQuery = useQuery({
    queryKey: ["widget", "media-library"],
    queryFn: async (): Promise<MediaObject[]> => {
      const res = await api.get<{ items: MediaObject[]; total: number }>("/content/stats/media-library", {
        params: { limit: 12 },
      })
      return res.data.items
    },
    staleTime: 3 * 60 * 1000,
    enabled: variant === "grid",
  })

  const unusedQuery = useQuery({
    queryKey: ["widget", "media-gallery", seedSlug, "unused"],
    queryFn: async (): Promise<UnusedEntry[]> => {
      const res = await api.get<{ items: UnusedEntry[] }>("/content/stats/unused-media", {
        params: { seedSlug, limit: 12 },
      })
      return res.data.items
    },
    staleTime: 0,
    enabled: variant === "unused" && !!seedSlug,
  })

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await api.delete(`/${encodeURIComponent(key)}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget", "media-library"] })
    },
  })

  const deleteUnusedMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/content/${seedSlug}/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget", "media-gallery", seedSlug] })
    },
  })

  const isLoading = variant === "grid" ? mediaQuery.isLoading : unusedQuery.isLoading
  const isError = variant === "grid" ? mediaQuery.isError : unusedQuery.isError
  const refetch = variant === "grid" ? mediaQuery.refetch : unusedQuery.refetch

  return (
    <div className="h-full w-full flex flex-col rounded-xl border border-neutral-200/60 bg-background/50 backdrop-blur-sm shadow-sm dark:border-neutral-800/60 dark:bg-card/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0">
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Images className="size-4 text-muted-foreground" />
          {t("dashboard.widgets.mediaGallery.title")}
        </span>
        <div className="flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-md border border-border/50">
          <Button
            variant={variant === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setVariant("grid")}
          >
            {t("dashboard.widgets.mediaGallery.all")}
          </Button>
          <Button
            variant={variant === "unused" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setVariant("unused")}
          >
            {t("dashboard.widgets.mediaGallery.unused")}
          </Button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <WidgetError onRetry={() => refetch()} />
        ) : variant === "grid" ? (
          !mediaQuery.data?.length ? (
            <WidgetEmpty
              icon={Images}
              title={t("dashboard.widgets.mediaGallery.emptyTitle")}
              description={t("dashboard.widgets.mediaGallery.emptyDesc")}
            />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {mediaQuery.data.map((item) => {
                const isDeleting = deleteMutation.isPending && deleteMutation.variables === item.key
                const isImage = item.mime_type.startsWith("image/")

                return (
                  <div
                    key={item.key}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg bg-muted/50 border border-border/50 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                      isDeleting && "opacity-50 grayscale pointer-events-none"
                    )}
                    onClick={() => onOpen?.(item.key)}
                  >
                    {isImage ? (
                      <img
                        src={item.url}
                        alt={item.filename}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Images className="size-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white font-medium truncate">{item.filename}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          !unusedQuery.data?.length ? (
            <WidgetEmpty
              icon={Images}
              title={t("dashboard.widgets.mediaGallery.allInUseTitle")}
              description={t("dashboard.widgets.mediaGallery.allInUseDesc")}
            />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {unusedQuery.data.map((entry) => {
                const src = getEntryFileUrl(entry)
                const label = entryLabel(entry)
                const isDeleting = deleteUnusedMutation.isPending && deleteUnusedMutation.variables === entry.id

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg bg-muted/50 border border-border/50 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                      isDeleting && "opacity-50 grayscale pointer-events-none"
                    )}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={label}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Images className="size-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white font-medium truncate mb-1.5">{label}</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 w-full text-[10px] gap-1 px-1.5 bg-red-600 hover:bg-red-500 border-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Eliminare definitivamente ${label}?`)) {
                            deleteUnusedMutation.mutate(entry.id)
                          }
                        }}
                      >
                        <Trash2 className="size-3" /> Elimina
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
