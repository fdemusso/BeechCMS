/**
 * Field Renderer Edit per tipo `file`: dropzone per upload immagini.
 * Carica su R2 via POST /api/upload, salva l'URL in onChange.
 */
import * as React from "react"
import { Loader2, Upload, X } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"

/** Attributo accept per input file (solo immagini) */
const IMAGE_ACCEPT = "image/*"

export function MediaEdit({ branch, value, onChange }: FieldEditProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const url = typeof value === "string" ? value : ""

  const handleFile = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Seleziona un'immagine (JPG, PNG, WebP, GIF)")
        return
      }
      setError(null)
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const { data } = await api.post<{ url: string }>("/upload", formData)
        onChange(data.url)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Errore durante il caricamento"
        )
      } finally {
        setIsUploading(false)
      }
    },
    [onChange]
  )

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = React.useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleClick = React.useCallback(() => {
    if (!isUploading) inputRef.current?.click()
  }, [isUploading])

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ""
    },
    [handleFile]
  )

  const handleRemove = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange("")
    },
    [onChange]
  )

  if (url && !isUploading) {
    return (
      <div className="flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-input bg-muted">
          <img
            src={url}
            alt=""
            className="size-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isUploading}
          >
            <Upload className="size-4" />
            Sostituisci
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" />
            Rimuovi
          </Button>
        </div>
        <input
          ref={inputRef}
          id={branch.alias}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 transition-colors",
          "hover:border-primary/50 hover:bg-muted/50",
          isDragging && "border-primary bg-muted/50",
          isUploading && "pointer-events-none opacity-70"
        )}
      >
        <input
          ref={inputRef}
          id={branch.alias}
          type="file"
          accept={IMAGE_ACCEPT}
          className="hidden"
          onChange={handleInputChange}
        />
        {isUploading ? (
          <>
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Caricamento...</span>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" />
            <span className="text-center text-sm text-muted-foreground">
              Trascina un&apos;immagine o clicca per selezionare
            </span>
          </>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
