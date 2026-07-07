// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { renderRichText, normalizeRichtextForRender } from './richtext-render.js'

describe('Richtext Render', () => {
  describe('normalizeRichtextForRender', () => {
    it('handles null and empty values', () => {
      expect(normalizeRichtextForRender(null)).toBeNull()
      expect(normalizeRichtextForRender('')).toBeNull()
    })

    it('drops legacy HTML strings to null (JSON-only)', () => {
      expect(normalizeRichtextForRender('<p>Hello</p>')).toBeNull()
    })

    it('handles Tiptap JSON directly', () => {
      const doc = { type: 'doc', content: [] }
      expect(normalizeRichtextForRender(doc)).toEqual(doc)
    })

    it('handles Richtext Envelope V1', () => {
      const envelope = {
        schemaVersion: 1,
        doc: { type: 'doc', content: [] },
        metadata: { wordCount: 0 }
      }
      expect(normalizeRichtextForRender(envelope)).toEqual(envelope.doc)
    })

  })

  describe('renderRichText', () => {
    it('renders an empty string for null/empty', () => {
      expect(renderRichText(null)).toBe('')
    })

    it('drops legacy HTML strings to empty', () => {
      expect(renderRichText('<div>Legacy</div>')).toBe('')
    })

    it('renders Tiptap JSON to HTML', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello World' }]
          }
        ]
      }
      const html = renderRichText(doc)
      expect(html).toContain('<p>Hello World</p>')
    })

    it('handles extensions like bold and italic', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] }
            ]
          }
        ]
      }
      const html = renderRichText(doc)
      expect(html).toContain('<strong>Bold</strong>')
    })
  })
})
