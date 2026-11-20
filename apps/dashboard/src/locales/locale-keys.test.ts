// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import en from "./en.json"

// Production code only: tests mock `t`, so a key they invent proves nothing about the locale files.
const sources = import.meta.glob<string>(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**", "!/src/locales/**"],
  { query: "?raw", import: "default", eager: true }
)

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Every dotted path the locale tree answers to: leaves, the plural base of a leaf, and the objects above them. */
function knownPaths(node: unknown, prefix = "", out = new Set<string>()): Set<string> {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    out.add(path)
    out.add(path.replace(PLURAL_SUFFIX, ""))
    if (value && typeof value === "object") knownPaths(value, path, out)
  }
  return out
}

/** String literals that look like a key of this locale tree, with comments removed so prose cannot pass for a call. */
function keyLiterals(source: string, domains: Set<string>): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")
  const found: string[] = []
  for (const match of code.matchAll(/(["'`])([A-Za-z]+(?:\.[A-Za-z0-9_:-]+)+)\1/g)) {
    if (domains.has(match[2].split(".")[0])) found.push(match[2])
  }
  return found
}

describe("locale keys referenced by the dashboard code", () => {
  it("every key a source file names exists in en.json, so no screen falls back to a hardcoded string", () => {
    const known = knownPaths(en)
    const domains = new Set(Object.keys(en))

    const missing = Object.entries(sources).flatMap(([file, source]) =>
      keyLiterals(source, domains)
        .filter((key) => !known.has(key))
        .map((key) => `${key}  (${file.replace("/src/", "")})`)
    )

    expect(missing).toEqual([])
  })
})
