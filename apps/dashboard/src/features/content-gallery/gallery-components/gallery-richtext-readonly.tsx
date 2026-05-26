// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { renderRichText } from "@beechcms/core"

import { cn } from "@/lib/utils"

function isRenderedEmpty(html: string): boolean {
  const text = html.replaceAll(/<[^>]*>/g, "").replaceAll("\u00a0", " ").trim()
  return text.length === 0
}

interface GalleryRichtextReadonlyProps {
  readonly value: unknown
  readonly className?: string
}

/**
 * Anteprima richtext: stesso schema JSON/envelope dell'editor, output HTML via `@beechcms/core`.
 */
export function GalleryRichtextReadonly({ value, className }: GalleryRichtextReadonlyProps) {
  const html = renderRichText(value)

  if (isRenderedEmpty(html)) {
    return <div className="text-muted-foreground text-sm">—</div>
  }

  return (
    <div
      className={cn(
        "richtext-content rounded-md bg-transparent text-sm leading-relaxed",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1",
        "[&_p]:mb-2 [&_a]:text-primary [&_a]:underline",
        className
      )}
      // Contenuto già validato da `@beechcms/core` in scrittura; solo anteprima admin.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
