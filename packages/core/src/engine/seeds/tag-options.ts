// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch, TagOption } from '../types.js'
import { cleanString, isPlainObject } from '../validation/primitives.js'

/** Accepted option color format: 6-digit hex, the value `<input type="color">` emits. */
export const TAG_OPTION_COLOR_RE = /^#[0-9a-fA-F]{6}$/

/** True only for a `tags` branch with `multiple === false`. Omitted `multiple` on `tags` means multiple choice. */
export function isSingleChoiceTags(branch: Pick<Branch, 'type' | 'multiple'>): boolean {
  return branch.type === 'tags' && branch.multiple === false
}

/** Option values in declared order; `[]` when the branch has no options. */
export function tagOptionValues(branch: Pick<Branch, 'options'>): string[] {
  return (branch.options ?? []).map(option => option.value)
}

/** The option whose `value` equals `value` exactly, or `undefined`. */
export function findTagOption(branch: Pick<Branch, 'options'>, value: string): TagOption | undefined {
  return branch.options?.find(option => option.value === value)
}

/** Issues for one option entry; `seenValues` accumulates the values already declared on the branch. */
function optionEntryIssues(prefix: string, entry: unknown, index: number, seenValues: Set<string>): string[] {
  if (typeof entry === 'string') {
    return [`${prefix}option #${index} must be an object { value, color }, not a plain string.`]
  }
  if (!isPlainObject(entry)) {
    return [`${prefix}option #${index} must be an object { value, color }.`]
  }

  const issues: string[] = []
  const { value, color } = entry
  const validValue = typeof value === 'string' && value !== '' && value === cleanString(value)
  if (!validValue) {
    issues.push(`${prefix}option #${index} value must be a non-empty string without leading or trailing whitespace.`)
  } else if (seenValues.has(value)) {
    issues.push(`${prefix}duplicate option value '${value}'.`)
  } else {
    seenValues.add(value)
  }
  if (typeof color !== 'string' || !TAG_OPTION_COLOR_RE.test(color)) {
    const optionLabel = validValue ? `'${value}'` : `#${index}`
    issues.push(`${prefix}option ${optionLabel} color must be a hex color #RRGGBB (got '${String(color)}').`)
  }
  return issues
}

function branchTagOptionsIssues(prefix: string, branch: Branch): string[] {
  const raw = branch as unknown as Record<string, unknown>
  const issues: string[] = []

  if (raw.options !== undefined) {
    if (branch.type === 'text') {
      return [
        `${prefix}options are not supported on type 'text'. `
        + `Use type 'tags' with options (add multiple: false for a single choice).`,
      ]
    }
    if (branch.type !== 'tags') {
      return [`${prefix}options are only supported on type 'tags' (got '${String(branch.type)}').`]
    }
  }

  if (branch.type === 'tags') {
    if (raw.multiple !== undefined && typeof raw.multiple !== 'boolean') {
      issues.push(`${prefix}multiple must be a boolean.`)
    }
    if (raw.options !== undefined) {
      if (!Array.isArray(raw.options) || raw.options.length === 0) {
        issues.push(`${prefix}options must be a non-empty array of { value, color } objects.`)
      } else {
        const seenValues = new Set<string>()
        raw.options.forEach((entry: unknown, index) => {
          issues.push(...optionEntryIssues(prefix, entry, index, seenValues))
        })
      }
    }
  }
  return issues
}

/**
 * Seed-definition issues for `options` / `multiple` on this branch AND, recursively, its repeater sub-fields.
 * Pure, never throws, works on untyped input (stored JSON may carry any shape). `[]` = valid.
 */
export function tagOptionsIssues(branch: Branch): string[] {
  const issues = branchTagOptionsIssues(`branch '${branch.alias}': `, branch)
  const subFields = Array.isArray(branch.fields) ? branch.fields : []
  for (const sub of subFields) {
    issues.push(...subFieldIssues(branch.alias, sub))
  }
  return issues
}

function subFieldIssues(parentAlias: string, sub: Branch): string[] {
  const issues = branchTagOptionsIssues(`branch '${parentAlias}': sub-field '${sub.alias}': `, sub)
  const nested = Array.isArray(sub.fields) ? sub.fields : []
  for (const child of nested) {
    issues.push(...subFieldIssues(sub.alias, child))
  }
  return issues
}
