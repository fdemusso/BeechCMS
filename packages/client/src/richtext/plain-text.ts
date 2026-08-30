// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { normalizeRichtextDocument } from './render.js'
import type { TipTapNode } from './types.js'

const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'horizontalRule',
])

function collectText(node: TipTapNode, chunks: string[]): void {
  if (!node || typeof node.type !== 'string') return
  const type = node.type

  if (type === 'text') {
    if (typeof node.text === 'string') {
      chunks.push(node.text)
    }
    return
  }

  if (type === 'hardBreak') {
    chunks.push('\n')
    return
  }

  if (type === 'horizontalRule') {
    chunks.push('\n')
    return
  }

  if (type === 'inlineMath' || type === 'blockMath' || type === 'mathematics') {
    const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : (typeof node.text === 'string' ? node.text : '')
    if (latex) chunks.push(latex)
    return
  }

  if (type === 'image') {
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
    if (alt) chunks.push(alt)
    return
  }

  const isBlock = BLOCK_NODE_TYPES.has(type)

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectText(child, chunks)
    }
  } else if (type !== 'doc') {
    console.warn(`[BeechCMS RichText] Unrecognized node type "${type}". Skipping node.`)
  }

  if (isBlock) {
    chunks.push('\n')
  }
}

/**
 * Extracts clean, plain text from a BeechCMS TipTap RichText AST or envelope v1.
 * Inserts whitespace separators between blocks, cleans excessive whitespace, and trims output.
 * Returns `""` on invalid, malformed, or empty inputs.
 */
export function richTextToPlainText(value: unknown): string {
  const doc = normalizeRichtextDocument(value)
  if (!doc) return ''

  const chunks: string[] = []
  collectText(doc, chunks)

  return chunks
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .replace(/^\s+|\s+$/g, '')
    .trim()
}
