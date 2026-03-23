export function parseTagsValue(value: unknown): unknown {
  if (typeof value !== "string") return value

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

export function extractTagNames(value: unknown): string[] {
  const parsed = parseTagsValue(value)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed as Record<string, unknown>)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}
