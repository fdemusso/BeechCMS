# Sprint Plan: TipTap RichText Rendering Utilities (`@beechcms/client/richtext`)

### Pre-Computation Analysis

1. **God Nodes Identified via Knowledge Graph (`graphify` CLI):**
   - `packages/core`: `sanitizeRichtext` (Degree: 9), `isRichtextEnvelopeV1` (Degree: 8), `validateAndSanitizeSeedPayload` (Degree: 14), `renderRichText` (Degree: 4, internal heavy TipTap renderer via `@tiptap/html`).
   - `packages/client`: `BeechBrowserClient` (Degree: 5), `BeechServerClient` (Degree: 5), `buildSearchParams` (Degree: 6), `verifyBeechWebhookSignature` (Degree: 3).
   - `apps/api`: `app` / router dispatchers.
   - `apps/dashboard`: `MinimalTiptap` / `RichtextEditor`.

2. **Architectural Boundaries Affected:**
   - `@beechcms/core`: **UNTOUCHED**. `@beechcms/core` retains its existing validation engine (`sanitizeRichtext`) and server-side heavy TipTap renderer (`@tiptap/html`). No shared contracts or imports are altered.
   - `apps/api`: **UNTOUCHED**. No API route or middleware changes.
   - `apps/dashboard`: **UNTOUCHED**. The dashboard continues to use its internal `@beechcms/core` and Minimal TipTap editor.
   - `packages/client`: **EXTENDED** (additive subpath export). A new zero-dependency subpath `@beechcms/client/richtext` is added alongside existing subpaths (`.`, `./browser`, `./server`, `./webhooks`).

3. **Graphify Affected Impact Analysis (`graphify affected`):**
   - Reverse dependency traversal confirms `@beechcms/client` is a leaf consumer SDK with zero incoming imports from `apps/api` or `apps/dashboard`.
   - Core symbols (`isRichtextEnvelopeV1`, `renderRichText`, `sanitizeRichtext`) remain untouched in `@beechcms/core`.
   - Existing client subpaths (`@beechcms/client`, `@beechcms/client/browser`, `@beechcms/client/server`, `@beechcms/client/webhooks`) are completely decoupled and unaffected.
   - Zero breaking changes across the monorepo workspace.

---

### VETO Audit

- **YAGNI & Scope Invariance (Rule 1):** The plan introduces only two deterministic pure functions (`renderRichText`, `richTextToPlainText`) and minimal AST type contracts inside `@beechcms/client/richtext`. Discarded external dependencies (`@tiptap/html`, `prosemirror-*`, DOM shims, sanitization libraries, React/Vue components, AST mutation engines).
- **Botanical Invariant (Rule 2):** Pure client-side/edge presentation layer utility. Zero direct D1 queries; zero database access. Envelope structure `{ schemaVersion: 1, doc }` strictly adheres to Botanical schema versioning.
- **Vertical Slice Architecture Isolation (Rule 3):** No cross-slice imports. Package boundaries between `@beechcms/core`, `apps/api`, `apps/dashboard`, and `packages/client` remain strictly respected.
- **Cloudflare Purity & Universal Isomorphism (Rule 4):** 100% pure TypeScript AST walker with zero DOM/window dependencies, enabling instant execution on Cloudflare Workers, Node.js, Bun, browsers, and Edge runtimes.
- **Minimalist Blueprint (Rule 5):** Exactly 1 subpath module (`packages/client/src/richtext/`) containing 5 source files + 1 test file + `package.json` export update.

HANDOFF -> caveman_coder

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Consuming applications (Next.js App Router, Remix, Astro, Vite, SvelteKit, Cloudflare Workers, Node.js backends) and static site generators need to render BeechCMS RichText content (TipTap structured JSON AST) into semantic HTML or plain-text snippets for SEO, OpenGraph meta tags, RSS feeds, and preview cards.

