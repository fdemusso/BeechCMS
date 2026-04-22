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

function extractColor(value: unknown): string | undefined {
  if (typeof value === "string") {
    const color = value.trim()
    return color.length > 0 ? color : undefined
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const candidate = [obj.color, obj.hex, obj.value].find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    )
    return candidate?.trim()
  }

  return undefined
}

export function extractTagChips(value: unknown): TagChipData[] {
  const parsed = parseTagsValue(value)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .map((label) => ({ label }))
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
