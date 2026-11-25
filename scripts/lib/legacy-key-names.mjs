// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Pure matcher behind section 6 of scripts/docs-fact-check.mjs: which lines of a docs page still name
// the 0.10.x key model. No I/O, so the allowance and multi-line rules are unit-testable.

/** Names and values of the 0.10.x key model. Neither the runtime nor @beechcms/client recognizes them. */
export const LEGACY_KEY_PATTERNS = [
  /\bPUBLIC_(?:READ|WRITE)_API_KEY\b/dg,
  /\bdev-(?:public-)?(?:read|write)-key-changeme\b/dg,
  /\b[A-Z_]*BEECH_(?:READ|WRITE)(?:_API)?_KEY\b/dg,
  /\bbeech_pub_/dg,
  /createBeech(?:Browser|Server)?Client(?:<[^>]*>)?\(\s*\{[^}]*?\b(apiKey)\s*:/dg,
]

/**
 * Prose in the docs site's own sources (copyable LLM prompts, hero text) names the option without a factory call, so
 * the `apiKey` pattern above cannot see it. Applied only to paths under `docs/.vitepress/`, where no third-party
 * `apiKey` (Resend, VirusTotal) appears.
 */
export const LEGACY_KEY_SITE_PATTERNS = [/apiKey/dg]

const SITE_SOURCE_PREFIX = 'docs/.vitepress/'

/** Sections that may name the legacy model: they document the migration away from it. */
export const LEGACY_KEY_ALLOWED_SECTIONS = [
  { file: 'docs/build/cli-workflows.md', heading: '#### Moving a 0.10.x project to publishable and secret keys' },
  { file: 'CHANGELOG.md', heading: '### Upgrading from 0.10.x' },
]

const FENCE_PATTERN = /^\s*(```|~~~)/
const HEADING_PATTERN = /^(#{1,6})\s/

/**
 * Lines of `content` (1-based, inclusive) covered by the allowed sections of `relPath`.
 * @param {string} relPath repo-relative path with forward slashes
 * @param {string[]} lines content split on line breaks
 * @returns {{ start: number, end: number }[]}
 */
function allowedLineRanges(relPath, lines) {
  const headings = LEGACY_KEY_ALLOWED_SECTIONS.filter((section) => section.file === relPath).map(
    (section) => section.heading,
  )
  if (headings.length === 0) return []

  const ranges = []
  let openRange = null
  let insideFence = false

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (FENCE_PATTERN.test(line)) {
      insideFence = !insideFence
      return
    }
    if (insideFence) return

    const headingLevel = HEADING_PATTERN.exec(line)?.[1].length
    if (headingLevel === undefined) return

    if (openRange && headingLevel <= openRange.level) {
      ranges.push({ start: openRange.start, end: lineNumber - 1 })
      openRange = null
    }
    if (!openRange && headings.includes(line.trimEnd())) {
      openRange = { start: lineNumber, level: headingLevel }
    }
  })

  if (openRange) ranges.push({ start: openRange.start, end: lines.length })
  return ranges
}

/**
 * Finds every mention of a 0.10.x key name that is not inside an allowed migration section.
 * @param {string} relPath repo-relative path with forward slashes
 * @param {string} content file content
 * @returns {{ line: number, match: string }[]}
 */
export function findLegacyKeyMentions(relPath, content) {
  const lineStarts = [0]
  for (let offset = 0; offset < content.length; offset++) {
    if (content[offset] === '\n') lineStarts.push(offset + 1)
  }
  const lineOf = (offset) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (lineStarts[middle] <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }

  const allowedRanges = allowedLineRanges(relPath, content.split(/\r?\n/))
  const mentions = []

  const patterns = relPath.startsWith(SITE_SOURCE_PREFIX)
    ? [...LEGACY_KEY_PATTERNS, ...LEGACY_KEY_SITE_PATTERNS]
    : LEGACY_KEY_PATTERNS

  for (const pattern of patterns) {
    for (const found of content.matchAll(pattern)) {
      const hasGroup = found[1] !== undefined
      const offset = hasGroup ? found.indices[1][0] : found.index
      const line = lineOf(offset)
      if (allowedRanges.some((range) => line >= range.start && line <= range.end)) continue
      mentions.push({ line, match: hasGroup ? found[1] : found[0], offset })
    }
  }

  return mentions.sort((a, b) => a.offset - b.offset).map(({ line, match }) => ({ line, match }))
}
