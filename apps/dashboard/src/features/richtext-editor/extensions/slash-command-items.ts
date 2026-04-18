import type { Editor } from "@tiptap/core"
import type { SlashCommandItem } from "./slash-command-extension"
import { t } from "../consts/messages.it"

export function createSlashCommandItems(
  openFilePicker: () => void,
  onRequestMath: (mode: "inline" | "block") => void
): SlashCommandItem[] {
  return [
    {
      id: "paragraph",
      title: t("slashParagraph"),
      description: t("slashParagraphDescription"),
      keywords: ["testo", "paragraph", "p"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run()
      },
    },
    {
      id: "heading-1",
      title: t("slashHeading1"),
      description: t("slashHeading1Description"),
      keywords: ["heading", "h1", "titolo"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
      },
    },
    {
      id: "heading-2",
      title: t("slashHeading2"),
      description: t("slashHeading2Description"),
      keywords: ["heading", "h2", "titolo"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
      },
    },
    {
      id: "heading-3",
      title: t("slashHeading3"),
      description: t("slashHeading3Description"),
      keywords: ["heading", "h3", "titolo"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
      },
    },
    {
      id: "bullet-list",
      title: t("slashBulletList"),
      description: t("slashBulletListDescription"),
      keywords: ["list", "lista", "bullet"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run()
      },
    },
    {
      id: "ordered-list",
      title: t("slashOrderedList"),
      description: t("slashOrderedListDescription"),
      keywords: ["list", "lista", "ordered"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run()
      },
    },
    {
      id: "blockquote",
      title: t("slashQuote"),
      description: t("slashQuoteDescription"),
      keywords: ["quote", "citazione"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run()
      },
    },
    {
      id: "code-block",
      title: t("slashCodeBlock"),
      description: t("slashCodeBlockDescription"),
      keywords: ["code", "snippet"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
      },
    },
    {
      id: "inline-math",
      title: t("inlineEquation"),
      description: t("slashInlineMathDescription"),
      keywords: ["math", "latex", "formula", "inline"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        onRequestMath("inline")
      },
    },
    {
      id: "block-math",
      title: t("blockEquation"),
      description: t("slashBlockMathDescription"),
      keywords: ["math", "latex", "display", "block"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        onRequestMath("block")
      },
    },
    {
      id: "table",
      title: t("slashTable"),
      description: t("slashTableDescription"),
      keywords: ["table", "tabella", "grid"],
      execute: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run()
      },
    },
    {
      id: "image",
      title: t("slashImage"),
      description: t("slashImageDescription"),
      keywords: ["image", "media", "upload"],
      execute: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run()
        openFilePicker()
      },
    },
  ]
}

export function isEmptyParagraphSelection(editor: Editor): boolean {
  const { selection } = editor.state
  if (!selection.empty) return false
  const parent = selection.$from.parent
  if (parent.type.name !== "paragraph") return false
  return parent.textContent.trim().length === 0
}
