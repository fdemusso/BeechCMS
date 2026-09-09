// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { sanitizeHtml } from "@/lib/sanitize-html"
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
 * Caricata in modo asincrono (Lazy) per non scaricare KaTeX/highlight.js nel bundle iniziale.
 */
export function GalleryRichtextReadonly({ value, className }: GalleryRichtextReadonlyProps) {
  const [html, setHtml] = React.useState<string | null>(null)

  React.useEffect(() => {
    let mounted = true
    
    // Caricamento dinamico: scarica renderRichText (e le sue dipendenze pesanti) solo ora!
    import("@beechcms/core/richtext-render").then(({ renderRichText }) => {
      if (mounted) {
        setHtml(renderRichText(value))
      }
    }).catch(err => {
      console.error("Failed to load rich text renderer", err)
      if (mounted) setHtml("")
    })

    return () => { mounted = false }
  }, [value])

  if (html === null) {
    return <div className="text-muted-foreground text-sm animate-pulse">Caricamento anteprima...</div>
  }

  if (isRenderedEmpty(html)) {
    return <div className="text-muted-foreground text-sm">—</div>
  }

  return (
    <div
      className={cn(
        "richtext-content rounded-md bg-transparent text-sm leading-relaxed",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1",
        "[&_p]:mb-2 [&_a]:text-foreground hover:[&_a]:opacity-80",
        className
      )}
      // Contenuto validato e sanitizzato prima dell'iniezione HTML.
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}

