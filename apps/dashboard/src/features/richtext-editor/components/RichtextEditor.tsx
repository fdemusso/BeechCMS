// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { MinimalTiptapEditor } from "@/components/ui/minimal-tiptap"
import { api } from "@/lib/api"
import { uploadFile } from "@/lib/upload"
import type { Content } from "@tiptap/react"

interface RichtextEditorProps {
  value: unknown
  onChange: (value: string) => void
  placeholder?: string
}

export function RichtextEditor({ value, onChange, placeholder }: RichtextEditorProps) {
  const { t } = useTranslation()
  const sessionImages = useRef<string[]>([])
  const lastValue = useRef(value)

  // Keep track of the latest value to use it during cleanup
  useEffect(() => {
    lastValue.current = value
  }, [value])

  const handleUpload = async (file: File) => {
    const url = await uploadFile(file)
    sessionImages.current.push(url)
    return url
  }

  // Session cleanup: delete images that were uploaded but not kept in the final text
  useEffect(() => {
    return () => {
      const finalHtml = String(lastValue.current || "")
      
      // Images that were uploaded in this session but are NO LONGER in the HTML
      const orphaned = sessionImages.current.filter(url => !finalHtml.includes(url))
      
      orphaned.forEach(async (url) => {
        try {
          // Extract the filename/key from the URL (e.g. /api/media/123-img.jpg -> 123-img.jpg)
          const key = url.split('/').pop()
          if (key) {
            await api.delete(`/upload/${decodeURIComponent(key)}`)
          }
        } catch (e) {
          console.error("Session image cleanup failed for:", url, e)
        }
      })
    }
  }, [])

  const content = (value as string) ?? ""

  return (
    <MinimalTiptapEditor
      value={content as Content}
      onChange={(newContent) => {
        onChange(typeof newContent === "string" ? newContent : String(newContent))
      }}
      className="w-full min-h-[400px]"
      editorContentClassName="p-5 flex-1 flex flex-col"
      output="html"
      placeholder={placeholder || t("content.editor.placeholder", "Scrivi qui il tuo contenuto...")}
      autofocus={false}
      editable={true}
      editorClassName="focus:outline-none"
      uploader={handleUpload}
    />
  )
}
