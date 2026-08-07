// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Editor } from "@tiptap/react"
import type { FormatAction } from "../../types"
import type { toggleVariants } from "@/components/ui/toggle"
import type { VariantProps } from "class-variance-authority"
import { ArrowDown as CaretDownIcon, Code as CodeIcon, Minus as DividerHorizontalIcon, Plus as PlusIcon, QuoteUp as QuoteIcon } from 'reicon-react'
import { LinkEditPopover } from "../link/link-edit-popover"
import { ImageEditDialog } from "../image/image-edit-dialog"
import { ToolbarSection } from "../toolbar-section"

type InsertElementAction = "codeBlock" | "blockquote" | "horizontalRule"
interface InsertElement extends FormatAction {
  value: InsertElementAction
}

interface SectionFiveProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  activeActions?: InsertElementAction[]
  mainActionCount?: number
}

export const SectionFive: React.FC<SectionFiveProps> = ({
  editor,
  activeActions,
  mainActionCount = 0,
  size,
  variant,
}) => {
  const { t } = useTranslation()

  const formatActions = React.useMemo<InsertElement[]>(() => [
    {
      value: "codeBlock",
      label: t("editor.blockCode"),
      icon: <CodeIcon className="size-5" />,
      action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      isActive: (editor) => editor.isActive("codeBlock"),
      canExecute: (editor) => editor.can().chain().focus().toggleCodeBlock().run(),
      shortcuts: ["mod", "alt", "C"],
    },
    {
      value: "blockquote",
      label: t("editor.blockquote"),
      icon: <QuoteIcon className="size-5" />,
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
      isActive: (editor) => editor.isActive("blockquote"),
      canExecute: (editor) => editor.can().chain().focus().toggleBlockquote().run(),
      shortcuts: ["mod", "shift", "B"],
    },
    {
      value: "horizontalRule",
      label: t("editor.divider"),
      icon: <DividerHorizontalIcon className="size-5" />,
      action: (editor) => editor.chain().focus().setHorizontalRule().run(),
      isActive: () => false,
      canExecute: (editor) => editor.can().chain().focus().setHorizontalRule().run(),
      shortcuts: ["mod", "alt", "-"],
    },
  ], [t])

  return (
    <>
      <LinkEditPopover editor={editor} size={size} variant={variant} />
      <ImageEditDialog editor={editor} size={size} variant={variant} />
      <ToolbarSection
        editor={editor}
        actions={formatActions}
        activeActions={activeActions ?? formatActions.map((a) => a.value)}
        mainActionCount={mainActionCount}
        dropdownIcon={
          <>
            <PlusIcon className="size-5" />
            <CaretDownIcon className="size-5" />
          </>
        }
        dropdownTooltip={t("editor.insertElements")}
        size={size}
        variant={variant}
      />
    </>
  )
}

SectionFive.displayName = "SectionFive"

export default SectionFive
