// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Extension } from "@tiptap/react"

export const UnsetAllMarks = Extension.create({
  addKeyboardShortcuts() {
    return {
      "Mod-\\": () => this.editor.commands.unsetAllMarks(),
    }
  },
})