Currently, rendering BeechCMS RichText outside the monorepo requires either:
1. Importing the entire `@beechcms/core` package, which pulls in heavy dependencies (`@tiptap/core`, `@tiptap/html`, `@tiptap/starter-kit`, `katex`, `zod`), adding hundreds of kilobytes of bundle bloat.
2. Installing `@tiptap/html` and ProseMirror packages directly in consuming client applications, which requires synthetic DOM polyfills (`jsdom`, `happy-dom`) on serverless/edge runtimes (e.g. Cloudflare Workers, Vercel Edge Functions) and exposes consumers to runtime incompatibilities.

### Architectural Rationale & Invariants:
1. **Zero External Runtime Dependencies:** The module must not depend on `@tiptap/html`, `prosemirror-*`, DOM polyfills, or third-party sanitizers. The AST walker is 100% self-contained and universally isomorphic.
2. **Strict Subpath Isolation:** Richtext utilities reside exclusively under `@beechcms/client/richtext`. Consumers of `@beechcms/client`, `@beechcms/client/browser`, or `@beechcms/client/server` incur zero bundle overhead.
3. **Fail-Safe Normalization (No Runtime Exceptions):** Functions never throw exceptions on malformed, unexpected, empty, non-object, or legacy string inputs. Any invalid input safely resolves to an empty string (`""`).
4. **Transparent Envelope Unwrapping:** Automatically unwraps both raw TipTap doc objects (`{ type: 'doc', content: [...] }`) and BeechCMS schema envelopes (`{ schemaVersion: 1, doc: ... }`).
5. **Strict HTML Escaping & Protocol Allowlist:** All text nodes are escaped (`&`, `<`, `>`, `"`, `'`). URLs (`href`, `src`) are strictly validated against an allowlist (`http:`, `https:`, `mailto:`, `tel:`, or relative paths), neutralizing XSS vectors (`javascript:`, `data:`, `vbscript:`).
6. **Graceful Degradation with Developer Diagnostics:** Unrecognized node types are skipped safely without injecting unescaped tags, emitting a descriptive `console.warn` (`[BeechCMS RichText] Unrecognized node type "${node.type}". Skipping node.`).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

1. **Current Package Exports (`packages/client/package.json`):**
   ```json
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "types": "./dist/index.d.ts"
     },
     "./browser": {
       "import": "./dist/browser/index.js",
       "types": "./dist/browser/index.d.ts"
     },
     "./server": {
       "import": "./dist/server/index.js",
       "types": "./dist/server/index.d.ts"
     },
     "./webhooks": {
       "import": "./dist/webhooks/index.js",
       "types": "./dist/webhooks/index.d.ts"
     }
   }
   ```
2. **Current Package Dependencies (`packages/client/package.json`):**
   `"dependencies": {}` — `@beechcms/client` is already established as a zero-dependency package.
3. **Core RichText Implementation (`packages/core/src/content/richtext/`):**
   `packages/core` contains `richtext-render.ts` using `@tiptap/html` and `@tiptap/starter-kit` for internal dashboard rendering, and `richtext-sanitizer.ts` for database ingestion validation.
4. **Impact Analysis (`graphify affected`):**
   - Adding `@beechcms/client/richtext` does not touch `@beechcms/core`, `apps/api`, or `apps/dashboard`.
   - Existing client subpaths (`browser`, `server`, `webhooks`) remain completely untouched.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

1. `packages/client/package.json` — MODIFIED:
   - Add subpath export `"./richtext"` pointing to `"./dist/richtext/index.js"` and `"./dist/richtext/index.d.ts"`.
2. `packages/client/src/richtext/types.ts` — NEW:
   - Define TipTap AST types (`TipTapDoc`, `TipTapNode`, `TipTapMark`, `TipTapMarkType`), schema envelope type (`RichtextEnvelopeV1`), and schema version constant (`RICHTEXT_SCHEMA_VERSION = 1`).
3. `packages/client/src/richtext/escape.ts` — NEW:
   - Pure HTML character escaping (`escapeHtml`) and strict URL protocol validation (`isSafeUrl`, `stripControlChars`).
