// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { NodeViewProps } from "@tiptap/react"
import type { ElementDimensions } from "./use-drag-resize"
import { blobUrlToBase64, randomId } from "../../../utils"
import type { UploadReturnType } from "../shared"
import { fetchBlobAsFile } from "../fetch-blob-as-file"

export interface ImageState {
  src: string
  isServerUploading: boolean
  imageLoaded: boolean
  isZoomed: boolean
  error: boolean
  naturalSize: ElementDimensions
}

const normalizeUploadResponse = (res: UploadReturnType) => ({
  src: typeof res === "string" ? res : res.src,
  id: typeof res === "string" ? randomId() : res.id,
})

type SetImageState = React.Dispatch<React.SetStateAction<ImageState>>

interface BlobImageUploadParams {
  editor: NodeViewProps["editor"]
  initSrc: string
  fileName: string
  updateAttributes: NodeViewProps["updateAttributes"]
  setImageState: SetImageState
}

export const useBlobImageUpload = ({
  editor,
  initSrc,
  fileName,
  updateAttributes,
  setImageState,
}: BlobImageUploadParams) => {
  const uploadAttemptedRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false

    const handleImage = async () => {
      if (!initSrc.startsWith("blob:") || uploadAttemptedRef.current) {
        return
      }

      uploadAttemptedRef.current = true
      const imageExtension = editor.options.extensions.find(
        (ext) => ext.name === "image"
      )
      const { uploadFn } = imageExtension?.options ?? {}

      if (!uploadFn) {
        try {
          const base64 = await blobUrlToBase64(initSrc)
          if (cancelled) return
          setImageState((prev) => ({ ...prev, src: base64 }))
          updateAttributes({ src: base64 })
          URL.revokeObjectURL(initSrc)
        } catch {
          if (cancelled) return
          setImageState((prev) => ({ ...prev, error: true }))
        }
        return
      }

      try {
        setImageState((prev) => ({ ...prev, isServerUploading: true }))
        const file = await fetchBlobAsFile(initSrc, fileName)

        const url = await uploadFn(file, editor)
        if (cancelled) return
        const normalizedData = normalizeUploadResponse(url)

        setImageState((prev) => ({
          ...prev,
          ...normalizedData,
          isServerUploading: false,
        }))

        updateAttributes(normalizedData)
        URL.revokeObjectURL(initSrc)
      } catch {
        if (cancelled) return
        setImageState((prev) => ({
          ...prev,
          error: true,
          isServerUploading: false,
        }))
      }
    }

    void handleImage()

    return () => {
      cancelled = true
      uploadAttemptedRef.current = false
    }
  }, [editor, fileName, initSrc, updateAttributes, setImageState])
}
