// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// @vitest-environment node

import { describe, expect, it } from "vitest"
import { extractTextFromTiptap, isTipTapDoc } from "./display/richtext-plain"

describe("isTipTapDoc", () => {
  it("returns false for falsy or primitive values", () => {
    expect(isTipTapDoc(null)).toBe(false)
    expect(isTipTapDoc(undefined)).toBe(false)
    expect(isTipTapDoc("")).toBe(false)
    expect(isTipTapDoc(42)).toBe(false)
    expect(isTipTapDoc(true)).toBe(false)
    expect(isTipTapDoc([])).toBe(false)
  })

  it("returns false for plain records and non-doc objects", () => {
    expect(isTipTapDoc({ a: "foo", b: "bar" })).toBe(false)
    expect(isTipTapDoc({ type: "paragraph" })).toBe(false)
    expect(isTipTapDoc({ doc: null })).toBe(false)
    expect(isTipTapDoc({ doc: { type: "paragraph" } })).toBe(false)
  })

  it("returns true for direct TipTap doc objects", () => {
    expect(isTipTapDoc({ type: "doc", content: [] })).toBe(true)
    expect(
      isTipTapDoc({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      })
    ).toBe(true)
  })

  it("returns true for TipTap envelope v1 objects", () => {
    expect(
      isTipTapDoc({
        schemaVersion: 1,
        doc: { type: "doc", content: [] },
      })
    ).toBe(true)
  })

  it("returns true for valid JSON strings of TipTap doc or envelope", () => {
    expect(isTipTapDoc(JSON.stringify({ type: "doc", content: [] }))).toBe(true)
    expect(
      isTipTapDoc(JSON.stringify({ schemaVersion: 1, doc: { type: "doc", content: [] } }))
    ).toBe(true)
  })

  it("returns false for strings that are not TipTap doc JSON", () => {
    expect(isTipTapDoc("plain text")).toBe(false)
    expect(isTipTapDoc("<p>html</p>")).toBe(false)
    expect(isTipTapDoc("{ not valid json")).toBe(false)
    expect(isTipTapDoc(JSON.stringify({ foo: "bar" }))).toBe(false)
  })
})

describe("extractTextFromTiptap", () => {
  it("returns empty string for null, undefined, or empty string", () => {
    expect(extractTextFromTiptap(null)).toBe("")
    expect(extractTextFromTiptap(undefined)).toBe("")
    expect(extractTextFromTiptap("")).toBe("")
  })

  it("returns empty string for legacy HTML strings or non-doc values", () => {
    expect(extractTextFromTiptap("<p>Hello world</p>")).toBe("")
    expect(extractTextFromTiptap({ foo: "bar" })).toBe("")
    expect(extractTextFromTiptap(123)).toBe("")
  })

  it("extracts text from direct TipTap doc AST", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Welcome to our blog." }],
        },
      ],
    }
    expect(extractTextFromTiptap(doc)).toBe("Welcome to our blog.")
  })

  it("extracts text without leaking node types or mark names", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              marks: [{ type: "bold" }, { type: "italic" }],
              text: "Welcome to our blog.",
            },
          ],
        },
      ],
    }
    expect(extractTextFromTiptap(doc)).toBe("Welcome to our blog.")
  })

  it("extracts text from TipTap envelope v1", () => {
    const envelope = {
      schemaVersion: 1,
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Welcome to our blog." }],
          },
        ],
      },
    }
    expect(extractTextFromTiptap(envelope)).toBe("Welcome to our blog.")
  })

  it("extracts text from stringified TipTap JSON", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Welcome to our blog." }],
        },
      ],
    })
    expect(extractTextFromTiptap(json)).toBe("Welcome to our blog.")
  })

  it("returns empty string for empty TipTap docs", () => {
    expect(extractTextFromTiptap({ type: "doc", content: [] })).toBe("")
    expect(
      extractTextFromTiptap({
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      })
    ).toBe("")
  })

  it("joins multiple paragraphs and blocks with space and collapses whitespace", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "First paragraph." },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Second paragraph." },
          ],
        },
      ],
    }
    expect(extractTextFromTiptap(doc)).toBe("Title First paragraph. Second paragraph.")
  })
})
