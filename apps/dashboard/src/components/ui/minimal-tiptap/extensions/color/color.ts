// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Color as TiptapColor } from "@tiptap/extension-color"
import { Plugin } from "@tiptap/pm/state"

export const Color = TiptapColor.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() || []),
      new Plugin({
        props: {
          handleKeyDown: (_, event) => {
            if (event.key === "Enter") {
              this.editor.commands.unsetColor()
            }
            return false
          },
        },
      }),
    ]
  },
})
