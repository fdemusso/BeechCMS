// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export function cronMatches(expression: string | null, scheduledTime: number): boolean {
  if (!expression) return false
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const d = new Date(scheduledTime)
  const actual = [
    d.getUTCMinutes(),
    d.getUTCHours(),
    d.getUTCDate(),
    d.getUTCMonth() + 1,
    d.getUTCDay(),
  ] as const

  return parts.every((field, i) => matchField(field, actual[i]))
}

function matchField(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.includes(',')) {
    return field.split(',').some((part) => matchField(part, value))
  }
  if (field.includes('/')) {
    const [rangePart, stepPart] = field.split('/')
    const step = Number(stepPart)
    if (!Number.isFinite(step) || step <= 0) return false
    if (rangePart === '*') return value % step === 0
    if (rangePart.includes('-')) {
      const [lo, hi] = rangePart.split('-').map(Number)
      return value >= lo && value <= hi && (value - lo) % step === 0
    }
    return false
  }
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number)
    return Number.isFinite(lo) && Number.isFinite(hi) && value >= lo && value <= hi
  }
  const n = Number(field)
  return Number.isFinite(n) && n === value
}
