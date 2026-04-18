import { Extension } from "@tiptap/core"
import type { Editor, Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import { createSlashMenuPopup } from "../utils/create-slash-menu-popup"

export const SLASH_MENU_PLUGIN_KEY = new PluginKey("beech-richtext-slash-menu")

export interface SlashCommandItem {
  id: string
  title: string
  description: string
  keywords: string[]
  execute: (params: { editor: Editor; range: Range }) => void
}

const BLOCK_TYPES_WITH_SLASH = new Set(["paragraph", "heading"])

function slashAllowParent(state: { doc: import("@tiptap/pm/model").Node }, range: { from: number; to: number }): boolean {
  const $from = state.doc.resolve(range.from)
  const parent = $from.parent
  if (parent.type.name === "codeBlock") return false
  return BLOCK_TYPES_WITH_SLASH.has(parent.type.name)
}

export function createSlashCommandExtension(
  items: SlashCommandItem[],
  labels: { slashMenuEmpty: string }
) {
  return Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem>({
          pluginKey: SLASH_MENU_PLUGIN_KEY,
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allow: ({ state, range }) => {
            if (!slashAllowParent(state, range)) return false
            const $from = state.doc.resolve(range.from)
            const parent = $from.parent
            return /^\/[^ ]*$/.test(parent.textContent)
          },
          items: ({ query }) => {
            const normalized = query.trim().toLowerCase()
            if (!normalized) return items
            return items.filter((item) => {
              const haystack = [item.title, item.description, ...item.keywords]
                .join(" ")
                .toLowerCase()
              return haystack.includes(normalized)
            })
          },
          command: ({ editor, range, props }) => {
            props.execute({ editor, range })
          },
          render: () => createSlashMenuPopup(labels),
        }),
      ]
    },
  })
}