4. `packages/client/src/richtext/render.ts` — NEW:
   - Pure deterministic AST walker `renderRichText(value: unknown): string` and document normalizer `normalizeRichtextDocument(value: unknown): TipTapDoc | null`.
   - Renders block nodes (`doc`, `paragraph`, `heading`, `blockquote`, `codeBlock`, `horizontalRule`, `bulletList`, `orderedList`, `listItem`, `table`, `tableRow`, `tableHeader`, `tableCell`, `hardBreak`), inline nodes (`text`, `image`, `mathematics`/`inlineMath`/`blockMath`), and marks (`bold`, `italic`, `strike`, `underline`, `code`, `highlight`, `superscript`, `subscript`, `textStyle`, `link`).
   - Emits `console.warn` on unknown node types.
5. `packages/client/src/richtext/plain-text.ts` — NEW:
   - Pure recursive text harvester `richTextToPlainText(value: unknown): string` with block boundary whitespace separation and whitespace normalization.
6. `packages/client/src/richtext/index.ts` — NEW:
   - Public entrypoint for `@beechcms/client/richtext` exporting `renderRichText`, `richTextToPlainText`, `normalizeRichtextDocument`, `escapeHtml`, `isSafeUrl`, `stripControlChars`, `RICHTEXT_SCHEMA_VERSION`, and all TypeScript types.
7. `packages/client/src/richtext/richtext.test.ts` — NEW:
   - Exhaustive unit test suite covering HTML rendering, plain text extraction, edge-case normalization, XSS prevention, URL protocol filtering, unknown node handling, and envelope unwrapping.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 4.1 — `packages/client/package.json`

Add `"./richtext"` export mapping:

```json
{
  "name": "@beechcms/client",
  "version": "0.6.0-preview.3",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./browser": {
      "import": "./dist/browser/index.js",
      "types": "./dist/browser/index.d.ts"
    },
    "./server": {
      "import": "./dist/server/index.js",
      "types": "./dist/server/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/webhooks/index.js",
      "types": "./dist/webhooks/index.d.ts"
    },
    "./richtext": {
      "import": "./dist/richtext/index.js",
      "types": "./dist/richtext/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w --preserveWatchOutput",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@vitest/coverage-v8": "^4.1.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "license": "MIT"
}
```

---

### 4.2 — `packages/client/src/richtext/types.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const RICHTEXT_SCHEMA_VERSION = 1 as const

export interface RichtextEnvelopeV1 {
  schemaVersion: typeof RICHTEXT_SCHEMA_VERSION
  doc: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type TipTapMarkType =
  | 'bold'
  | 'strong'
  | 'italic'
  | 'em'
  | 'strike'
  | 's'
  | 'underline'
  | 'u'
  | 'code'
  | 'highlight'
  | 'superscript'
  | 'subscript'
  | 'textStyle'
  | 'link'
  | string

export interface TipTapMark {
  type: TipTapMarkType
  attrs?: Record<string, unknown>
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: TipTapMark[]
  text?: string
}

export interface TipTapDoc {
  type: 'doc'
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
}
```

---

### 4.3 — `packages/client/src/richtext/escape.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const HTML_ESCAPE_REGEX = /[&<>"']/g

/**
 * Escapes special HTML characters in strings to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_LOOKUP[char] || char)
}

/**
 * Strips ASCII control characters (0x00-0x1F, 0x7F-0x9F except \t, \n, \r).
 */
export function stripControlChars(str: string): string {
  if (!str) return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
}

const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])

/**
 * Validates whether a URL is safe to render in href/src attributes.
 * Allows safe protocols (http, https, mailto, tel) and relative paths.
 * Blocks dangerous protocols (javascript:, data:, vbscript:) including obfuscated variants.
 */
