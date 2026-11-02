// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

interface ImageLightboxProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
  alt?: string
  title?: string
}

/** Full-size image preview. Closes on click, Escape, or outside click (Radix Dialog). */
export function ImageLightbox({ open, onOpenChange, src, alt, title }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-auto max-w-[95vw] items-center justify-center border-0 bg-transparent p-0 shadow-none sm:max-w-[95vw]"
        onClick={() => onOpenChange(false)}
      >
        <DialogTitle className="sr-only">{alt || title || "Image preview"}</DialogTitle>
        <img
          src={src}
          alt={alt || ""}
          className="max-h-[90vh] max-w-[95vw] cursor-zoom-out rounded object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
