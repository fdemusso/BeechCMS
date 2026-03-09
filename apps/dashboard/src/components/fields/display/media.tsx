/**
 * Field Renderer Display per tipo `file`: miniatura immagine o icona file.
 * Se value è URL immagine → Avatar; altrimenti → icona generica.
 */
import { FileIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { FieldDisplayProps } from "../types"

/** Estensioni usate per riconoscere URL di immagini */
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]

/** Indica se l'URL punta a un'immagine (basato su estensione) */
function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.includes(ext))
}

export function MediaDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  const url = String(value)

  if (isImageUrl(url)) {
    return (
      <Avatar className="size-10 shrink-0 rounded-md">
        <AvatarImage src={url} alt="" />
        <AvatarFallback className="rounded-md bg-muted">
          <FileIcon className="size-5 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
    )
  }

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border border-input bg-muted"
      )}
    >
      <FileIcon className="size-5 text-muted-foreground" />
    </div>
  )
}
