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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
      {SKELETON_KEYS.map((key) => (
        <div key={key} className="h-[320px] overflow-hidden rounded-xl border">
          <Skeleton className="h-[140px] w-full rounded-none" />
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-20" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-10" />
              </div>
            </div>
            <Skeleton className="h-4 w-10/12" />
            <Skeleton className="h-4 w-8/12" />
            <Skeleton className="h-4 w-7/12" />
          </div>
        </div>
      ))}
    </div>
  )
}
