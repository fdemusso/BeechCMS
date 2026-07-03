// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Branch, Seed } from "@beechcms/core"
import { Pencil } from "lucide-react"

import { FieldDisplay } from "@/components/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  pendingDraftBadgeClass,
  shouldShowPendingDraftBadge,
} from "@/lib/pending-draft"
import { cn } from "@/lib/utils"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { extractTagChips } from "@/lib/tags-utils"

import {
  partitionGalleryDetailBranches,
  splitMainRichtext,
} from "../gallery-detail-branches"
import { resolveImageUrl } from "../gallery-card-display"
import { resolveCardFields } from "../resolve-card-fields"
import { getPeekEntryTitle } from "../gallery-peek-title"
import { GalleryDetailTags } from "./gallery-detail-tags"
import { GalleryRichtextReadonly } from "./gallery-richtext-readonly"

/** Properties for the {@link GalleryPeekPanel} component. */
interface GalleryPeekPanelProps {
  /** The schema seed definition. */
  readonly seed: Seed
  /** The target content entry detail to view, or null if closed. */
  readonly entry: ContentEntry | null
  /** Controls dialog open visibility. */
  readonly open: boolean
  /** Callback fired when closing the peek panel dialog. */
  readonly onClose: () => void
  /** Callback fired to switch to editing mode for this entry. */
  readonly onEdit: (entryId: string) => void
}

/**
 * Returns Tailwind CSS class strings corresponding to entry status colors.
 *
 * @param status - The raw entry status string.
 * @returns CSS class string for styling the status badge.
 */
function statusBadgeClass(status: string): string {
  const normalizedStatus = status.toLowerCase().trim()
  if (normalizedStatus === "published") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800/60"
  }
  if (normalizedStatus === "draft") {
    return "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800/60"
  }
  if (["error", "failed", "rejected", "archived"].includes(normalizedStatus)) {
    return "bg-red-50 text-red-700 border-red-200/80 dark:bg-red-500/10 dark:text-red-400 dark:border-red-800/60"
  }
  return "bg-muted text-muted-foreground border-border"
}

/**
 * Helper component rendering a single schema field block inside the details view.
 * Handles displaying media fields differently (as preview images) and falls back
 * to the default {@link FieldDisplay} for all other fields.
 */
function FieldBlock({
  branch,
  entry,
}: Readonly<{
  /** Schema branch definition. */
  branch: Branch
  /** The target content entry. */
  entry: ContentEntry
}>) {
  const mediaUrl = branch.type === "file" ? resolveImageUrl(entry.data[branch.alias]) : null

  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {branch.label}
      </h4>
      {mediaUrl ? (
        <div className="overflow-hidden rounded-xl border bg-muted/20">
          <img
            src={mediaUrl}
            alt={branch.label}
            className="h-auto max-h-[60vh] w-full object-contain"
          />
        </div>
      ) : (
        <FieldDisplay branch={branch} value={entry.data[branch.alias]} />
      )}
    </div>
  )
}

/**
 * GalleryPeekPanel component.
 * Displays a quick-view modal of a specific entry, partitioning content fields
 * into main/richtext sections and SEO/meta metadata sections using tabs.
 *
 * @param props - Component properties conforming to {@link GalleryPeekPanelProps}.
 */
