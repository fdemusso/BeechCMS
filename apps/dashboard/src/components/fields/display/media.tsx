/**
 * Field Renderer Display per tipo `file`: prova sempre a renderizzare l'URL
 * come immagine e usa fallback icona quando la risorsa non è visualizzabile.
 */
import { FileIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { FieldDisplayProps } from "../types"

export function MediaDisplay({ value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  const url = String(value)

  return (
    <Avatar className="size-10 shrink-0 rounded-md border border-input bg-muted">
      <AvatarImage src={url} alt="" className="object-cover" />
      <AvatarFallback className="rounded-md bg-muted">
        <FileIcon className="size-5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  )
}
