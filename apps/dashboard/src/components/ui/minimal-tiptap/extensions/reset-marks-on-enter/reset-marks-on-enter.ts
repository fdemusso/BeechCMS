// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Extension } from "@tiptap/react"

export const ResetMarksOnEnter = Extension.create({
  name: "resetMarksOnEnter",

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (
          editor.isActive("bold") ||
          editor.isActive("italic") ||
          editor.isActive("strike") ||
          editor.isActive("underline") ||
          editor.isActive("code")
        ) {
          editor.commands.splitBlock({ keepMarks: false })

          return true
        }

        return false
      },
    }
  },
})
