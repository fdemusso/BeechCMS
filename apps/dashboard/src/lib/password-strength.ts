// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Leet-speak substitution table for normalized matching
const LEET_MAP: Record<string, string> = {
  '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i',
  '0': 'o', '$': 's', '5': 's', '7': 't', '9': 'g', '8': 'b',
}

// Common keyboard row sequences (QWERTY + QWERTZ)
const KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertzuiop']

export function normLeet(s: string): string {
  return s.toLowerCase().split('').map(c => LEET_MAP[c] ?? c).join('')
}

// Returns the length of the longest consecutive keyboard-row walk (forward or backward)
export function longestKbWalk(pw: string): number {
  const s = pw.toLowerCase()
  let max = 1
  for (const row of KB_ROWS) {
    for (let i = 0; i < s.length - 1; i++) {
      let run = 1, dir = 0
      for (let j = i + 1; j < s.length; j++) {
        const a = row.indexOf(s[j - 1]), b = row.indexOf(s[j])
        if (a < 0 || b < 0) break
        const step = b - a
        if (step === 0) break
        if (dir === 0) dir = Math.sign(step)
        if (Math.sign(step) !== dir || Math.abs(step) !== 1) break
        run++
      }
      if (run > max) max = run
    }
  }
  return max
}

// Returns the longest run of the same character repeated consecutively
export function maxRepeatRun(pw: string): number {
  let max = 1, run = 1
  for (let i = 1; i < pw.length; i++) {
    run = pw[i].toLowerCase() === pw[i - 1].toLowerCase() ? run + 1 : 1
    if (run > max) max = run
  }
  return max
}

// Returns the longest ascending/descending sequence within the same character class
export function maxSeqRun(pw: string): number {
  let max = 1, run = 1
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1)
    const sameClass =
      (/[a-zA-Z]/.test(pw[i]) && /[a-zA-Z]/.test(pw[i - 1])) ||
      (/[0-9]/.test(pw[i]) && /[0-9]/.test(pw[i - 1]))
    run = sameClass && (diff === 1 || diff === -1) ? run + 1 : 1
    if (run > max) max = run
  }
  return max
}

// Computes penalty for personal info, with tiered severity:
//   direct/reversed match → -30, leet-normalized match → -20, partial substring (≥4 chars) → -10
export function personalInfoPenalty(pw: string, tokens: string[]): number {
  const lower = pw.toLowerCase()
  const normed = normLeet(pw)
  let penalty = 0
  const seen = new Set<string>()

  for (const raw of tokens) {
    const t = raw.trim().toLowerCase()
    if (t.length < 3 || seen.has(t)) continue
    seen.add(t)

    const rev = t.split('').reverse().join('')
    const tNorm = normLeet(t)

    if (lower.includes(t) || lower.includes(rev)) {
      penalty += 30
    } else if (normed.includes(tNorm)) {
      penalty += 20
    } else if (t.length >= 5) {
      // Check if any substring of length ≥ 4 is present (catch partial name leaks)
      outer: for (let len = t.length - 1; len >= 4; len--) {
        for (let start = 0; start <= t.length - len; start++) {
          if (lower.includes(t.slice(start, start + len))) {
            penalty += 10
            break outer
          }
        }
      }
    }
  }

  return penalty
}

export function passwordStrength(pw: string, name?: string, surname?: string, email?: string): number {
  if (!pw) return 0

  let score = 0

  // Length bonuses — max 40 pts
  if (pw.length >= 8)  score += 10
  if (pw.length >= 10) score += 10
  if (pw.length >= 12) score += 10
  if (pw.length >= 16) score += 10

  // Character variety — max 50 pts
  const hasLc  = /[a-z]/.test(pw)
  const hasUc  = /[A-Z]/.test(pw)
  const hasNum = /[0-9]/.test(pw)
  const hasSym = /[^a-zA-Z0-9]/.test(pw)
  const classes = [hasLc, hasUc, hasNum, hasSym].filter(Boolean).length

  if (hasLc)        score += 10
  if (hasUc)        score += 10
  if (hasNum)       score += 10
  if (hasSym)       score += 15
  if (classes >= 3) score += 5 // bonus for genuine variety

  // Character entropy — max 10 pts (penalizes low unique-char density)
  const uniqueRatio = new Set(pw.toLowerCase()).size / pw.length
  if (uniqueRatio >= 0.8)      score += 10
  else if (uniqueRatio >= 0.6) score += 5

  // --- Penalties ---
  let penalty = 0

  // Personal info (direct, reversed, leet-normalized, partial)
  const emailLocal = email ? email.trim().split('@')[0] : undefined
  const tokens = [name, surname, email, emailLocal].filter(Boolean) as string[]
  penalty += personalInfoPenalty(pw, tokens)

  // Keyboard walk patterns (qwerty, 12345, asdf…)
  const walk = longestKbWalk(pw)
  if (walk >= 5)      penalty += 25
  else if (walk >= 4) penalty += 15

  // Repeated characters (aaaa, 1111…)
  const repeat = maxRepeatRun(pw)
  if (repeat >= 4)      penalty += 20
  else if (repeat >= 3) penalty += 10

  // Sequential characters (abcd, 1234, zyxw…)
  const seq = maxSeqRun(pw)
  if (seq >= 5)      penalty += 20
  else if (seq >= 4) penalty += 10

  return Math.max(0, Math.min(score - penalty, 100))
}

export function getStrengthColor(strength: number): string {
  return strength < 40 ? 'bg-destructive' : strength < 70 ? 'bg-amber-500' : 'bg-green-500'
}

export function getStrengthLabelKey(strength: number): 'strengthWeak' | 'strengthFair' | 'strengthStrong' {
  return strength < 40 ? 'strengthWeak' : strength < 70 ? 'strengthFair' : 'strengthStrong'
}
