// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { FOLDER_COLORS, FOLDER_ICONS, type FolderStyle } from "@beechcms/core"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { FOLDER_COLOR_CLASSES, FOLDER_ICON_COMPONENTS } from "../folder-style"

interface FolderEditDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Group value shown when no custom label is set. */
  readonly defaultLabel: string
  readonly style: FolderStyle | undefined
  /** Receives the new style; an empty object resets the folder to its defaults. */
  readonly onSave: (next: FolderStyle) => void
}

export function FolderEditDialog({ open, onClose, defaultLabel, style, onSave }: FolderEditDialogProps) {
  const { t } = useTranslation()
  const [color, setColor] = React.useState(style?.color)
  const [icon, setIcon] = React.useState(style?.icon)
  const [label, setLabel] = React.useState(style?.label ?? "")
  const [description, setDescription] = React.useState(style?.description ?? "")

  React.useEffect(() => {
    if (!open) return
    setColor(style?.color)
    setIcon(style?.icon)
    setLabel(style?.label ?? "")
    setDescription(style?.description ?? "")
  }, [open, style])

  const handleSave = () => {
    onSave({
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    })
    onClose()
  }

  const handleReset = () => {
    onSave({})
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gallery.folders.edit.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">{t("gallery.folders.edit.label")}</p>
            <Input
              value={label}
              maxLength={60}
              placeholder={defaultLabel}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">{t("gallery.folders.edit.description")}</p>
            <Input
              value={description}
              maxLength={120}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("gallery.folders.edit.color")}</p>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={t(`gallery.folders.edit.colors.${name}`)}
                  aria-pressed={color === name}
                  onClick={() => setColor(color === name ? undefined : name)}
                  className={cn(
                    "size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-background transition",
                    FOLDER_COLOR_CLASSES[name].swatch,
                    color === name && "ring-2 ring-ring",
                  )}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("gallery.folders.edit.icon")}</p>
            <div className="flex flex-wrap gap-1.5">
              {FOLDER_ICONS.map((name) => {
                const Icon = FOLDER_ICON_COMPONENTS[name]
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={t(`gallery.folders.edit.icons.${name}`)}
                    aria-pressed={icon === name}
                    onClick={() => setIcon(icon === name ? undefined : name)}
                    className={cn(
                      "flex size-8 cursor-pointer items-center justify-center rounded-md border transition-colors",
                      icon === name ? "border-primary bg-primary text-primary-foreground" : "border-transparent bg-muted text-muted-foreground hover:border-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="destructive" className="mr-auto" onClick={handleReset}>{t("gallery.folders.edit.reset")}</Button>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
