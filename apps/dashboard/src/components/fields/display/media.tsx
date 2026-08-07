// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Display per tipo `file`: renderizza come immagine solo se
 * `fileOptions.accept === 'image'`; altrimenti mostra icona generica senza
 * effettuare richieste HTTP verso l'URL.
 */
import { File as FileIcon } from 'reicon-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { resolveFileOptions } from "@beechcms/core"
import type { FieldDisplayProps } from "../types"

/** True when the branch stores a list of assets (either `multiple: true` or the legacy `asset-list` format flag). */
function isAssetListBranch(maybeBranch: { type: string; multiple?: boolean; format?: string }): boolean {
  return (
    maybeBranch.type === "file" &&
    (maybeBranch.multiple === true || maybeBranch.format === "asset-list")
  )
}

/**
 * Normalizes an asset-list value into a de-duplicated array of URL strings.
 * Accepts a single value or an array, and each item may be a plain URL string
 * or an object with a `url` property; anything else is dropped silently.
 */
function parseAssetListValue(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  const urls = values
    .map((item) => {
      if (typeof item === "string") return item.trim()
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const candidate = (item as Record<string, unknown>).url
        return typeof candidate === "string" ? candidate.trim() : ""
      }
      return ""
    })
    .filter((item) => item.length > 0)
  return [...new Set(urls)]
}

/** Returns a trimmed URL string for single-asset values, or null if empty/not a string. */
function parseSingleUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Renders `file`-type fields. Shows up to 3 thumbnails (plus a "+N" overflow badge) for
 * asset-list branches, or a single thumbnail otherwise. Images are only rendered via
 * `<AvatarImage>` when `fileOptions.accept === 'image'`; other file kinds show a generic
 * icon to avoid firing HTTP requests against non-image URLs.
 */
export function MediaDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  const { accept } = resolveFileOptions(branch)
  const renderAsImage = accept === "image"

  if (isAssetListBranch(branch)) {
    const urls = parseAssetListValue(value)
    if (!urls.length) {
      return <div className="text-muted-foreground">-</div>
    }
    return (
      <div className="flex items-center gap-1">
        {urls.slice(0, 3).map((url, index) =>
          renderAsImage ? (
            <Avatar
              key={`${url}-${index}`}
              className="size-10 shrink-0 rounded-md border border-input bg-muted"
            >
              <AvatarImage src={url} alt="" className="object-cover" />
              <AvatarFallback className="rounded-md bg-muted">
                <FileIcon className="size-5 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div
              key={`${url}-${index}`}
              className="flex size-10 items-center justify-center rounded-md border border-input bg-muted"
            >
              <FileIcon className="size-5 text-muted-foreground" />
            </div>
          )
        )}
        {urls.length > 3 ? (
          <span className="text-xs text-muted-foreground">+{urls.length - 3}</span>
        ) : null}
      </div>
    )
  }

  const url = parseSingleUrl(value)
  if (!url) {
    return <div className="text-muted-foreground">-</div>
  }

  if (!renderAsImage) {
    return (
      <div
        className="flex size-10 items-center justify-center rounded-md border border-input bg-muted"
        title={url}
      >
        <FileIcon className="size-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Avatar className="size-10 shrink-0 rounded-md border border-input bg-muted">
      <AvatarImage src={url} alt="" className="object-cover" />
      <AvatarFallback className="rounded-md bg-muted">
        <FileIcon className="size-5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  )
}