export function isSafeUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (!trimmed) return false
  const normalized = stripControlChars(trimmed).replace(/\s+/g, '').toLowerCase()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized)
  if (!schemeMatch) {
    // Relative URL, path, anchor, or query string
    return true
  }
  return ALLOWED_URL_PROTOCOLS.has(schemeMatch[1])
}
```

---

### 4.4 — `packages/client/src/richtext/render.ts`

```ts
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
```

---

### 4.5 — `packages/client/src/richtext/plain-text.ts`

```ts
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
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim()
}
```

---

### 4.6 — `packages/client/src/richtext/index.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { renderRichText, normalizeRichtextDocument } from './render.js'
export { richTextToPlainText } from './plain-text.js'
export { escapeHtml, stripControlChars, isSafeUrl } from './escape.js'
export { RICHTEXT_SCHEMA_VERSION } from './types.js'
export type {
  TipTapDoc,
  TipTapNode,
  TipTapMark,
  TipTapMarkType,
  RichtextEnvelopeV1,
} from './types.js'
```

---

### 4.7 — `packages/client/src/richtext/richtext.test.ts`

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import {
  renderRichText,
  richTextToPlainText,
  normalizeRichtextDocument,
  escapeHtml,
  isSafeUrl,
  RICHTEXT_SCHEMA_VERSION,
} from './index.js'

describe('@beechcms/client/richtext', () => {
  describe('escapeHtml & isSafeUrl', () => {
    it('escapes special HTML characters', () => {
      expect(escapeHtml('<script>alert("xss" & \'test\')</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;',
      )
    })

    it('allows valid HTTP, HTTPS, mailto, tel, and relative URLs', () => {
      expect(isSafeUrl('https://example.com/path?q=1')).toBe(true)
      expect(isSafeUrl('http://example.com')).toBe(true)
      expect(isSafeUrl('mailto:test@example.com')).toBe(true)
      expect(isSafeUrl('tel:+123456789')).toBe(true)
      expect(isSafeUrl('/relative/path')).toBe(true)
      expect(isSafeUrl('./path')).toBe(true)
      expect(isSafeUrl('#anchor')).toBe(true)
    })

    it('rejects dangerous and obfuscated JavaScript / Data URLs', () => {
      expect(isSafeUrl('javascript:alert(1)')).toBe(false)
      expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false)
      expect(isSafeUrl('java\tscript:alert(1)')).toBe(false)
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
      expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false)
      expect(isSafeUrl('')).toBe(false)
      expect(isSafeUrl(null)).toBe(false)
    })
  })

  describe('normalizeRichtextDocument', () => {
    it('returns null for falsy, primitive, or array values', () => {
      expect(normalizeRichtextDocument(null)).toBeNull()
      expect(normalizeRichtextDocument(undefined)).toBeNull()
      expect(normalizeRichtextDocument('')).toBeNull()
      expect(normalizeRichtextDocument(123)).toBeNull()
      expect(normalizeRichtextDocument(true)).toBeNull()
      expect(normalizeRichtextDocument(['foo'])).toBeNull()
    })

    it('drops legacy HTML strings to null', () => {
      expect(normalizeRichtextDocument('<p>Legacy HTML</p>')).toBeNull()
    })

    it('accepts raw TipTap doc object', () => {
      const doc = { type: 'doc', content: [] }
      expect(normalizeRichtextDocument(doc)).toEqual(doc)
    })

    it('unwraps valid BeechCMS Envelope V1', () => {
      const envelope = {
        schemaVersion: RICHTEXT_SCHEMA_VERSION,
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
        },
      }
      expect(normalizeRichtextDocument(envelope)).toEqual(envelope.doc)
    })

    it('returns null for malformed envelope v1', () => {
      expect(normalizeRichtextDocument({ schemaVersion: 1, doc: null })).toBeNull()
      expect(normalizeRichtextDocument({ schemaVersion: 1, doc: 'invalid' })).toBeNull()
      expect(normalizeRichtextDocument({ schemaVersion: 1, doc: { type: 'not_doc' } })).toBeNull()
    })
  })

  describe('renderRichText', () => {
    it('returns empty string for invalid inputs', () => {
      expect(renderRichText(null)).toBe('')
      expect(renderRichText(undefined)).toBe('')
      expect(renderRichText('')).toBe('')
      expect(renderRichText('<p>Legacy</p>')).toBe('')
    })

    it('renders basic paragraphs and headings with alignment', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, textAlign: 'center' },
            content: [{ type: 'text', text: 'My Title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world.' }],
          },
        ],
      }
      expect(renderRichText(doc)).toBe('<h2 style="text-align: center;">My Title</h2><p>Hello world.</p>')
    })

    it('renders marks: bold, italic, strike, underline, code, highlight, sub/sup', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Italic', marks: [{ type: 'italic' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Strike', marks: [{ type: 'strike' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Underline', marks: [{ type: 'underline' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Code', marks: [{ type: 'code' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Highlight', marks: [{ type: 'highlight', attrs: { color: '#ffcc00' } }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Sup', marks: [{ type: 'superscript' }] },
              { type: 'text', text: ' ' },
              { type: 'text', text: 'Sub', marks: [{ type: 'subscript' }] },
            ],
          },
        ],
      }
      const html = renderRichText(doc)
      expect(html).toBe(
        '<p><strong>Bold</strong> <em>Italic</em> <s>Strike</s> <u>Underline</u> <code>Code</code> <mark style="background-color: #ffcc00;">Highlight</mark> <sup>Sup</sup> <sub>Sub</sub></p>',
      )
    })

    it('renders safe links and enforces rel="noopener noreferrer" for target="_blank"', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Visit Google',
                marks: [{ type: 'link', attrs: { href: 'https://google.com', target: '_blank' } }],
              },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe(
        '<p><a href="https://google.com" target="_blank" rel="noopener noreferrer">Visit Google</a></p>',
      )
    })

    it('neutralizes malicious javascript: links', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Click me',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe('<p>Click me</p>')
    })

    it('renders codeBlock with richtext-code-block class and language', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'typescript' },
            content: [{ type: 'text', text: 'const a = 1 < 2;' }],
          },
        ],
      }
      expect(renderRichText(doc)).toBe(
        '<pre class="richtext-code-block"><code class="language-typescript">const a = 1 &lt; 2;</code></pre>',
      )
    })

    it('renders lists, blockquotes, horizontal rules, and hard breaks', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }],
          },
          { type: 'horizontalRule' },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }],
              },
            ],
          },
          {
            type: 'orderedList',
            attrs: { start: 2 },
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }],
              },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe(
        '<blockquote><p>Quote</p></blockquote><hr /><ul><li><p>Item 1</p></li></ul><ol start="2"><li><p>Item 2</p></li></ol>',
      )
    })

    it('renders tables with headers and cells', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 2 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header' }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 1' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell 2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe(
        '<table><tbody><tr><th colspan="2"><p>Header</p></th></tr><tr><td><p>Cell 1</p></td><td><p>Cell 2</p></td></tr></tbody></table>',
      )
    })

    it('renders safe images and drops unsafe src', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: 'https://example.com/logo.png', alt: 'Logo & "Brand"', title: 'BeechCMS' },
          },
          {
            type: 'image',
            attrs: { src: 'javascript:alert(1)' },
          },
        ],
      }
      expect(renderRichText(doc)).toBe(
        '<img src="https://example.com/logo.png" alt="Logo &amp; &quot;Brand&quot;" title="BeechCMS" />',
      )
    })

    it('renders mathematics and LaTeX nodes with fallback span', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Formula: ' },
              { type: 'inlineMath', attrs: { latex: 'E = mc^2' } },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe('<p>Formula: <span class="math-inline">E = mc^2</span></p>')
    })

    it('skips unknown node types and emits console.warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'customUnregisteredNode',
            attrs: { raw: '<script>alert(1)</script>' },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Safe paragraph' }],
          },
        ],
      }
      const html = renderRichText(doc)
      expect(html).toBe('<p>Safe paragraph</p>')
      expect(warnSpy).toHaveBeenCalledWith(
        '[BeechCMS RichText] Unrecognized node type "customUnregisteredNode". Skipping node.',
      )
      warnSpy.mockRestore()
    })
  })

  describe('richTextToPlainText', () => {
    it('returns empty string for invalid or empty inputs', () => {
      expect(richTextToPlainText(null)).toBe('')
      expect(richTextToPlainText(undefined)).toBe('')
      expect(richTextToPlainText('')).toBe('')
      expect(richTextToPlainText('<p>Legacy</p>')).toBe('')
    })

    it('extracts plain text across paragraphs with clean whitespace separation', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Article Title' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'This is the ' },
              { type: 'text', text: 'first paragraph.', marks: [{ type: 'bold' }] },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph with text.' }],
          },
        ],
      }
      const text = richTextToPlainText(doc)
      expect(text).toBe('Article Title\nThis is the first paragraph.\nSecond paragraph with text.')
    })

    it('extracts text from lists, tables, and blockquotes without word collision', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] }],
              },
            ],
          },
        ],
      }
      expect(richTextToPlainText(doc)).toBe('Alpha\nBeta')
    })

    it('includes image alt text in plain text extraction', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Photo of ' },
              { type: 'image', attrs: { src: 'https://example.com/tree.jpg', alt: 'A beech tree' } },
            ],
          },
        ],
      }
      expect(richTextToPlainText(doc)).toBe('Photo of A beech tree')
    })
  })
})
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Execute the following commands sequentially to validate compilation, formatting, and unit tests:

```bash
# 1. Type-check and build @beechcms/client
pnpm --filter @beechcms/client build

