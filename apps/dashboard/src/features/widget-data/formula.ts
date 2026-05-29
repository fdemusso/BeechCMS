// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AggregateFormula, ResolvedEntry } from './types'

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/**
 * Pure client-side evaluation of an AggregateFormula against a list of ResolvedEntry objects.
 * Useful for local computation when entries are already fetched (e.g. from useWidgetList).
 */
export function evaluateFormula(entries: ResolvedEntry[], formula: AggregateFormula): number {
  if (entries.length === 0) return 0

  switch (formula.op) {
    case 'count':
      return entries.length

    case 'sum': {
      let total = 0
      for (const entry of entries) {
        total += toNumber(entry[formula.column])
      }
      return total
    }

    case 'avg': {
      if (entries.length === 0) return 0
      let sum = 0
      for (const entry of entries) {
        sum += toNumber(entry[formula.column])
      }
      return sum / entries.length
    }

    case 'min': {
      let min = Infinity
      for (const entry of entries) {
        const v = toNumber(entry[formula.column])
        if (v < min) min = v
      }
      return min === Infinity ? 0 : min
    }

    case 'max': {
      let max = -Infinity
      for (const entry of entries) {
        const v = toNumber(entry[formula.column])
        if (v > max) max = v
      }
      return max === -Infinity ? 0 : max
    }

    case 'countWhere': {
      let count = 0
      for (const entry of entries) {
        if (entry[formula.column] === formula.value) count++
      }
      return count
    }

    case 'percentageOf': {
      let numeratorSum = 0
      let denominatorSum = 0
      for (const entry of entries) {
        numeratorSum += toNumber(entry[formula.numeratorColumn])
        denominatorSum += toNumber(entry[formula.denominatorColumn])
      }
      if (denominatorSum === 0) return 0
      return (numeratorSum / denominatorSum) * 100
    }
  }
}
