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
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 420px))" }}>
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="flex h-[340px] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-700/50"
        >
          {/* Image area */}
          <Skeleton className="min-h-0 flex-1 rounded-none" />

          {/* Data shelf */}
          <div className="w-full shrink-0 rounded-t-2xl bg-white px-4 py-3 shadow-[0_-6px_20px_0_rgb(0,0,0,0.07)] dark:bg-neutral-900 dark:shadow-[0_-6px_20px_0_rgb(0,0,0,0.30)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="mt-1 h-3 w-7/12" />
            <Skeleton className="mt-2 h-3 w-4/12" />
          </div>
        </div>
      ))}
    </div>
  )
}
