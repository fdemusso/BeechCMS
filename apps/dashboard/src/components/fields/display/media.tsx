/**
 * Field Renderer Display per tipo `file`: prova sempre a renderizzare l'URL
 * come immagine e usa fallback icona quando la risorsa non è visualizzabile.
 */
import { FileIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { FieldDisplayProps } from "../types"

function isAssetListBranch(maybeBranch: { type: string; multiple?: boolean; format?: string }): boolean {
  return (
    maybeBranch.type === "file" &&
    (maybeBranch.multiple === true || maybeBranch.format === "asset-list")
  )
}

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

function parseSingleUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function MediaDisplay({ branch, value }: FieldDisplayProps) {
  if (value == null || value === "") {
    return <div className="text-muted-foreground">-</div>
  }

  if (isAssetListBranch(branch)) {
    const urls = parseAssetListValue(value)
    if (!urls.length) {
      return <div className="text-muted-foreground">-</div>
    }
    return (
      <div className="flex items-center gap-1">
        {urls.slice(0, 3).map((url, index) => (
          <Avatar
            key={`${url}-${index}`}
            className="size-10 shrink-0 rounded-md border border-input bg-muted"
          >
            <AvatarImage src={url} alt="" className="object-cover" />
            <AvatarFallback className="rounded-md bg-muted">
              <FileIcon className="size-5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
        ))}
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

  return (
    <Avatar className="size-10 shrink-0 rounded-md border border-input bg-muted">
      <AvatarImage src={url} alt="" className="object-cover" />
      <AvatarFallback className="rounded-md bg-muted">
        <FileIcon className="size-5 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  )
}
