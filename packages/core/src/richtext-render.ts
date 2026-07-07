// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { generateHTML } from '@tiptap/html'
import type { JSONContent } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { Mathematics } from '@tiptap/extension-mathematics'
import StarterKit from '@tiptap/starter-kit'

import { isRichtextEnvelopeV1 } from './richtext.js'

/**
 * Allinea l'output HTML allo schema TipTap usato dall'editor dashboard.
 * Mantieni sincronizzato con `apps/dashboard/src/features/richtext-editor/extensions/build-editor-extensions.ts`.
 */
function createRichTextHtmlExtensions() {
  return [
    StarterKit.configure({
      link: false,
      codeBlock: {
        HTMLAttributes: {
          class: 'richtext-code-block',
        },
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    Mathematics.configure({
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
      types: ['heading', 'paragraph'],
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}

/**
 * Accetta JSON TipTap (`{ type: 'doc', ... }`) o envelope v1.
 * Le stringhe HTML legacy NON sono più supportate: ritornano null (drop-to-empty al render).
 */
export function normalizeRichtextForRender(value: unknown): JSONContent | null {
  if (value == null || value === '') return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if (isRichtextEnvelopeV1(value)) return o.doc as JSONContent
    if (o.type === 'doc') return value as JSONContent
  }
  return null
}

/**
 * Render deterministico JSON → HTML (per display, anteprime, API pubblica).
 * Input non-JSON o stringa legacy → '' (drop-to-empty; nessun pass-through).
 */
export function renderRichText(value: unknown): string {
  const normalized = normalizeRichtextForRender(value)
  if (normalized == null) return ''
  return generateHTML(normalized, createRichTextHtmlExtensions())
}