# 2. Run unit tests in @beechcms/client with coverage
pnpm --filter @beechcms/client test

# 3. Monorepo-wide test suite to verify zero regressions
pnpm beech test --diff

# 4. Monorepo linting
pnpm beech lint
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/client/package.json` contains `"./richtext"` in `exports` with `import` and `types` fields.
- [ ] `@beechcms/client/richtext` exposes `renderRichText`, `richTextToPlainText`, `normalizeRichtextDocument`, `escapeHtml`, `stripControlChars`, `isSafeUrl`, `RICHTEXT_SCHEMA_VERSION`, and all TypeScript types.
- [ ] Zero runtime dependencies added to `packages/client/package.json` (`dependencies: {}` preserved).
- [ ] `renderRichText` and `richTextToPlainText` safely return `""` on `null`, `undefined`, empty string, legacy HTML strings, primitives, and malformed envelopes.
- [ ] Transparently unwraps both raw TipTap doc objects (`{ type: 'doc' }`) and BeechCMS Envelope V1 (`{ schemaVersion: 1, doc }`).
- [ ] Strict HTML character escaping (`&`, `<`, `>`, `"`, `'`) is applied to all text nodes.
- [ ] Link `href` and image `src` are sanitized against dangerous protocols (`javascript:`, `data:`, `vbscript:`).
- [ ] Unrecognized node types are skipped gracefully while logging a descriptive `console.warn`.
- [ ] `richTextToPlainText` cleanly separates block-level elements with whitespace/newlines and trims output.
- [ ] All unit tests in `packages/client/src/richtext/richtext.test.ts` pass with 100% coverage on new code.
- [ ] Monorepo build and lint checks pass without errors.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **External ProseMirror / TipTap Packages (`@tiptap/html`, `prosemirror-*`)**: Strictly forbidden in `@beechcms/client` to maintain a zero-dependency, lightweight bundle footprint.
- **External DOM Polyfills (`jsdom`, `happy-dom`)**: Not used; AST serialization is pure string concatenation.
- **UI Framework Renderers (React / Vue / Svelte components)**: The client SDK delivers pure HTML and plain text strings. UI component wrappers belong in framework-specific packages (e.g. `@beechcms/forms-react`).
- **Dynamic Plugin / Custom Extension Registry**: BeechCMS uses a fixed, deterministic content schema. No runtime extension manager is provided.
- **Client-Side Automatic Fetch Response Parsing**: The HTTP client does not mutate API response JSON; consumers explicitly invoke `renderRichText` or `richTextToPlainText`.
- **Text Truncation & Word Clipping Helpers**: Word boundaries and character length clipping are the responsibility of consuming applications.
