// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Branch } from "@beechcms/core"
import { FieldDisplay } from "@/components/fields"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { ContentEntry } from "@/lib/dynamic-columns"
import { resolveImageUrl } from "../gallery-card-display"
import { GalleryRichtextReadonly } from "./gallery-richtext-readonly"

/**
 * Properties for the {@link GalleryPeekFieldBlock} component.
 */
export interface GalleryPeekFieldBlockProps {
  /** The schema branch definition for this field. */
  branch: Branch
  /** The content entry to read the field value from. */
  entry: ContentEntry
}

/**
 * Helper component rendering a single schema field block inside the details view.
 * Handles displaying media fields differently (as preview images) and falls back
 * to the default FieldDisplay for all other fields.
 */
export function GalleryPeekFieldBlock({ branch, entry }: GalleryPeekFieldBlockProps) {
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
 * Properties for the {@link GalleryPeekContentSection} component.
 */
export interface GalleryPeekContentSectionProps {
  /** The target content entry. */
  entry: ContentEntry
  /** Main rich-text branch for the entry, if configured. */
  richtextBranch?: Branch
  /** Other non-SEO main content branches of this seed. */
  otherMainBranches: Branch[]
}

/**
 * Renders the main content tab inside the peek preview panel, incorporating
 * rich-text and other primary field blocks.
 */
export function GalleryPeekContentSection({
  entry,
  richtextBranch,
  otherMainBranches,
}: GalleryPeekContentSectionProps) {
  return (
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
                <GalleryPeekFieldBlock branch={branch} entry={entry} />
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
}

/**
 * Properties for the {@link GalleryPeekSeoSection} component.
 */
export interface GalleryPeekSeoSectionProps {
  /** The target content entry. */
  entry: ContentEntry
  /** List of schema branches marked as SEO/Metadata. */
  seoBranches: Branch[]
}

/**
 * Renders the SEO tab inside the peek preview panel, grouping search-engine tags
 * and meta attributes block by block.
 */
export function GalleryPeekSeoSection({ entry, seoBranches }: GalleryPeekSeoSectionProps) {
  return (
    <ScrollArea className="h-full px-6 py-4">
      <div className="space-y-4 pr-3">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Metadati / SEO
          </div>
          <div className="space-y-5 px-4 py-4">
            {seoBranches.map((branch, index) => (
              <React.Fragment key={branch.alias}>
                <GalleryPeekFieldBlock branch={branch} entry={entry} />
                {index < seoBranches.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
