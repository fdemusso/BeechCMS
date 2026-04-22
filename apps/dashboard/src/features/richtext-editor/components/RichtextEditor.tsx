import { useEffect, useRef } from "react"
import { MinimalTiptapEditor } from "@/components/ui/minimal-tiptap"
import { api } from "@/lib/api"
import type { Content } from "@tiptap/react"

interface RichtextEditorProps {
  value: unknown
  onChange: (value: string) => void
  placeholder?: string
}

export function RichtextEditor({ value, onChange, placeholder }: RichtextEditorProps) {
  const sessionImages = useRef<string[]>([])
  const lastValue = useRef(value)

  // Keep track of the latest value to use it during cleanup
  useEffect(() => {
    lastValue.current = value
  }, [value])

  // Real upload handler that tracks URLs for later cleanup
  const handleUpload = async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    
    // api.post points to /api/upload as configured in api.ts
    const { data } = await api.post<{ url: string }>("/upload", formData)
    
    // Add to session tracking
    sessionImages.current.push(data.url)
    
    return data.url
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
      className="w-full"
      editorContentClassName="p-5"
      output="html"
      placeholder={placeholder || "Scrivi qui il tuo contenuto..."}
      autofocus={false}
      editable={true}
      editorClassName="focus:outline-none"
      uploader={handleUpload}
    />
  )
}
