// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect } from "vitest"
import en from "./en.json"
import itJson from "./it.json"
import enSource from "./en.json?raw"
import itSource from "./it.json?raw"

/** Every key that appears twice in the same object: JSON.parse keeps the last one and drops the other without a word. */
function duplicateKeys(text: string): string[] {
  const stack: Array<Set<string>> = []
  const duplicates: string[] = []
  // A string (a key if a colon follows it) or a brace; strings are taken whole, so braces inside them are never seen.
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"(\s*:)?|([{}])/g)) {
    if (match[3] === "{") stack.push(new Set())
    else if (match[3] === "}") stack.pop()
    else if (match[2] !== undefined && stack.length > 0) {
      const keys = stack[stack.length - 1]
      if (keys.has(match[1])) duplicates.push(match[1])
      keys.add(match[1])
    }
  }
  return duplicates
}

describe("dashboard locales parity and coverage", () => {
  it("no object repeats a key, so no translation silently overwrites another", () => {
    expect(duplicateKeys(enSource)).toEqual([])
    expect(duplicateKeys(itSource)).toEqual([])
  })

  it("en.json contains required rbac invitation and role keys", () => {
    expect(en.rbac?.invitations?.copyLink).toBe("Copy invite link")
    expect(en.rbac?.invitations?.linkCopied).toBe("Invite link copied")
    expect(en.rbac?.roles?.moreRoles).toBe("+{{count}} more")
  })

  it("it.json contains required rbac invitation and role keys", () => {
    expect(itJson.rbac?.invitations?.copyLink).toBe("Copia link di invito")
    expect(itJson.rbac?.invitations?.linkCopied).toBe("Link di invito copiato")
    expect(itJson.rbac?.roles?.moreRoles).toBe("+{{count}} altri")
  })
})
