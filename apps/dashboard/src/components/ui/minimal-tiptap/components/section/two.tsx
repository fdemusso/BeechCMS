// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Editor } from "@tiptap/react"
import type { FormatAction } from "../../types"
import type { toggleVariants } from "@/components/ui/toggle"
import type { VariantProps } from "class-variance-authority"
import {
  CodeIcon,
  DotsHorizontalIcon,
  FontBoldIcon,
  FontItalicIcon,
  StrikethroughIcon,
  TextNoneIcon,
  UnderlineIcon,
} from "@radix-ui/react-icons"
import { useTranslation } from "react-i18next"
import { ToolbarSection } from "../toolbar-section"

type TextStyleAction =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "clearFormatting"

interface TextStyle extends FormatAction {
  value: TextStyleAction
}

interface SectionTwoProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  activeActions?: TextStyleAction[]
  mainActionCount?: number
}

export const SectionTwo: React.FC<SectionTwoProps> = ({
  editor,
  activeActions,
  mainActionCount = 2,
  size,
  variant,
}) => {
  const { t } = useTranslation()

  const formatActions: TextStyle[] = [
    {
      value: "bold",
      label: t("editor.bold"),
      icon: <FontBoldIcon className="size-5" />,
      action: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
      canExecute: (e) =>
        e.can().chain().focus().toggleBold().run() && !e.isActive("codeBlock"),
      shortcuts: ["mod", "B"],
    },
    {
      value: "italic",
      label: t("editor.italic"),
      icon: <FontItalicIcon className="size-5" />,
      action: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
      canExecute: (e) =>
        e.can().chain().focus().toggleItalic().run() && !e.isActive("codeBlock"),
      shortcuts: ["mod", "I"],
    },
    {
      value: "underline",
      label: t("editor.underline"),
      icon: <UnderlineIcon className="size-5" />,
      action: (e) => e.chain().focus().toggleUnderline().run(),
      isActive: (e) => e.isActive("underline"),
      canExecute: (e) =>
        e.can().chain().focus().toggleUnderline().run() &&
        !e.isActive("codeBlock"),
      shortcuts: ["mod", "U"],
    },
    {
      value: "strikethrough",
      label: t("editor.strikethrough"),
      icon: <StrikethroughIcon className="size-5" />,
      action: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive("strike"),
      canExecute: (e) =>
        e.can().chain().focus().toggleStrike().run() &&
        !e.isActive("codeBlock"),
      shortcuts: ["mod", "shift", "S"],
    },
    {
      value: "code",
      label: t("editor.inlineCode"),
      icon: <CodeIcon className="size-5" />,
      action: (e) => e.chain().focus().toggleCode().run(),
      isActive: (e) => e.isActive("code"),
      canExecute: (e) =>
        e.can().chain().focus().toggleCode().run() && !e.isActive("codeBlock"),
      shortcuts: ["mod", "E"],
    },
    {
      value: "clearFormatting",
      label: t("editor.clearFormatting"),
      icon: <TextNoneIcon className="size-5" />,
      action: (e) => e.chain().focus().unsetAllMarks().run(),
      isActive: () => false,
      canExecute: (e) =>
        e.can().chain().focus().unsetAllMarks().run() &&
        !e.isActive("codeBlock"),
      shortcuts: ["mod", "\\"],
    },
  ]

  return (
    <ToolbarSection
      editor={editor}
      actions={formatActions}
      activeActions={activeActions ?? formatActions.map((a) => a.value)}
      mainActionCount={mainActionCount}
      dropdownIcon={<DotsHorizontalIcon className="size-5" />}
      dropdownTooltip={t("editor.moreFormatting")}
      dropdownClassName="w-8"
      size={size}
      variant={variant}
    />
  )
}

SectionTwo.displayName = "SectionTwo"

export default SectionTwo
