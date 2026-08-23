// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { escapeHtml, isSafeUrl } from './escape.js'
import type { TipTapDoc, TipTapMark, TipTapNode } from './types.js'

/**
 * Normalizes input value into a validated TipTap document object.
 * Returns `null` for non-objects, invalid envelopes, or legacy HTML strings (drop-to-empty).
 */
export function normalizeRichtextDocument(value: unknown): TipTapDoc | null {
  if (value == null || value === '' || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const obj = value as Record<string, unknown>

  // Envelope v1 unwrapping
  if (obj.schemaVersion === 1 && typeof obj.doc === 'object' && obj.doc !== null && !Array.isArray(obj.doc)) {
    const docObj = obj.doc as Record<string, unknown>
    if (docObj.type === 'doc') {
      return docObj as unknown as TipTapDoc
    }
    return null
  }

  // Raw TipTap doc object
  if (obj.type === 'doc') {
    return obj as unknown as TipTapDoc
  }

  return null
}

function renderMarks(text: string, marks?: TipTapMark[]): string {
  if (!marks || !marks.length) return text
  let rendered = text

  for (const mark of marks) {
    if (!mark || typeof mark.type !== 'string') continue
    const type = mark.type.toLowerCase()
    const attrs = mark.attrs || {}

    switch (type) {
      case 'bold':
      case 'strong':
        rendered = `<strong>${rendered}</strong>`
        break
      case 'italic':
      case 'em':
        rendered = `<em>${rendered}</em>`
        break
      case 'strike':
      case 's':
        rendered = `<s>${rendered}</s>`
        break
      case 'underline':
      case 'u':
        rendered = `<u>${rendered}</u>`
        break
      case 'code':
        rendered = `<code>${rendered}</code>`
        break
      case 'highlight': {
        const color = typeof attrs.color === 'string' ? attrs.color.trim() : ''
        const style = color && !/[<>"'();]/.test(color) ? ` style="background-color: ${escapeHtml(color)};"` : ''
        rendered = `<mark${style}>${rendered}</mark>`
        break
      }
      case 'superscript':
        rendered = `<sup>${rendered}</sup>`
        break
      case 'subscript':
        rendered = `<sub>${rendered}</sub>`
        break
      case 'textstyle': {
        const color = typeof attrs.color === 'string' ? attrs.color.trim() : ''
        if (color && !/[<>"'();]/.test(color)) {
          rendered = `<span style="color: ${escapeHtml(color)};">${rendered}</span>`
        }
        break
      }
      case 'link': {
        const href = typeof attrs.href === 'string' ? attrs.href : ''
        if (isSafeUrl(href)) {
          const safeHref = escapeHtml(href)
          const target = typeof attrs.target === 'string' && attrs.target ? ` target="${escapeHtml(attrs.target)}"` : ''
          let rel = typeof attrs.rel === 'string' && attrs.rel ? ` rel="${escapeHtml(attrs.rel)}"` : ''
          if (target.includes('_blank') && !rel) {
            rel = ' rel="noopener noreferrer"'
          }
          rendered = `<a href="${safeHref}"${target}${rel}>${rendered}</a>`
        }
        break
      }
      default:
        // Ignore unrecognized mark
        break
    }
  }

  return rendered
}

function renderChildren(nodes?: TipTapNode[]): string {
  if (!nodes || !Array.isArray(nodes)) return ''
  return nodes.map(renderNode).join('')
}

function renderNode(node: TipTapNode): string {
  if (!node || typeof node.type !== 'string') return ''
  const type = node.type
  const attrs = node.attrs || {}

  switch (type) {
    case 'doc':
      return renderChildren(node.content)

    case 'paragraph': {
      const align = typeof attrs.textAlign === 'string' ? attrs.textAlign.trim() : ''
      const style = align && ['left', 'center', 'right', 'justify'].includes(align) ? ` style="text-align: ${align};"` : ''
      return `<p${style}>${renderChildren(node.content)}</p>`
    }

    case 'heading': {
      const rawLevel = typeof attrs.level === 'number' ? attrs.level : 1
      const level = Math.min(Math.max(Math.floor(rawLevel), 1), 6)
      const align = typeof attrs.textAlign === 'string' ? attrs.textAlign.trim() : ''
      const style = align && ['left', 'center', 'right', 'justify'].includes(align) ? ` style="text-align: ${align};"` : ''
      return `<h${level}${style}>${renderChildren(node.content)}</h${level}>`
    }

    case 'blockquote':
      return `<blockquote>${renderChildren(node.content)}</blockquote>`

    case 'codeBlock': {
      const language = typeof attrs.language === 'string' ? attrs.language.trim() : ''
      const langClass = language && !/[<>"']/.test(language) ? ` class="language-${escapeHtml(language)}"` : ''
      return `<pre class="richtext-code-block"><code${langClass}>${renderChildren(node.content)}</code></pre>`
    }

    case 'horizontalRule':
      return '<hr />'

    case 'bulletList':
      return `<ul>${renderChildren(node.content)}</ul>`

    case 'orderedList': {
      const start = typeof attrs.start === 'number' && attrs.start !== 1 ? ` start="${attrs.start}"` : ''
      return `<ol${start}>${renderChildren(node.content)}</ol>`
    }

    case 'listItem':
      return `<li>${renderChildren(node.content)}</li>`

    case 'table':
      return `<table><tbody>${renderChildren(node.content)}</tbody></table>`

    case 'tableRow':
      return `<tr>${renderChildren(node.content)}</tr>`

    case 'tableHeader': {
      const colspan = typeof attrs.colspan === 'number' && attrs.colspan > 1 ? ` colspan="${attrs.colspan}"` : ''
      const rowspan = typeof attrs.rowspan === 'number' && attrs.rowspan > 1 ? ` rowspan="${attrs.rowspan}"` : ''
      return `<th${colspan}${rowspan}>${renderChildren(node.content)}</th>`
    }

    case 'tableCell': {
      const colspan = typeof attrs.colspan === 'number' && attrs.colspan > 1 ? ` colspan="${attrs.colspan}"` : ''
      const rowspan = typeof attrs.rowspan === 'number' && attrs.rowspan > 1 ? ` rowspan="${attrs.rowspan}"` : ''
      return `<td${colspan}${rowspan}>${renderChildren(node.content)}</td>`
    }

    case 'hardBreak':
      return '<br />'

    case 'text': {
      const rawText = typeof node.text === 'string' ? node.text : ''
      const escaped = escapeHtml(rawText)
      return renderMarks(escaped, node.marks)
    }

    case 'image': {
      const src = typeof attrs.src === 'string' ? attrs.src : ''
      if (!isSafeUrl(src)) return ''
      const safeSrc = escapeHtml(src)
      const alt = typeof attrs.alt === 'string' && attrs.alt ? ` alt="${escapeHtml(attrs.alt)}"` : ''
      const title = typeof attrs.title === 'string' && attrs.title ? ` title="${escapeHtml(attrs.title)}"` : ''
      return `<img src="${safeSrc}"${alt}${title} />`
    }

    case 'inlineMath':
    case 'blockMath':
    case 'mathematics': {
      const latex = typeof attrs.latex === 'string' ? attrs.latex : (typeof node.text === 'string' ? node.text : '')
      return `<span class="math-inline">${escapeHtml(latex)}</span>`
    }

    default:
      console.warn(`[BeechCMS RichText] Unrecognized node type "${type}". Skipping node.`)
      return ''
  }
}

/**
 * Renders a BeechCMS TipTap RichText AST or envelope v1 into secure, semantic HTML.
 * Pure, deterministic, zero external dependencies. Returns `""` on invalid/empty inputs.
 */
export function renderRichText(value: unknown): string {
  const doc = normalizeRichtextDocument(value)
  if (!doc) return ''
  return renderNode(doc)
}
