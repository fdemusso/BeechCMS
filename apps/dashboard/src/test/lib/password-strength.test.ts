// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import {
  passwordStrength,
  getStrengthColor,
  getStrengthLabelKey,
  normLeet,
  longestKbWalk,
  maxRepeatRun,
  maxSeqRun,
  personalInfoPenalty,
} from "@/lib/password-strength"

describe("password-strength utilities", () => {
  it("returns 0 for empty password", () => {
    expect(passwordStrength("")).toBe(0)
  })

  it("calculates strength for weak passwords", () => {
    const score = passwordStrength("short")
    expect(score).toBeLessThan(40)
    expect(getStrengthColor(score)).toBe("bg-destructive")
    expect(getStrengthLabelKey(score)).toBe("strengthWeak")
  })

  it("calculates strength for medium passwords", () => {
    // 8+ characters, mixed case and numbers
    const score = passwordStrength("Abc123xyz")
    expect(score).toBeGreaterThanOrEqual(40)
    expect(score).toBeLessThan(70)
    expect(getStrengthColor(score)).toBe("bg-amber-500")
    expect(getStrengthLabelKey(score)).toBe("strengthFair")
  })

  it("calculates strength for strong passwords", () => {
    // 16+ chars, uppercase, lowercase, numbers, symbols, high entropy
    const score = passwordStrength("K8#mQ9!vL2$pX5@zR")
    expect(score).toBeGreaterThanOrEqual(70)
    expect(getStrengthColor(score)).toBe("bg-green-500")
    expect(getStrengthLabelKey(score)).toBe("strengthStrong")
  })

  it("applies penalty for personal info in password", () => {
    const withoutInfo = passwordStrength("P@ssword1234!", "Mario", "Rossi", "mario@example.com")
    const withName = passwordStrength("MarioRossi1234!", "Mario", "Rossi", "mario@example.com")
    expect(withName).toBeLessThan(withoutInfo)
  })

  it("detects leet-speak normalized matching", () => {
    expect(normLeet("p@ssw0rd")).toBe("password")
  })

  it("detects keyboard walks", () => {
    expect(longestKbWalk("qwerty")).toBe(6)
    expect(longestKbWalk("asdfg")).toBe(5)
    expect(longestKbWalk("normal")).toBeLessThan(4)
  })

  it("detects repeated characters", () => {
    expect(maxRepeatRun("aaaa")).toBe(4)
    expect(maxRepeatRun("aAaa")).toBe(4)
    expect(maxRepeatRun("abcd")).toBe(1)
  })

  it("detects sequential characters", () => {
    expect(maxSeqRun("12345")).toBe(5)
    expect(maxSeqRun("abcde")).toBe(5)
  })

  it("applies personal info penalties correctly", () => {
    expect(personalInfoPenalty("mario123", ["mario"])).toBe(30)
    expect(personalInfoPenalty("oiram123", ["mario"])).toBe(30) // reversed
    expect(personalInfoPenalty("m4r10123", ["mario"])).toBe(20) // leet
    expect(personalInfoPenalty("nothing", ["mario"])).toBe(0)
  })
})
