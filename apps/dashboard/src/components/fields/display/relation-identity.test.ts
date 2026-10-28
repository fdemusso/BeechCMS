// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from "vitest"
import { initialsOf, toRelationIdentity } from "./relation-identity"

describe("initialsOf", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["Ada Augusta King Lovelace", "AL"],
    ["acme", "AC"],
    ["  ", ""],
  ])("turns %j into %j", (text, expected) => {
    const initials = initialsOf(text)

    expect(initials).toBe(expected)
  })
})

describe("toRelationIdentity", () => {
  const id = "3f2a9c1e-77b4-4d0e-9a51-0c6d2e8b41ab"

  it("uses the avatar URL and the display-name initials when the entry has an image", () => {
    const identity = toRelationIdentity(id, "Ada Lovelace", " https://cdn.example/ada.png ")

    expect(identity).toEqual({ label: "Ada Lovelace", initials: "AL", imageUrl: "https://cdn.example/ada.png" })
  })

  it("has no image when the avatar value is empty or not a string", () => {
    const empty = toRelationIdentity(id, "Ada Lovelace", "  ")
    const wrongType = toRelationIdentity(id, "Ada Lovelace", 42)

    expect([empty.imageUrl, wrongType.imageUrl]).toEqual([null, null])
  })

  it("falls back to the last two characters of the id when the display name is missing", () => {
    const identity = toRelationIdentity(id, undefined)

    expect(identity).toEqual({ label: id, initials: "AB", imageUrl: null })
  })

  it("stringifies a numeric display name", () => {
    const identity = toRelationIdentity(id, 4096)

    expect(identity.label).toBe("4096")
  })
})
