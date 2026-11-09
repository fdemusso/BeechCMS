// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Editor } from "@tiptap/react"
import type { FormatAction } from "../../types"
import type { toggleVariants } from "@/components/ui/toggle"
import type { VariantProps } from "class-variance-authority"
import { ArrowDown as CaretDownIcon, List as ListBulletIcon, OrderedList as ListOrderedIcon } from '@/components/icons'
import { ToolbarSection } from "../toolbar-section"

type ListItemAction = "orderedList" | "bulletList"
interface ListItem extends FormatAction {
  value: ListItemAction
}

interface SectionFourProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  activeActions?: ListItemAction[]
  mainActionCount?: number
}

export const SectionFour: React.FC<SectionFourProps> = ({
  editor,
  activeActions,
  mainActionCount = 0,
  size,
  variant,
}) => {
  const { t } = useTranslation()

  const formatActions = React.useMemo<ListItem[]>(() => [
    {
      value: "orderedList",
      label: t("editor.numberedList"),
      icon: <ListOrderedIcon className="size-5" />,
      isActive: (editor) => editor.isActive("orderedList"),
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
      canExecute: (editor) => editor.can().chain().focus().toggleOrderedList().run(),
      shortcuts: ["mod", "shift", "7"],
    },
    {
      value: "bulletList",
      label: t("editor.bulletList"),
      icon: <ListBulletIcon className="size-5" />,
      isActive: (editor) => editor.isActive("bulletList"),
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
      canExecute: (editor) => editor.can().chain().focus().toggleBulletList().run(),
      shortcuts: ["mod", "shift", "8"],
    },
  ], [t])

  return (
    <ToolbarSection
      editor={editor}
      actions={formatActions}
      activeActions={activeActions ?? formatActions.map((a) => a.value)}
      mainActionCount={mainActionCount}
      dropdownIcon={
        <>
          <ListBulletIcon className="size-5" />
          <CaretDownIcon className="size-5" />
        </>
      }
      dropdownTooltip={t("editor.listMenu")}
      size={size}
      variant={variant}
    />
  )
}

SectionFour.displayName = "SectionFour"

export default SectionFour
