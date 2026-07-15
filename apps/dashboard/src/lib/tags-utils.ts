// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export function parseTagsValue(value: unknown): unknown {
  if (typeof value !== "string") return value

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export interface TagChipData {
  readonly label: string
  readonly color?: string
}

function ownProp(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}

function extractColor(value: unknown): string | undefined {
  if (typeof value === "string") {
    const color = value.trim()
    return color.length > 0 ? color : undefined
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const candidate = [ownProp(obj, "color"), ownProp(obj, "hex"), ownProp(obj, "value")].find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    )
    return candidate?.trim()
  }

  return undefined
}

function extractArrayItemChip(item: unknown): TagChipData | undefined {
  if (typeof item === "string") {
    const label = item.trim()
    return label.length > 0 ? { label } : undefined
  }

  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>
    const labelCandidate = [ownProp(obj, "label"), ownProp(obj, "name"), ownProp(obj, "value")].find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    )
    if (labelCandidate === undefined) {
      console.warn("extractTagChips: dropping unrecognized tag entry", item)
      return undefined
    }
    const colorCandidate = [ownProp(obj, "color"), ownProp(obj, "hex")].find(
      (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
    )
    return { label: labelCandidate.trim(), color: colorCandidate?.trim() }
  }

  console.warn("extractTagChips: dropping unrecognized tag entry", item)
  return undefined
}

export function extractTagChips(value: unknown): TagChipData[] {
  const parsed = parseTagsValue(value)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => extractArrayItemChip(item))
      .filter((tag): tag is TagChipData => tag !== undefined)
  }

  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>)
      .map(([label, rawColor]) => ({
        label: label.trim(),
        color: extractColor(rawColor),
      }))
      .filter((tag) => tag.label.length > 0)
  }

  return []
}

export function extractTagNames(value: unknown): string[] {
  return extractTagChips(value).map((tag) => tag.label)
}
