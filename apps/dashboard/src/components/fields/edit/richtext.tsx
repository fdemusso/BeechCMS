import type { ReactNode } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Bold, Italic, Heading2, List, ListOrdered } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"

interface ToolbarButtonProps {
  onClick: () => void
  isActive: boolean
  /** Testo per aria-label del bottone (accessibilità) */
  label: string
  children: ReactNode
}

function ToolbarButton({ onClick, isActive, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded p-1.5 text-sm transition-colors",
        "hover:bg-muted hover:text-foreground",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  )
}

export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  const initial = typeof value === "string" ? value : ""

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  if (!editor) return null

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background text-sm ring-offset-background",
        "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
    >
      <div className="flex flex-wrap gap-0.5 border-b border-input px-2 py-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          label="Grassetto"
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          label="Corsivo"
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          label="Heading 2"
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          label="Elenco puntato"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          label="Elenco numerato"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
      </div>
      <EditorContent
        id={branch.alias}
        editor={editor}
        className="px-3 py-2"
      />
    </div>
  )
}
