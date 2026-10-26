// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EXIT_COVERAGE_BELOW_THRESHOLD,
  changedLineCoverage,
  exitCodeFor,
  formatLineRanges,
  lineHitsFromIstanbul,
  mergeChangedLines,
  parseChangedLines,
  unionLineHits,
} from './changed-line-coverage.mjs'

const DIFF = [
  'diff --git a/apps/api/src/a.ts b/apps/api/src/a.ts',
  '--- a/apps/api/src/a.ts',
  '+++ b/apps/api/src/a.ts',
  '@@ -10,0 +11,2 @@ export function a() {',
  '+  guard()',
  '+  return',
  '@@ -40 +42 @@',
  '-  old',
  '+  new',
  '@@ -60,3 +61,0 @@',
  'diff --git a/apps/api/src/new.ts b/apps/api/src/new.ts',
  '--- /dev/null',
  '+++ b/apps/api/src/new.ts',
  '@@ -0,0 +1,3 @@',
  'diff --git a/apps/api/src/gone.ts b/apps/api/src/gone.ts',
  '--- a/apps/api/src/gone.ts',
  '+++ /dev/null',
  '@@ -1,4 +0,0 @@',
].join('\n')

test('parseChangedLines lists the new-side lines of every hunk and ignores pure deletions', () => {
  const changed = parseChangedLines(DIFF)

  assert.deepEqual([...changed.get('apps/api/src/a.ts')].sort((x, y) => x - y), [11, 12, 42])
  assert.deepEqual([...changed.get('apps/api/src/new.ts')], [1, 2, 3])
  assert.equal(changed.has('apps/api/src/gone.ts'), false)
})

test('mergeChangedLines unions the committed, staged and unstaged diffs per file', () => {
  const merged = mergeChangedLines(
    new Map([['a.ts', new Set([1, 2])]]),
    new Map([['a.ts', new Set([2, 3])], ['b.ts', new Set([9])]]),
  )

  assert.deepEqual([...merged.get('a.ts')].sort(), [1, 2, 3])
  assert.deepEqual([...merged.get('b.ts')], [9])
})

const istanbul = {
  statementMap: {
    0: { start: { line: 5 } },
    1: { start: { line: 5 } },
    2: { start: { line: 8 } },
    3: { start: { line: 20 } },
  },
  s: { 0: 0, 1: 4, 2: 0, 3: 7 },
}

test('lineHitsFromIstanbul marks a line executable and takes the highest statement count on it', () => {
  const hits = lineHitsFromIstanbul(istanbul)

  assert.deepEqual([...hits.entries()], [[5, 4], [8, 0], [20, 7]])
})

test('changedLineCoverage judges only changed lines that are executable', () => {
  const hits = lineHitsFromIstanbul(istanbul)

  // Lines 6-7 are changed but hold no statement (comment / blank), line 20 is executable but untouched.
  const result = changedLineCoverage(new Set([5, 6, 7, 8]), hits)

  assert.deepEqual(result, { total: 2, covered: 1, pct: 50, uncovered: [8] })
})

test('changedLineCoverage reports null when no changed line is executable', () => {
  const result = changedLineCoverage(new Set([1, 2]), lineHitsFromIstanbul(istanbul))

  assert.deepEqual(result, { total: 0, covered: 0, pct: null, uncovered: [] })
})

test('changedLineCoverage falls back to the whole file when the changed lines are unknown', () => {
  const result = changedLineCoverage(undefined, lineHitsFromIstanbul(istanbul))

  assert.equal(result.total, 3)
})

test('a line run by only one of two tiers counts as covered after unionLineHits', () => {
  const unitTier = new Map([[10, 3], [11, 0]])
  const flowTier = new Map([[10, 0], [11, 2]])

  const result = changedLineCoverage(new Set([10, 11]), unionLineHits(unitTier, flowTier))

  assert.equal(result.pct, 100)
})

test('formatLineRanges collapses consecutive lines', () => {
  assert.equal(formatLineRanges([3, 4, 5, 9, 11, 12]), '3-5, 9, 11-12')
  assert.equal(formatLineRanges([]), '')
})

test('exitCodeFor keeps a failing test run distinct from a coverage shortfall', () => {
  assert.equal(exitCodeFor({ testsFailed: false, coverageFailed: false }), 0)
  assert.equal(exitCodeFor({ testsFailed: true, coverageFailed: false }), 1)
  assert.equal(exitCodeFor({ testsFailed: true, coverageFailed: true }), 1)
  assert.equal(exitCodeFor({ testsFailed: false, coverageFailed: true }), EXIT_COVERAGE_BELOW_THRESHOLD)
})
