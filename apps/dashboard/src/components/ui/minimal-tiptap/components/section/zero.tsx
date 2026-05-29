// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
  return (
    <>
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        tooltip={t("editor.undo")}
        aria-label={t("editor.undo")}
        size={size}
        variant={variant}
      >
        <Undo2 className="size-5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        tooltip={t("editor.redo")}
        aria-label={t("editor.redo")}
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
