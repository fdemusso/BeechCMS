// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Edit per tipo `file`: supporta URL esterni e upload locale.
 * - URL esterno: validazione HTTPS + verifica render immagine prima del salvataggio.
 * - File locale: upload su R2 via POST /api/upload e salvataggio URL ritornato.
 * - Asset list: quando il branch e multiplo, gestisce lista ordinabile di URL.
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, Loader2, Upload, X } from "lucide-react"
import { uploadFile } from "@/lib/upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"

const IMAGE_ACCEPT = "image/*"
const URL_VALIDATION_TIMEOUT_MS = 8000

function isAssetListBranch(maybeBranch: { type: string; multiple?: boolean; format?: string }): boolean {
  return (
    maybeBranch.type === "file" &&
    (maybeBranch.multiple === true || maybeBranch.format === "asset-list")
  )
}

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

    const timeout = globalThis.setTimeout(
      () => finish(false),
      URL_VALIDATION_TIMEOUT_MS
    )

    image.onload = () => {
      globalThis.clearTimeout(timeout)
      finish(true)
    }
    image.onerror = () => {
      globalThis.clearTimeout(timeout)
      finish(false)
    }
    image.src = url
  })
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return isHttpsUrl(trimmed) ? trimmed : null
}

function parseAssetListValue(value: unknown): string[] {
  const input = typeof value === "string" ? parseJsonString(value) : value
  const values = Array.isArray(input) ? input : [input]
  const urls: string[] = []

  for (const item of values) {
    if (item == null) continue
    const direct = normalizeUrl(item)
    if (direct) {
      urls.push(direct)
      continue
    }
    if (typeof item === "object" && !Array.isArray(item)) {
      const nested = normalizeUrl((item as Record<string, unknown>).url)
      if (nested) urls.push(nested)
    }
  }

  return [...new Set(urls)]
}

function appendUniqueUrl(current: string[], nextUrl: string): string[] {
  return current.includes(nextUrl) ? current : [...current, nextUrl]
}

function moveItem(list: string[], from: number, to: number): string[] {
  if (to < 0 || to >= list.length || from === to) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function MediaEdit({ branch, value, onChange }: FieldEditProps) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [isValidatingUrl, setIsValidatingUrl] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [urlInput, setUrlInput] = React.useState("")

  const isMultiple = isAssetListBranch(branch)
  const assets = React.useMemo(
    () => (isMultiple ? parseAssetListValue(value) : []),
    [isMultiple, value]
  )

  const url = typeof value === "string" ? value : ""
  const hasImage = url.length > 0
  const isBusy = isUploading || isValidatingUrl

  React.useEffect(() => {
    if (!isMultiple) {
      setUrlInput(url)
    } else {
      setUrlInput("")
    }
    setError(null)
    setIsDragging(false)
  }, [isMultiple, url])

  const handleFileUpload = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError(t('media.errorNotImage'))
        return
      }
      setError(null)
      setIsUploading(true)
      try {
        const uploadedUrl = await uploadFile(file)
        if (isMultiple) {
          const current = parseAssetListValue(value)
          onChange(appendUniqueUrl(current, uploadedUrl))
          setUrlInput("")
        } else {
          onChange(uploadedUrl)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error during upload')
      } finally {
        setIsUploading(false)
      }
    },
    [isMultiple, onChange, value, t]
  )

  const handleApplyUrl = React.useCallback(async () => {
    const candidate = urlInput.trim()

    if (!isMultiple && !candidate) {
      setError(null)
      onChange("")
      return
    }

    if (!isMultiple && candidate === url) {
      return
    }

    if (isMultiple && !candidate) {
      return
    }

    if (!isHttpsUrl(candidate)) {
      setError(t("media.errorHttps"))
      return
    }

    setError(null)
    setIsValidatingUrl(true)
    try {
      const isRenderable = await canRenderImageUrl(candidate)
      if (!isRenderable) {
        setError(t("media.errorNotRenderable"))
        return
      }
      if (isMultiple) {
        const current = parseAssetListValue(value)
        onChange(appendUniqueUrl(current, candidate))
        setUrlInput("")
      } else {
        onChange(candidate)
      }
    } catch (err) {
      setError(t("media.errorNotRenderable"))
    } finally {
      setIsValidatingUrl(false)
    }
  }, [isMultiple, onChange, urlInput, value, url, t])

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
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

  const handleRemoveAt = React.useCallback(
    (index: number) => {
      const current = parseAssetListValue(value)
      onChange(current.filter((_, itemIndex) => itemIndex !== index))
    },
    [onChange, value]
  )

  const handleReorder = React.useCallback(
    (index: number, direction: "up" | "down") => {
      const current = parseAssetListValue(value)
      const target = direction === "up" ? index - 1 : index + 1
      onChange(moveItem(current, index, target))
    },
    [onChange, value]
  )

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        void handleApplyUrl()
      }
    },
    [handleApplyUrl]
  )

  const handleBlur = React.useCallback(() => {
    void handleApplyUrl()
  }, [handleApplyUrl])

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        id={`${branch.alias}-file`}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Single image preview */}
      {!isMultiple && hasImage && (
        <div className="group relative h-48 w-full overflow-hidden rounded-lg border bg-muted transition-all">
          <img src={url} alt="Preview" className="size-full object-cover" />
          <div className="absolute top-2 right-2">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="size-8 shadow-md"
              onClick={handleRemove}
              disabled={isBusy}
              aria-label={t("media.removeImage")}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Input box + upload button */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={`${branch.alias}-url`}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              placeholder={t("media.imageLink")}
              disabled={isBusy}
              className={cn(
                "pr-8 transition-all duration-200",
                isDragging && "border-primary ring-2 ring-primary/20 bg-primary/5"
              )}
            />
            {isBusy && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleOpenPicker}
            disabled={isBusy}
            aria-label={t("media.upload", "Upload file")}
            className="shrink-0"
          >
            <Upload className="size-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Multiple images gallery */}
      {isMultiple && assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((assetUrl, index) => (
            <div key={`${assetUrl}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <img src={assetUrl} alt="Preview" className="size-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-8"
                  onClick={() => handleReorder(index, "up")}
                  disabled={index === 0 || isBusy}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-8"
                  onClick={() => handleReorder(index, "down")}
                  disabled={index === assets.length - 1 || isBusy}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="size-8"
                  onClick={() => handleRemoveAt(index)}
                  disabled={isBusy}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
