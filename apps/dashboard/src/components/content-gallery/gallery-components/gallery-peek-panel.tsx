import * as React from "react"
import type { Branch, Seed } from "@beech/core"

import { FieldDisplay } from "@/components/fields"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { extractTagNames } from "@/lib/tags-utils"

import {
  partitionGalleryDetailBranches,
  splitMainRichtext,
} from "../gallery-detail-branches"
import { resolveImageUrl } from "../gallery-card-display"
import { getPeekEntryTitle } from "../gallery-peek-title"
import { GalleryDetailTags } from "./gallery-detail-tags"
import { GalleryRichtextReadonly } from "./gallery-richtext-readonly"

interface GalleryPeekPanelProps {
  readonly seed: Seed
  readonly entry: ContentEntry | null
  readonly open: boolean
  readonly onClose: () => void
  readonly onEdit: (entryId: string) => void
}

function FieldBlock({
  branch,
  entry,
}: Readonly<{
  branch: Branch
  entry: ContentEntry
}>) {
  const mediaUrl = branch.type === "file" ? resolveImageUrl(entry.data[branch.alias]) : null

  return (
    <div className="space-y-2">
      <h4 className="text-muted-foreground text-xs font-medium">{branch.label}</h4>
      {mediaUrl ? (
        <div className="rounded-lg border bg-muted/20 p-2">
          <img
            src={mediaUrl}
            alt={branch.label}
            className="h-auto max-h-[70vh] w-full object-contain"
          />
        </div>
      ) : (
        <FieldDisplay branch={branch} value={entry.data[branch.alias]} />
      )}
    </div>
  )
}

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

  if (!entry) return null

  const title = getPeekEntryTitle(seed, entry)
  const tagNames = tagsBranch ? extractTagNames(entry.data[tagsBranch.alias]) : []
  const hasSeoTab = seoBranches.length > 0
  const defaultTab =
    mainBranches.length === 0 && seoBranches.length > 0 ? "seo" : "content"
  const fixedDetailViewportClass = "h-[min(65vh,640px)] min-h-0"

  const contentScroll = (
    <ScrollArea className="h-full px-6 py-4">
      <div className="space-y-4 pr-3">
        {richtextBranch && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="bg-muted/40 text-muted-foreground flex items-center justify-center border-b px-4 py-2 text-xs font-medium tracking-wide">
              Contenuto principale
            </div>
            <CardContent className="px-4 py-4">
              <GalleryRichtextReadonly
                key={entry.id}
                value={entry.data[richtextBranch.alias]}
                className="border-0 shadow-none"
              />
            </CardContent>
          </Card>
        )}

        {otherMainBranches.length > 0 && (
          <div className="space-y-5 px-1">
            {!richtextBranch && (
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Contenuto
              </p>
            )}
            {otherMainBranches.map((branch, index) => (
              <React.Fragment key={branch.id}>
                <FieldBlock branch={branch} entry={entry} />
                {index < otherMainBranches.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        )}

        {!richtextBranch && otherMainBranches.length === 0 && (
          <p className="text-muted-foreground text-sm">Nessun campo contenuto.</p>
        )}
      </div>
    </ScrollArea>
  )

  const seoScroll = (
    <ScrollArea className="h-full px-6 py-4">
      <div className="space-y-4 pr-3">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-base">Metadati / SEO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-4 pt-0">
            {seoBranches.map((branch) => (
              <FieldBlock key={branch.id} branch={branch} entry={entry} />
            ))}
          </CardContent>
        </Card>
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
        <DialogHeader className="shrink-0 space-y-0 px-6 pt-6 pb-4 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1 space-y-3">
              <DialogTitle className="text-left text-xl leading-snug font-semibold">
                {title}
              </DialogTitle>
              <GalleryDetailTags tags={tagNames} />
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">Stato</span>
                  <Badge variant="outline" className="font-normal">
                    {entry.status?.trim() || "—"}
                  </Badge>
                </span>
                {entry.slug != null && String(entry.slug).trim() !== "" && (
                  <>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                    <span className="font-mono text-[11px] break-all">
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
              className="shrink-0"
              onClick={() => onEdit(entry.id)}
            >
              Modifica
            </Button>
          </div>
        </DialogHeader>

        <Separator />

        {hasSeoTab ? (
          <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="bg-muted/30 shrink-0 border-b px-6">
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
              className={`mt-0 ${fixedDetailViewportClass} overflow-hidden`}
            >
              {contentScroll}
            </TabsContent>
            <TabsContent
              value="seo"
              className={`mt-0 ${fixedDetailViewportClass} overflow-hidden`}
            >
              {seoScroll}
            </TabsContent>
          </Tabs>
        ) : (
          <div className={fixedDetailViewportClass}>{contentScroll}</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
