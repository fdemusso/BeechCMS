// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { convertValue } from "../../lib/convert-value"

describe("convertValue", () => {
  it("px and rem convert to the other unit on the 16px base", () => {
    const inputs = ["16px", "16px to rem", "1.5rem in px"]

    const results = inputs.map((input) => convertValue(input)?.to)

    expect(results).toEqual(["1rem", "1rem", "24px"])
  })

  it("a same-unit target gives null", () => {
    const result = convertValue("16px to px")

    expect(result).toBeNull()
  })

  it("storage conversions respect decimal and binary units", () => {
    const cases: [string, string][] = [
      ["1 GB", "0.9313 GiB"],
      ["1 GiB", "1.0737 GB"],
      ["1536 B to KiB", "1.5 KiB"],
      ["2 TB to GB", "2000 GB"],
    ]

    const results = cases.map(([input]) => convertValue(input)?.to)

    expect(results).toEqual(cases.map(([, expected]) => expected))
  })

  it("a bare byte count without a target and a negative storage value give null", () => {
    const results = ["5 B", "-1 GB"].map((input) => convertValue(input))

    expect(results).toEqual([null, null])
  })

  it("short and long hex colours convert to rgb with a lowercased source", () => {
    const results = ["#f00", "#FF0000"].map((input) => convertValue(input))

    expect(results).toEqual([
      { kind: "color", from: "#f00", to: "rgb(255, 0, 0)" },
      { kind: "color", from: "#ff0000", to: "rgb(255, 0, 0)" },
    ])
  })

  it("hex of length 4 or 8 gives null", () => {
    const results = ["#ff00", "#ff000000"].map((input) => convertValue(input))

    expect(results).toEqual([null, null])
  })

  it("10 and 13 digit integers convert to the same ISO UTC instant", () => {
    const results = ["1700000000", "1700000000000"].map((input) => convertValue(input))

    expect(results).toEqual([
      { kind: "unix-seconds", from: "1700000000", to: "2023-11-14T22:13:20.000Z" },
      { kind: "unix-millis", from: "1700000000000", to: "2023-11-14T22:13:20.000Z" },
    ])
  })

  it("an integer of 9 or 11 digits gives null", () => {
    const results = ["170000000", "17000000000"].map((input) => convertValue(input))

    expect(results).toEqual([null, null])
  })

  it("an unrecognised conversion gives null", () => {
    const result = convertValue("5 apples to pears")

    expect(result).toBeNull()
  })

  it("a sub-unit result keeps four significant digits", () => {
    const result = convertValue("1px to rem")

    expect(result?.to).toBe("0.0625rem")
  })
})
