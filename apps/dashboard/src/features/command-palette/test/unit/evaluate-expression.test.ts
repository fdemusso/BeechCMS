// @vitest-environment node

// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { evaluateExpression } from "../../lib/evaluate-expression"

describe("evaluateExpression", () => {
  it("precedence and associativity follow the grammar", () => {
    const cases: [string, number][] = [
      ["2+3*4", 14],
      ["2-3-4", -5],
      ["2^3^2", 512],
      ["-2^2", -4],
      ["2^-1", 0.5],
      ["(2+3)*4", 20],
      [".5+1", 1.5],
    ]

    const results = cases.map(([input]) => evaluateExpression(input)?.value)

    expect(results).toEqual(cases.map(([, expected]) => expected))
  })

  it("2025-5 evaluates to 2020 and is compound", () => {
    const result = evaluateExpression("2025-5")

    expect(result).toEqual({ value: 2020, compound: true })
  })

  it("a lone operand is not compound", () => {
    const results = ["-5", "(7)"].map((input) => evaluateExpression(input))

    expect(results).toEqual([
      { value: -5, compound: false },
      { value: 7, compound: false },
    ])
  })

  it("invalid or incomplete input gives null", () => {
    const inputs = ["2+", "(1+2", "1+2)", "*3", "2(3)", "1,5", "16px", "", "   "]

    const results = inputs.map((input) => evaluateExpression(input))

    expect(results).toEqual(inputs.map(() => null))
  })

  it("division by zero and overflow give null", () => {
    const results = ["1/0", "0/0", "10^400"].map((input) => evaluateExpression(input))

    expect(results).toEqual([null, null, null])
  })

  it("input above the length cap gives null", () => {
    // The cap bounds parser work per keystroke.
    const input = "1+".repeat(100) + "1"

    const result = evaluateExpression(input)

    expect(result).toBeNull()
  })

  it("nesting deeper than the depth cap gives null", () => {
    // The cap bounds recursion depth.
    const input = "(".repeat(33) + "1" + ")".repeat(33)

    const result = evaluateExpression(input)

    expect(result).toBeNull()
  })

  it("identifier-looking input gives null", () => {
    // Regression guard: the parser must never hand input to dynamic code evaluation.
    const results = ["alert(1)", "constructor"].map((input) => evaluateExpression(input))

    expect(results).toEqual([null, null])
  })
})
