// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Pure helpers behind scripts/test-coverage-diff.mjs: which lines a branch changed, which of them
// the tests executed, and how the run maps to an exit code. No I/O, so each rule is unit-testable.

/** Exit code when every selected test run passed but changed-line coverage is below threshold. */
export const EXIT_COVERAGE_BELOW_THRESHOLD = 2

/**
 * Reads the new-side line numbers of every hunk in `git diff -U0` output.
 * @param {string} diffText
 * @returns {Map<string, Set<number>>} repo-relative path → changed line numbers (1-based)
 */
export function parseChangedLines(diffText) {
  /** @type {Map<string, Set<number>>} */
  const byFile = new Map()
  let current = null

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim()
      // `+++ /dev/null` marks a deleted file: nothing on the new side to cover.
      current = target === '/dev/null' ? null : target.replace(/^b\//, '')
      if (current && !byFile.has(current)) byFile.set(current, new Set())
      continue
    }
    if (!current) continue

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (!hunk) continue
    const start = Number(hunk[1])
    const count = hunk[2] === undefined ? 1 : Number(hunk[2])
    const lines = byFile.get(current)
    for (let n = start; n < start + count; n++) lines.add(n)
  }

  return byFile
}

/**
 * @param {...Map<string, Set<number>>} maps
 * @returns {Map<string, Set<number>>} per-file union (committed + staged + unstaged diffs)
 */
export function mergeChangedLines(...maps) {
  /** @type {Map<string, Set<number>>} */
  const merged = new Map()
  for (const map of maps) {
    for (const [file, lines] of map) {
      const into = merged.get(file) ?? new Set()
      for (const n of lines) into.add(n)
      merged.set(file, into)
    }
  }
  return merged
}

/**
 * Istanbul line coverage: a line is executable when a statement starts on it; its hit count is the
 * highest count among those statements.
 * @param {{ statementMap: Record<string, { start: { line: number } }>, s: Record<string, number> }} fileCoverage
 * @returns {Map<number, number>} executable line → hits
 */
export function lineHitsFromIstanbul(fileCoverage) {
  /** @type {Map<number, number>} */
  const hits = new Map()
  for (const [id, location] of Object.entries(fileCoverage.statementMap)) {
    const line = location.start.line
    const count = fileCoverage.s[id] ?? 0
    hits.set(line, Math.max(hits.get(line) ?? 0, count))
  }
  return hits
}

/**
 * Combines the same file measured by several tiers: a line counts as covered if any tier ran it.
 * @param {Map<number, number>} a
 * @param {Map<number, number>} b
 * @returns {Map<number, number>}
 */
export function unionLineHits(a, b) {
  const merged = new Map(a)
  for (const [line, count] of b) merged.set(line, (merged.get(line) ?? 0) + count)
  return merged
}

/**
 * @param {Set<number> | undefined} changed changed lines of the file; undefined = unknown, judge every line
 * @param {Map<number, number>} lineHits executable line → hits
 * @returns {{ total: number, covered: number, pct: number | null, uncovered: number[] }}
 *   `pct` is null when no changed line is executable (comments, types, blank lines).
 */
export function changedLineCoverage(changed, lineHits) {
  const executable = [...lineHits.keys()].filter((line) => !changed || changed.has(line)).sort((x, y) => x - y)
  const uncovered = executable.filter((line) => lineHits.get(line) === 0)
  const covered = executable.length - uncovered.length
  return {
    total: executable.length,
    covered,
    pct: executable.length === 0 ? null : (covered / executable.length) * 100,
    uncovered,
  }
}

/**
 * Compact "12, 14-16, 20" rendering of line numbers.
 * @param {number[]} lines ascending
 */
export function formatLineRanges(lines) {
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    let end = i
    while (lines[end + 1] === lines[end] + 1) end++
    ranges.push(end === i ? String(lines[i]) : `${lines[i]}-${lines[end]}`)
    i = end
  }
  return ranges.join(', ')
}

/**
 * Test results and coverage stay separate verdicts so a coverage shortfall never masks a failing
 * test, and a passing run never hides a shortfall.
 * @param {{ testsFailed: boolean, coverageFailed: boolean }} verdict
 * @returns {number} 0 = both fine, 1 = a test run failed, EXIT_COVERAGE_BELOW_THRESHOLD = coverage only
 */
export function exitCodeFor({ testsFailed, coverageFailed }) {
  if (testsFailed) return 1
  return coverageFailed ? EXIT_COVERAGE_BELOW_THRESHOLD : 0
}
