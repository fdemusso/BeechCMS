/**
 * Field Renderer Edit per tipo `file`: supporta URL esterni e upload locale.
 * - URL esterno: validazione HTTPS + verifica render immagine prima del salvataggio.
 * - File locale: upload su R2 via POST /api/upload e salvataggio URL ritornato.
 */
import * as React from "react"
import { Loader2, Link as LinkIcon, Upload, X } from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"

const IMAGE_ACCEPT = "image/*"
const URL_VALIDATION_TIMEOUT_MS = 8000

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

async function canRenderImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    let isDone = false
    const cleanup = () => {
      image.onload = null
      image.onerror = null
    }
    const finish = (result: boolean) => {
      if (isDone) return
      isDone = true
      cleanup()
      resolve(result)
    }

    const timeout = window.setTimeout(
      () => finish(false),
      URL_VALIDATION_TIMEOUT_MS
    )

    image.onload = () => {
      window.clearTimeout(timeout)
      finish(true)
    }
    image.onerror = () => {
      window.clearTimeout(timeout)
      finish(false)
    }
    image.src = url
  })
}

export function MediaEdit({ branch, value, onChange }: FieldEditProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isValidatingUrl, setIsValidatingUrl] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [urlInput, setUrlInput] = React.useState("")

  const url = typeof value === "string" ? value : ""
  const hasImage = url.length > 0
  const ctaLabel = hasImage ? "Sostituisci" : "Aggiungi immagine"
  const isBusy = isUploading || isValidatingUrl

  React.useEffect(() => {
    if (!isModalOpen) return
    setUrlInput(url)
    setError(null)
    setIsDragging(false)
  }, [isModalOpen, url])

  const handleFileUpload = React.useCallback(
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
        setIsModalOpen(false)
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

  const handleApplyUrl = React.useCallback(async () => {
    const candidate = urlInput.trim()
    if (!candidate) {
      setError("Inserisci un URL immagine pubblico")
      return
    }
    if (!isHttpsUrl(candidate)) {
      setError("L'URL deve iniziare con https://")
      return
    }

    setError(null)
    setIsValidatingUrl(true)
    try {
      const isRenderable = await canRenderImageUrl(candidate)
      if (!isRenderable) {
        setError("URL non renderizzabile come immagine")
        return
      }
      onChange(candidate)
      setIsModalOpen(false)
    } finally {
      setIsValidatingUrl(false)
    }
  }, [onChange, urlInput])

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)
      const file = event.dataTransfer.files[0]
      if (file) void handleFileUpload(file)
    },
    [handleFileUpload]
  )

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    if (!isBusy) setIsDragging(true)
  }, [isBusy])

  const handleDragLeave = React.useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) void handleFileUpload(file)
      event.target.value = ""
    },
    [handleFileUpload]
  )

  const handleOpenPicker = React.useCallback(() => {
    if (!isBusy) inputRef.current?.click()
  }, [isBusy])

  const handleRemove = React.useCallback(() => {
    onChange("")
  }, [onChange])

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {hasImage ? (
          <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-input bg-muted">
            <img src={url} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-dashed border-input bg-muted/40">
            <Upload className="size-5 text-muted-foreground" />
          </div>
        )}

        <div className="flex flex-col items-start gap-2">
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setIsModalOpen(true)}
            >
              <Upload className="size-4" />
              {ctaLabel}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{ctaLabel} immagine</DialogTitle>
                <DialogDescription>
                  Inserisci un URL pubblico HTTPS oppure carica un file locale.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor={`${branch.alias}-url`} className="text-sm font-medium">
                    Link immagine
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id={`${branch.alias}-url`}
                      type="url"
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      placeholder="https://example.com/image.jpg"
                      disabled={isBusy}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleApplyUrl()}
                      disabled={isBusy}
                    >
                      {isValidatingUrl ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Verifica...
                        </>
                      ) : (
                        <>
                          <LinkIcon className="size-4" />
                          Usa link
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleOpenPicker}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handleOpenPicker()
                    }
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "rounded-lg border-2 border-dashed p-5 text-center transition-colors",
                    "hover:border-primary/50 hover:bg-muted/50",
                    isDragging && "border-primary bg-muted/50",
                    isBusy && "pointer-events-none opacity-70"
                  )}
                >
                  <input
                    ref={inputRef}
                    id={`${branch.alias}-file`}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    className="hidden"
                    onChange={handleInputChange}
                  />

                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="size-8 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Caricamento...</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      trascina qui il tuo file oppure{" "}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 align-baseline"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleOpenPicker()
                        }}
                        disabled={isBusy}
                      >
                        selezionalo
                      </Button>
                    </p>
                  )}
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>

              <DialogFooter>
                {hasImage ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      handleRemove()
                      setIsModalOpen(false)
                    }}
                    disabled={isBusy}
                  >
                    <X className="size-4" />
                    Rimuovi immagine
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isBusy}
                >
                  Chiudi
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  )
}