export function GalleryPeekPanel({
  seed,
  entry,
  open,
  onClose,
  onEdit,
}: GalleryPeekPanelProps) {
  const { tagsBranch, seoBranches, mainBranches } = React.useMemo(
    () => partitionGalleryDetailBranches(seed),
    [seed]
  )
  const { richtextBranch, otherMainBranches } = React.useMemo(
    () => splitMainRichtext(mainBranches),
    [mainBranches]
  )
  const cardFields = React.useMemo(() => resolveCardFields(seed), [seed])

  if (!entry) return null

  const title = getPeekEntryTitle(seed, entry)
  const tags = tagsBranch ? extractTagChips(entry.data[tagsBranch.alias]) : []
  const hasSeoTab = seoBranches.length > 0
  const defaultTab =
    mainBranches.length === 0 && seoBranches.length > 0 ? "seo" : "content"

  const coverImageUrl = cardFields.coverBranch
    ? resolveImageUrl(entry.data[cardFields.coverBranch.alias])
    : null
  const hasCoverImage = !!coverImageUrl
  const hasPendingDraft = shouldShowPendingDraftBadge(
    entry.status,
    entry.has_pending_draft
  )

  const fixedDetailViewportClass = hasCoverImage
    ? "h-[min(52vh,520px)] min-h-0"
    : "h-[min(62vh,620px)] min-h-0"

  const contentScroll = (
    <ScrollArea className="h-full px-6 py-4">
      <div className="space-y-5 pr-3">
        {richtextBranch && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contenuto principale
            </div>
            <div className="px-4 py-4">
              <GalleryRichtextReadonly
                key={entry.id}
                value={entry.data[richtextBranch.alias]}
                className="border-0 shadow-none"
              />
            </div>
          </div>
        )}

        {otherMainBranches.length > 0 && (
          <div className="space-y-5 px-1">
            {!richtextBranch && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Contenuto
              </p>
            )}
            {otherMainBranches.map((branch, index) => (
              <React.Fragment key={branch.alias}>
                <FieldBlock branch={branch} entry={entry} />
                {index < otherMainBranches.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        )}

        {!richtextBranch && otherMainBranches.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessun campo contenuto.</p>
        )}
      </div>
    </ScrollArea>
  )

  const seoScroll = (
    <ScrollArea className="h-full px-6 py-4">
      <div className="space-y-4 pr-3">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Metadati / SEO
          </div>
          <div className="space-y-5 px-4 py-4">
            {seoBranches.map((branch, index) => (
              <React.Fragment key={branch.alias}>
                <FieldBlock branch={branch} entry={entry} />
                {index < seoBranches.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92vh,920px)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        aria-describedby={undefined}
      >
        {/* Cover image banner */}
        {hasCoverImage && (
          <div className="relative h-[200px] w-full shrink-0 overflow-hidden">
            <img
              src={coverImageUrl!}
              alt={title || "Copertina"}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          </div>
        )}

        <DialogHeader
          className={cn(
            "shrink-0 space-y-0 px-6 pb-4 text-left",
            hasCoverImage ? "pt-3" : "pt-6"
          )}
        >
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1 space-y-2.5">
              <DialogTitle className="text-left text-xl font-semibold leading-snug">
                {title}
              </DialogTitle>
              <GalleryDetailTags tags={tags} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">Stato</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[11px] font-medium", statusBadgeClass(entry.status?.trim() || ""))}
                  >
                    {entry.status?.trim() || "—"}
                  </Badge>
                  {hasPendingDraft && (
                    <Badge
                      variant="outline"
                      className={cn("text-[11px] font-medium", pendingDraftBadgeClass)}
                    >
                      Bozza in sospeso
                    </Badge>
                  )}
                </span>
                {entry.slug != null && String(entry.slug).trim() !== "" && (
                  <>
                    <span aria-hidden className="text-border">·</span>
                    <span className="break-all font-mono text-[11px]">
                      /{String(entry.slug).trim()}
                    </span>
                  </>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => onEdit(entry.id)}
            >
              <Pencil className="size-3.5" />
              Modifica
            </Button>
          </div>
        </DialogHeader>

        <Separator />

        {hasSeoTab ? (
          <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="shrink-0 border-b border-border bg-muted/30 px-6">
              <TabsList variant="line" className="h-10 w-full justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="content" className="text-sm">
                  Contenuto
                </TabsTrigger>
                <TabsTrigger value="seo" className="text-sm">
                  SEO
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="content"
              className={cn("mt-0 overflow-hidden", fixedDetailViewportClass)}
            >
              {contentScroll}
            </TabsContent>
            <TabsContent
              value="seo"
              className={cn("mt-0 overflow-hidden", fixedDetailViewportClass)}
            >
              {seoScroll}
            </TabsContent>
          </Tabs>
        ) : (
          <div className={cn("overflow-hidden", fixedDetailViewportClass)}>
            {contentScroll}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
