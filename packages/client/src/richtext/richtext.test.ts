// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import {
  renderRichText,
  renderRichTextHtml,
  richTextToPlainText,
  extractPlainText,
  normalizeRichtextDocument,
  escapeHtml,
  stripControlChars,
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
      expect(isSafeUrl(123)).toBe(false)
      expect(isSafeUrl('   ')).toBe(false)
    })

    it('stripControlChars removes ASCII control chars', () => {
      expect(stripControlChars('')).toBe('')
      expect(stripControlChars('hello\x00world\x1F')).toBe('helloworld')
    })
    
    it('escapeHtml handles empty string', () => {
      expect(escapeHtml('')).toBe('')
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

    it('handles hardBreak, horizontalRule, math, and unknown nodes in plain text', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Line 1' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Line 2' },
            ],
          },
          { type: 'horizontalRule' },
          {
            type: 'paragraph',
            content: [
              { type: 'inlineMath', attrs: { latex: 'x + y = z' } },
            ],
          },
          {
            type: 'unsupportedNode',
          },
        ],
      }
      expect(richTextToPlainText(doc)).toBe('Line 1\nLine 2\nx + y = z')
      expect(warnSpy).toHaveBeenCalledWith('[BeechCMS RichText] Unrecognized node type "unsupportedNode". Skipping node.')
      warnSpy.mockRestore()
    })

    it('renders textStyle and clamp heading levels', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 99 },
            content: [
              { type: 'text', text: 'Colored text', marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }] },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 0 },
            content: [
              { type: 'text', text: 'Heading 1 fallback' },
            ],
          },
        ],
      }
      expect(renderRichText(doc)).toBe('<h6><span style="color: #ff0000;">Colored text</span></h6><h1>Heading 1 fallback</h1>')
    })

    it('exposes renderRichTextHtml and extractPlainText as functional aliases', () => {
      expect(renderRichTextHtml).toBe(renderRichText)
      expect(extractPlainText).toBe(richTextToPlainText)
    })
  })
})
