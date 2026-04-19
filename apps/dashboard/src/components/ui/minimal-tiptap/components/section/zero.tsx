import * as React from "react"
import type { Editor } from "@tiptap/react"
import type { toggleVariants } from "@/components/ui/toggle"
import type { VariantProps } from "class-variance-authority"
import { Undo2, Redo2 } from "lucide-react"
import { ToolbarButton } from "../toolbar-button"

interface SectionZeroProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
}

export const SectionZero: React.FC<SectionZeroProps> = ({
  editor,
  size,
  variant,
}) => {
  return (
    <>
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        tooltip="Annulla (Mod+Z)"
        aria-label="Indietro"
        size={size}
        variant={variant}
      >
        <Undo2 className="size-5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        tooltip="Ripristina (Mod+Y)"
        aria-label="Avanti"
        size={size}
        variant={variant}
      >
        <Redo2 className="size-5" />
      </ToolbarButton>
    </>
  )
}

SectionZero.displayName = "SectionZero"

export default SectionZero
