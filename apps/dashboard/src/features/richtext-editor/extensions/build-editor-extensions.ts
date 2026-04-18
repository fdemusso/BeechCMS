import type { Extension } from "@tiptap/core"
import type { MutableRefObject } from "react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import TextAlign from "@tiptap/extension-text-align"
import Superscript from "@tiptap/extension-superscript"
import Subscript from "@tiptap/extension-subscript"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import { BlockMathWithDomError, InlineMathWithDomError } from "./math-katex-dom-error"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"

import { LinkMetaClick } from "./link-meta-click"

export type MathNodeClickPayload = {
  kind: "inline" | "block"
  latex: string
  pos: number
}

export function buildRichtextEditorExtensions(options: {
  placeholder: string
  slashExtension: Extension
  mathNodeEditRef: MutableRefObject<(payload: MathNodeClickPayload) => void>
}) {
  return [
    StarterKit.configure({
      link: false,
      codeBlock: {
        HTMLAttributes: {
          class: "richtext-code-block",
        },
      },
    }),
    Placeholder.configure({
      placeholder: options.placeholder,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      enableClickSelection: false,
    }),
    InlineMathWithDomError.configure({
      onClick: (node, pos) => {
        options.mathNodeEditRef.current({
          kind: "inline",
          latex: String(node.attrs?.latex ?? ""),
          pos,
        })
      },
      katexOptions: {
        throwOnError: false,
      },
    }),
    BlockMathWithDomError.configure({
      onClick: (node, pos) => {
        options.mathNodeEditRef.current({
          kind: "block",
          latex: String(node.attrs?.latex ?? ""),
          pos,
        })
      },
      katexOptions: {
        throwOnError: false,
      },
    }),
    Highlight,
    Superscript,
    Subscript,
    Image.configure({
      allowBase64: false,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    options.slashExtension,
    LinkMetaClick,
  ]
}
