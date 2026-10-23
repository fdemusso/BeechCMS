// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "@/lib/sanitize-html"

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("")
  })

  it("preserves safe html tags and content", () => {
    const input = "<p>Hello <strong>World</strong></p>"
    expect(sanitizeHtml(input)).toBe(input)
  })

  it("strips script tags", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>'
    expect(sanitizeHtml(input)).not.toContain("script")
    expect(sanitizeHtml(input)).not.toContain("alert")
  })

  it("strips inline event handlers", () => {
    const input = '<img src="x" onerror="alert(1)" />'
    expect(sanitizeHtml(input)).not.toContain("onerror")
  })

  it("strips javascript: URIs", () => {
    const input = '<a href="javascript:alert(1)">Click</a>'
    expect(sanitizeHtml(input)).not.toContain("javascript:")
  })
  it.each([
    ["tab", "jav\tascript:alert(1)"],
    ["newline", "jav\nascript:alert(1)"],
    ["leading control char", "\u0001javascript:alert(1)"],
    ["vbscript", "vbscript:msgbox(1)"],
  ])("strips obfuscated script URIs (%s)", (_label, href) => {
    const out = sanitizeHtml(`<a href="${href}">Click</a>`)
    expect(out).not.toContain("href")
  })

  it.each([
    ["xlink:href on svg anchor", '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>', "xlink:href"],
    ["formaction on button", '<form><button formaction="javascript:alert(1)">Go</button></form>', "formaction"],
    ["action on form", '<form action="javascript:alert(1)"><input /></form>', "action"],
    ["poster on video", '<video poster="javascript:alert(1)"></video>', "poster"],
    ["background on table", '<table background="javascript:alert(1)"></table>', "background"],
    ["obfuscated formaction", '<form><button formaction="jav&#x09;ascript:alert(1)">Go</button></form>', "formaction"],
  ])("strips script URIs from non-href URL attributes (%s)", (_label, html, attrName) => {
    const out = sanitizeHtml(html)
    expect(out).not.toContain(attrName)
    expect(out).not.toContain("javascript:")
  })

  it("keeps safe URLs on non-href URL attributes", () => {
    const input = '<form action="/submit"><button formaction="https://a.example/x">Go</button></form>'
    expect(sanitizeHtml(input)).toBe(input)
  })

  it("keeps safe http, mailto and relative links", () => {
    const input = '<a href="https://a.example/x">a</a><a href="mailto:a@b.c">b</a><a href="/rel">c</a>'
    expect(sanitizeHtml(input)).toBe(input)
  })
})
