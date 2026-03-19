import { extractTagNames } from "@/lib/tags-utils"

export type FilterGroupType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "tags"
  | "select"
  | "system"

export type FilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_empty"
  | "is_not_empty"

export type ToolbarFilterGroup = {
  columnId: string
  label: string
  type: FilterGroupType
  conditions: Array<{
    id: string
    op: FilterOperator
    value: string | number | boolean | null
  }>
  /** Opzioni predefinite per tipo \"select\" (es. status: [\"draft\",\"published\"]). */
  selectOptions?: string[]
}

export function isToolbarFilterGroup(value: unknown): value is ToolbarFilterGroup {
  if (!value || typeof value !== "object") return false
  const v = value as Partial<ToolbarFilterGroup>
  return (
    typeof v.columnId === "string" &&
    typeof v.label === "string" &&
    typeof v.type === "string" &&
    Array.isArray(v.conditions)
  )
}

export function isEmptyValue(v: unknown) {
  if (v == null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === "object") return Object.keys(v as object).length === 0
  return false
}

export function normalizeDateToYmd(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "string") {
    const trimmed = val.trim()
    if (!trimmed) return null
    // Se è già YYYY-MM-DD, usalo.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === "number") {
    const d = new Date(val)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function matchesCondition(
  cellValue: unknown,
  group: ToolbarFilterGroup,
  op: FilterOperator,
  filterValue: string | number | boolean | null
) {
  if (op === "is_empty") return isEmptyValue(cellValue)
  if (op === "is_not_empty") return !isEmptyValue(cellValue)

  if (group.type === "tags") {
    const keys = extractTagNames(cellValue)

    if (op === "contains") {
      if (typeof filterValue !== "string" || !filterValue.trim()) return true
      return keys.includes(filterValue)
    }

    if (op === "eq") {
      if (typeof filterValue !== "string" || !filterValue.trim()) return true
      return keys.includes(filterValue)
    }
  }

  if (group.type === "number") {
    const n =
      typeof cellValue === "number"
        ? cellValue
        : typeof cellValue === "string" && cellValue.trim() !== ""
          ? Number(cellValue)
          : null
    const f = typeof filterValue === "number" ? filterValue : null
    if (n == null || f == null || Number.isNaN(n) || Number.isNaN(f)) return true
    if (op === "eq") return n === f
    if (op === "gt") return n > f
    if (op === "gte") return n >= f
    if (op === "lt") return n < f
    if (op === "lte") return n <= f
    return true
  }

  if (group.type === "date") {
    const d = normalizeDateToYmd(cellValue)
    const f =
      typeof filterValue === "string" ? normalizeDateToYmd(filterValue) : null
    if (!d || !f) return true
    if (op === "eq") return d === f
    if (op === "gt") return d > f
    if (op === "gte") return d >= f
    if (op === "lt") return d < f
    if (op === "lte") return d <= f
    return true
  }

  if (group.type === "boolean") {
    const b = typeof cellValue === "boolean" ? cellValue : null
    const f = typeof filterValue === "boolean" ? filterValue : null
    if (b == null || f == null) return true
    return op === "eq" ? b === f : true
  }

  if (group.type === "select") {
    const s = cellValue == null ? "" : String(cellValue)
    if (op === "eq") {
      if (filterValue == null) return true
      const f = String(filterValue)
      if (!f.trim()) return true
      return s.trim().toLowerCase() === f.trim().toLowerCase()
    }
    return true
  }

  // text/system fallback
  const s = cellValue == null ? "" : String(cellValue)
  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return true
    return s.toLowerCase().includes(filterValue.toLowerCase())
  }
  if (op === "eq") {
    if (filterValue == null) return true
    const f = String(filterValue)
    if (!f.trim()) return true
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }
  return true
}

export function matchesFilterGroup(cellValue: unknown, filterValue: unknown) {
  if (!isToolbarFilterGroup(filterValue)) return true
  // AND tra condizioni della stessa colonna
  for (const cond of filterValue.conditions) {
    if (!matchesCondition(cellValue, filterValue, cond.op, cond.value)) {
      return false
    }
  }
  return true
}

/**
 * Variante "strict" del matching: pensata per usi di tipo UI feedback (es. colori condizionali).
 *
 * Differenze rispetto a `matchesCondition`/`matchesFilterGroup`:
 * - quando i dati non sono comparabili (valori null/invalidi o filtro vuoto) ⇒ **false** (non matcha),
 *   evitando evidenziazioni spurie.
 * - i filtri toolbar restano "lenient" e continuano a usare `matchesFilterGroup`.
 */
export function matchesConditionStrict(
  cellValue: unknown,
  group: ToolbarFilterGroup,
  op: FilterOperator,
  filterValue: string | number | boolean | null
) {
  if (op === "is_empty") return isEmptyValue(cellValue)
  if (op === "is_not_empty") return !isEmptyValue(cellValue)

  if (group.type === "tags") {
    const keys = extractTagNames(cellValue)
    if (typeof filterValue !== "string" || !filterValue.trim()) return false
    if (keys.length === 0) return false
    if (op === "contains" || op === "eq") return keys.includes(filterValue)
    return false
  }

  if (group.type === "number") {
    const n =
      typeof cellValue === "number"
        ? cellValue
        : typeof cellValue === "string" && cellValue.trim() !== ""
          ? Number(cellValue)
          : null
    const f = typeof filterValue === "number" ? filterValue : null
    if (n == null || f == null || Number.isNaN(n) || Number.isNaN(f)) return false
    if (op === "eq") return n === f
    if (op === "gt") return n > f
    if (op === "gte") return n >= f
    if (op === "lt") return n < f
    if (op === "lte") return n <= f
    return false
  }

  if (group.type === "date") {
    const d = normalizeDateToYmd(cellValue)
    const f =
      typeof filterValue === "string" ? normalizeDateToYmd(filterValue) : null
    if (!d || !f) return false
    if (op === "eq") return d === f
    if (op === "gt") return d > f
    if (op === "gte") return d >= f
    if (op === "lt") return d < f
    if (op === "lte") return d <= f
    return false
  }

  if (group.type === "boolean") {
    const b = typeof cellValue === "boolean" ? cellValue : null
    const f = typeof filterValue === "boolean" ? filterValue : null
    if (b == null || f == null) return false
    return op === "eq" ? b === f : false
  }

  if (group.type === "select") {
    const s = cellValue == null ? "" : String(cellValue)
    if (op !== "eq") return false
    if (filterValue == null) return false
    const f = String(filterValue)
    if (!f.trim()) return false
    if (!s.trim()) return false
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }

  // text/system fallback
  const s = cellValue == null ? "" : String(cellValue)
  if (op === "contains") {
    if (typeof filterValue !== "string" || !filterValue.trim()) return false
    if (!s.trim()) return false
    return s.toLowerCase().includes(filterValue.toLowerCase())
  }
  if (op === "eq") {
    if (filterValue == null) return false
    const f = String(filterValue)
    if (!f.trim()) return false
    if (!s.trim()) return false
    return s.trim().toLowerCase() === f.trim().toLowerCase()
  }
  return false
}

export function matchesFilterGroupStrict(cellValue: unknown, filterValue: unknown) {
  if (!isToolbarFilterGroup(filterValue)) return false
  for (const cond of filterValue.conditions) {
    if (!matchesConditionStrict(cellValue, filterValue, cond.op, cond.value)) {
      return false
    }
  }
  return true
}

