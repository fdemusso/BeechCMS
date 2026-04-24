import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Images, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { WidgetEmpty } from "./_parts/widget-empty"
import { WidgetError } from "./_parts/widget-error"

export interface MediaGalleryWidgetProps {
  seedSlug: string
  variant?: "grid" | "unused"
  onOpen?: (id: string) => void
}

interface ContentListResponse {
  items: ContentEntry[]
  total: number
}

function getFileUrl(entry: ContentEntry): string | null {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && (val.startsWith("http") || val.startsWith("/"))) return val
  }
  return null
}

function entryLabel(entry: ContentEntry): string {
  for (const val of Object.values(entry.data)) {
    if (typeof val === "string" && val.trim() && !val.startsWith("http") && !val.startsWith("/")) return val
  }
  return entry.id
}

export function MediaGalleryWidget({ seedSlug, variant: initialVariant = "grid", onOpen }: MediaGalleryWidgetProps) {
  const [variant, setVariant] = useState(initialVariant)
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["widget", "media-gallery", seedSlug, variant],
    queryFn: async (): Promise<ContentEntry[]> => {
      const endpoint = variant === "unused" ? "/content/stats/unused-media" : `/content/${seedSlug}`
      const res = await api.get<ContentListResponse | ContentEntry[]>(endpoint, {
        params: { seedSlug, limit: 12 },
      })
      const d = res.data
      return Array.isArray(d) ? d : d.items
    },
    staleTime: variant === "unused" ? 0 : 3 * 60 * 1000,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/content/${seedSlug}/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget", "media-gallery", seedSlug] })
    }
  })

  const entries = data ?? []

  return (
    <div className="h-full w-full flex flex-col rounded-xl border border-neutral-200/60 bg-background/50 backdrop-blur-sm shadow-sm dark:border-neutral-800/60 dark:bg-neutral-900/40 overflow-hidden">
      {/* Header */}
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

      {/* Body */}
      <div className="flex-1 p-3 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <WidgetError onRetry={() => refetch()} />
        ) : !entries.length ? (
          <WidgetEmpty
            icon={Images}
            title={variant === "unused" ? t("dashboard.widgets.mediaGallery.allInUseTitle") : t("dashboard.widgets.mediaGallery.emptyTitle")}
            description={variant === "unused" ? t("dashboard.widgets.mediaGallery.allInUseDesc") : t("dashboard.widgets.mediaGallery.emptyDesc")}
          />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {entries.map((entry) => {
              const src = getFileUrl(entry)
              const label = entryLabel(entry)
              const isDeleting = deleteMutation.isPending && deleteMutation.variables === entry.id

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg bg-muted/50 border border-border/50 cursor-pointer transition-all hover:ring-2 hover:ring-primary/20",
                    isDeleting && "opacity-50 grayscale pointer-events-none"
                  )}
                  onClick={() => variant === "grid" && onOpen?.(entry.id)}
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

                  {/* Overlay with gradient */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white font-medium truncate mb-1.5">{label}</p>
                    {variant === "unused" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 w-full text-[10px] gap-1 px-1.5 bg-red-600 hover:bg-red-500 border-none"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Eliminare definitivamente ${label}?`)) {
                            deleteMutation.mutate(entry.id)
                          }
                        }}
                      >
                        <Trash2 className="size-3" /> Elimina
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

