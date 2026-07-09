// SPDX-License-Identifier: MIT
import type {
  Seed,
  Branch,
  BranchType,
  FilterGroup,
  FilterType,
  FilterCondition,
  SelectOptions,
  ParameterizedQuery,
} from './types.js';


/**
 * Checks if a branch represents a multiple asset list field.
 * 
 * @param branch The branch definition.
 * @returns True if it's an asset list, false otherwise.
 */
function isAssetListBranch(branch: Branch): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}


/**
 * Normalizes an unknown value to a valid HTTP URL string, or null.
 * 
 * @param value The value to normalize.
 * @returns The normalized URL string, or null if invalid.
 */
function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned) return null
  try {
    const parsed = new URL(cleaned)
    return parsed.protocol.startsWith('http') ? cleaned : null
  } catch {
    return null
  }
}


/**
 * Safely parses a JSON string, falling back to the raw string on error.
 * 
 * @param value The string to parse.
 * @returns The parsed object, or the original string.
 */
function parseJsonSafe(value: string): unknown {
  try { return JSON.parse(value) } catch { return value }
}


/**
 * Normalizes raw asset list values to a flat list of valid URL strings.
 * 
 * @param rawValue The raw value (string, array, or object) to normalize.
 * @returns An array of unique normalized URL strings.
 */
function normalizeAssetListValue(rawValue: unknown): string[] {
  const input = typeof rawValue === 'string' ? parseJsonSafe(rawValue) : rawValue
  const values = Array.isArray(input) ? input : [input]
  const normalized: string[] = []
  for (const item of values) {
    if (item == null) continue
    const direct = normalizeHttpUrl(item)
    if (direct) { normalized.push(direct); continue }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const fromObj = normalizeHttpUrl((item as Record<string, unknown>).url)
      if (fromObj) normalized.push(fromObj)
    }
  }
  return [...new Set(normalized)]
}


/**
 * Serializes a value for writing to the DB.
 * boolean → 0/1 | date → Unix timestamp | json/tags/richtext/repeater → JSON string
 * 
 * @param branch The branch definition.
 * @param value The value to serialize.
 * @returns The serialized DB value (string, number, or null).
 */
export function serializeForDb(branch: Branch, value: unknown): string | number | null {
  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value ? 1 : 0

    case 'json':
    case 'tags':
    case 'richtext':
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'date': {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return null
        if (branch.format === 'date') {
          const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
          return Math.floor(midnight / 1000)
        }
        return Math.floor(d.getTime() / 1000)
      }
      return null
    }

    case 'file':
      if (isAssetListBranch(branch)) {
        return Array.isArray(value) ? JSON.stringify(value) : typeof value === 'string' ? value : null
      }
      return typeof value === 'string' ? value : null

    case 'repeater':
      return JSON.stringify(Array.isArray(value) ? value : [])

    default:
      return typeof value === 'string' ? value : typeof value === 'number' ? value : null
  }
}


/**
 * Deserializes a value read from the DB to its API/JS representation.
 * 0/1 → boolean | Unix timestamp → ISO 8601 | JSON string → object/array
 * 
 * @param branch The branch definition.
 * @param value The raw database value.
 * @returns The deserialized value.
 */
export function deserializeFromDb(branch: Branch, value: unknown): unknown {
  if (branch.type === 'repeater') {
    if (typeof value !== 'string' || value.length === 0) return []
    const parsed = parseJsonSafe(value)
    return Array.isArray(parsed) ? parsed : []
  }

  if (value === null || value === undefined) return null

  switch (branch.type) {
    case 'boolean':
      return value === 1 || value === true

    case 'json':
    case 'tags':
    case 'richtext': {
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return value }
      }
      return value
    }

    case 'date': {
      if (typeof value !== 'number') return null
      const d = new Date(value * 1000)
      return branch.format === 'date' ? d.toISOString().slice(0, 10) : d.toISOString()
    }

    case 'file':
      if (isAssetListBranch(branch)) return normalizeAssetListValue(value)
      return typeof value === 'string' ? value : null

    default:
      return value
  }
}
