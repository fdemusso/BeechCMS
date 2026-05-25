/**
 * Field Renderer Edit per tipo `file`: supporta URL esterni e upload locale.
 * - URL esterno: validazione HTTPS + verifica render immagine prima del salvataggio.
 * - File locale: upload su R2 via POST /api/upload e salvataggio URL ritornato.
 * - Asset list: quando il branch e multiplo, gestisce lista ordinabile di URL.
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, Loader2, Link as LinkIcon, Upload, X } from "lucide-react"
import { uploadFile } from "@/lib/upload"
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

function getCtaLabel(params: { isMultiple: boolean; hasAssets: boolean; hasImage: boolean }, t: (k: string) => string): string {
  if (params.isMultiple) {
    return params.hasAssets ? t("media.manageGallery") : t("media.addImages")
  }
  return params.hasImage ? t("media.replace") : t("media.addImage")
}

export function MediaEdit({ branch, value, onChange }: FieldEditProps) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isModalOpen, setIsModalOpen] = React.useState(false)
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
  const hasAssets = assets.length > 0
  const ctaLabel = getCtaLabel({ isMultiple, hasAssets, hasImage }, t)
  const isBusy = isUploading || isValidatingUrl

  React.useEffect(() => {
    if (!isModalOpen) return
    setUrlInput(isMultiple ? "" : url)
    setError(null)
    setIsDragging(false)
  }, [isModalOpen, isMultiple, url])

  const handleFileUpload = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError(t('media.errorNotImage'))
        return
      }
      setError(null)
      setIsUploading(true)
      try {
        const url = await uploadFile(file)
        if (isMultiple) {
          const current = parseAssetListValue(value)
          onChange(appendUniqueUrl(current, url))
        } else {
          onChange(url)
          setIsModalOpen(false)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error during upload')
      } finally {
        setIsUploading(false)
      }
    },
    [isMultiple, onChange, value]
  )

  const handleApplyUrl = React.useCallback(async () => {
    const candidate = urlInput.trim()
    if (!candidate) {
      setError(t("media.errorUrl"))
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
        setIsModalOpen(false)
      }
    } finally {
      setIsValidatingUrl(false)
    }
  }, [isMultiple, onChange, urlInput, value])

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

  const handleClearAll = React.useCallback(() => {
    onChange([])
    setIsModalOpen(false)
  }, [onChange])

  if (isMultiple) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {hasAssets ? (
            <div className="grid grid-cols-2 gap-1">
              {assets.slice(0, 4).map((assetUrl) => (
                <div
                  key={assetUrl}
                  className="relative size-16 overflow-hidden rounded-md border border-input bg-muted"
                >
                  <img src={assetUrl} alt="" className="size-full object-cover" />
                </div>
              ))}
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
                  <DialogTitle>{ctaLabel}</DialogTitle>
                  <DialogDescription>
                  {t("media.dialogDesc")}
                </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor={`${branch.alias}-url`} className="text-sm font-medium">
                      {t("media.imageLink")}
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
                            {t("media.verifying")}
                          </>
                        ) : (
                          <>
                            <LinkIcon className="size-4" />
                            {t("media.add")}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenPicker}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                      "w-full rounded-lg border-2 border-dashed p-5 text-center transition-colors",
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
                        <span className="text-sm text-muted-foreground">{t("media.uploading")}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t("media.dropOrSelect")}
                      </p>
                    )}
                  </button>

                  {assets.length > 0 ? (
                    <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-input p-2">
                      {assets.map((assetUrl, index) => (
                        <div
                          key={`${assetUrl}-${index}`}
                          className="flex items-center gap-2 rounded-md border border-input bg-background p-2"
                        >
                          <img
                            src={assetUrl}
                            alt=""
                            className="size-10 shrink-0 rounded object-cover"
                          />
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {assetUrl}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleReorder(index, "up")}
                              disabled={index === 0 || isBusy}
                              aria-label={t("media.moveUp")}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleReorder(index, "down")}
                              disabled={index === assets.length - 1 || isBusy}
                              aria-label={t("media.moveDown")}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveAt(index)}
                              disabled={isBusy}
                              aria-label={t("media.removeImage")}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </div>

                <DialogFooter>
                  {assets.length > 0 ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleClearAll}
                      disabled={isBusy}
                    >
                      <X className="size-4" />
                      {t("media.removeAll")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    disabled={isBusy}
                  >
                    {t("common.close")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    )
  }

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
                <DialogTitle>{ctaLabel} image</DialogTitle>
                <DialogDescription>
                  {t("media.dialogDesc")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor={`${branch.alias}-url`} className="text-sm font-medium">
                    {t("media.imageLink")}
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
                          {t("media.verifying")}
                        </>
                      ) : (
                        <>
                          <LinkIcon className="size-4" />
                          {t("media.useLink")}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenPicker}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "w-full rounded-lg border-2 border-dashed p-5 text-center transition-colors",
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
                      <span className="text-sm text-muted-foreground">{t("media.uploading")}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("media.dropOrSelect")}
                    </p>
                  )}
                </button>

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
                    {t("media.removeImage")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isBusy}
                >
                  {t("common.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </div>
  )
}
