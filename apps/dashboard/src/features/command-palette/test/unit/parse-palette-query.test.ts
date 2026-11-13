// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { parsePaletteQuery } from "../../lib/parse-palette-query"

describe("parsePaletteQuery", () => {
  it("a leading = on the root page is returned as the prefix and stripped from the trimmed text", () => {
    const result = parsePaletteQuery("=2+2", "root")

    expect(result).toEqual({ prefix: "=", text: "2+2" })
  })

  it("a leading / on the root page is returned as the prefix and stripped from the trimmed text", () => {
    const result = parsePaletteQuery("/ hello", "root")

    expect(result).toEqual({ prefix: "/", text: "hello" })
  })

  it("= followed by spaces and an expression yields the same text as without the spaces", () => {
    const result = parsePaletteQuery("  =   2+2  ", "root")

    expect(result).toEqual({ prefix: "=", text: "2+2" })
  })

  it("a lone = yields the prefix with empty text", () => {
    const result = parsePaletteQuery("=", "root")

    expect(result).toEqual({ prefix: "=", text: "" })
  })

  it("a leading = on a sub-page is plain text and yields no prefix", () => {
    const result = parsePaletteQuery("=2+2", "seeds")

    expect(result).toEqual({ text: "=2+2" })
    expect("prefix" in result).toBe(false)
  })

  it("a query without a prefix character yields no prefix and the trimmed text", () => {
    const result = parsePaletteQuery("  posts  ", "root")

    expect(result).toEqual({ text: "posts" })
    expect("prefix" in result).toBe(false)
  })

  it("a prefix character after other text is not a prefix", () => {
    const result = parsePaletteQuery("2=2", "root")

    expect(result).toEqual({ text: "2=2" })
  })
})
