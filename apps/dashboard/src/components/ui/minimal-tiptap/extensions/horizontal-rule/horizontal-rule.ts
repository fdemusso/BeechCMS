// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { HorizontalRule as TiptapHorizontalRule } from "@tiptap/extension-horizontal-rule"

export const HorizontalRule = TiptapHorizontalRule.extend({
  addKeyboardShortcuts() {
    return {
      "Mod-Alt--": () =>
        this.editor.commands.insertContent({
          type: this.name,
        }),
    }
  },
})

export default HorizontalRule
