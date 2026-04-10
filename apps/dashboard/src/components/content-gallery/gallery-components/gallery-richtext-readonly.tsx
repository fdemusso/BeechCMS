import * as React from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

import { cn } from "@/lib/utils"

/** Considera vuoto HTML TipTap tipico senza testo visibile. */
function isRichtextEmpty(html: string): boolean {
  const text = html.replaceAll(/<[^>]*>/g, "").replaceAll("\u00a0", " ").trim()
  return text.length === 0
}

interface GalleryRichtextReadonlyProps {
  readonly value: unknown
  readonly className?: string
}

/**
 * Anteprima richtext con TipTap in sola lettura (stesso motore dell’editor, toolbar assente).
 */
export function GalleryRichtextReadonly({ value, className }: GalleryRichtextReadonlyProps) {
  const html = typeof value === "string" ? value : ""

  const editor = useEditor({
    extensions: [StarterKit],
    content: html || "<p></p>",
    editable: false,
  })

  React.useEffect(() => {
    if (!editor) return
    const next = typeof value === "string" ? value : ""
    editor.commands.setContent(next || "<p></p>")
  }, [editor, value])

  if (!editor) return null

  if (isRichtextEmpty(html)) {
    return <div className="text-muted-foreground text-sm">—</div>
  }

  return (
    <div
      className={cn(
        "rounded-md bg-transparent text-sm",
        className
      )}
    >
      <EditorContent
        editor={editor}
        className="select-text [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:bg-transparent"
      />
    </div>
  )
}
